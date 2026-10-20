package game

import (
	"encoding/json"
	"math/rand"
	"strconv"

	"../engine/assets"
	"../engine/mathx"
	"../engine/rendering"
	"../engine/scene"
	"../engine/systems"
)

const arenaMaxRaycastDistance = float32(500)

// SpawnPoint is a player start: position and Euler rotation in radians.
type SpawnPoint struct {
	Position mathx.Vec3
	Rotation mathx.Vec3
}

// PickupSpawn places a pickup of Type at Position.
type PickupSpawn struct {
	Type     string
	Position mathx.Vec3
}

// ArenaLightGrid is the optional baked ambient probe grid.
type ArenaLightGrid struct {
	Src    string
	Origin []float32
	Counts []int
	Step   []float32
}

// ArenaConfig is a decoded config.arena document.
type ArenaConfig struct {
	Skybox         string
	Chunks         []string
	HasDirectional bool
	Direction      []float32
	LightColor     []float32
	LightGrid      *ArenaLightGrid
	SpawnPoints    []*SpawnPoint
	Pickups        []PickupSpawn
}

type rawDirectional struct {
	Direction []float32 `json:"direction"`
	Color     []float32 `json:"color"`
}

type rawLightGrid struct {
	Src    string    `json:"src"`
	Origin []float32 `json:"origin"`
	Step   []float32 `json:"step"`
	Counts []int     `json:"counts"`
}

type rawSpawnPoint struct {
	Position []float32 `json:"position"`
	Rotation []float32 `json:"rotation"`
}

type rawPickupSpawn struct {
	Type     string    `json:"type"`
	Position []float32 `json:"position"`
}

type rawArenaConfig struct {
	Skybox      any               `json:"skybox"`
	Chunks      []string          `json:"chunks"`
	Directional *rawDirectional   `json:"directional"`
	LightGrid   *rawLightGrid     `json:"lightGrid"`
	SpawnPoints []*rawSpawnPoint  `json:"spawnpoints"`
	SpawnPoint  *rawSpawnPoint    `json:"spawnpoint"`
	Pickups     []*rawPickupSpawn `json:"pickups"`
}

// ParseArenaConfig decodes a config.arena JSON document; nil when invalid.
func ParseArenaConfig(text string) *ArenaConfig {
	if text == "" || text == "null" {
		return nil
	}
	var raw rawArenaConfig
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return nil
	}
	cfg := &ArenaConfig{
		Chunks:      make([]string, 0),
		SpawnPoints: make([]*SpawnPoint, 0),
		Pickups:     make([]PickupSpawn, 0),
	}
	if raw.Skybox != nil {
		if s, ok := raw.Skybox.(string); ok {
			cfg.Skybox = s
		} else {
			cfg.Skybox = strconv.Itoa(int(raw.Skybox.(float64)))
		}
	}
	if len(raw.Chunks) > 0 {
		cfg.Chunks = raw.Chunks
	}
	if raw.Directional != nil {
		cfg.HasDirectional = true
		dir := raw.Directional.Direction
		if len(dir) == 0 {
			dir = []float32{0.5, 1.0, 0.3}
		}
		col := raw.Directional.Color
		if len(col) == 0 {
			col = []float32{1, 1, 1}
		}
		cfg.Direction = dir
		cfg.LightColor = col
	}
	if raw.LightGrid != nil && len(raw.LightGrid.Origin) > 0 {
		lg := raw.LightGrid
		grid := &ArenaLightGrid{
			Src:    lg.Src,
			Origin: lg.Origin,
			Step:   lg.Step,
			Counts: lg.Counts,
		}
		if grid.Counts == nil {
			grid.Counts = make([]int, 0)
		}
		cfg.LightGrid = grid
	}
	if len(raw.SpawnPoints) > 0 {
		for i := 0; i < len(raw.SpawnPoints); i++ {
			cfg.SpawnPoints = append(cfg.SpawnPoints, parseSpawnPoint(raw.SpawnPoints[i]))
		}
	} else if raw.SpawnPoint != nil {
		cfg.SpawnPoints = append(cfg.SpawnPoints, parseSpawnPoint(raw.SpawnPoint))
	}
	if len(raw.Pickups) > 0 {
		for i := 0; i < len(raw.Pickups); i++ {
			item := raw.Pickups[i]
			if item == nil || item.Type == "" {
				continue
			}
			spawn := PickupSpawn{Type: item.Type}
			setVec3(&spawn.Position, item.Position)
			cfg.Pickups = append(cfg.Pickups, spawn)
		}
	}
	return cfg
}

func parseSpawnPoint(sp *rawSpawnPoint) *SpawnPoint {
	out := &SpawnPoint{}
	if sp != nil {
		setVec3(&out.Position, sp.Position)
		setVec3(&out.Rotation, sp.Rotation)
	}
	return out
}

func setVec3(out *mathx.Vec3, coords []float32) {
	if len(coords) >= 3 {
		out.Set(coords[0], coords[1], coords[2])
	}
}

// Arena loads a map into the scene (arena.js): camera start, light grid,
// directional light, skybox, static chunks, pickups and NPC stand-ins at the
// unused spawn points.
type Arena struct {
	Scene   *scene.Scene
	Camera  *systems.Camera
	Pickups *PickupSystem

	Config     *ArenaConfig
	SpawnPoint *SpawnPoint
	Name       string

	// SkyboxMesh is the shared cube the skybox entity renders (normally the
	// renderer's Shapes.SkyBox). Nil in headless tests.
	SkyboxMesh *rendering.Mesh

	// OnLoadStart / OnLoadEnd bracket Load (loading screen hooks).
	OnLoadStart func()
	OnLoadEnd   func()
}

// NewArena creates an arena loader bound to scene, camera and pickup system.
func NewArena(s *scene.Scene, camera *systems.Camera, pickups *PickupSystem) *Arena {
	return &Arena{Scene: s, Camera: camera, Pickups: pickups}
}

// Load fetches resources/arenas/<name>/config.arena and builds the scene.
// Returns false on failure.
async func (a *Arena) Load(name string) bool {
	if a.OnLoadStart != nil {
		a.OnLoadStart()
	}
	ok := await a.load(name)
	if a.OnLoadEnd != nil {
		a.OnLoadEnd()
	}
	return ok
}

async func (a *Arena) load(name string) bool {
	r := assets.GlobalResources
	text := await r.Fetch(r.BasePath + "arenas/" + name + "/config.arena")
	if text == nil {
		systems.GlobalConsole.Warn("[Arena] Failed to load arena " + name + ": config not found")
		a.Config = nil
		return false
	}
	cfg := ParseArenaConfig(text.(string))
	if cfg == nil {
		systems.GlobalConsole.Warn("[Arena] Failed to load arena " + name + ": invalid arena data")
		a.Config = nil
		return false
	}

	// Make sure every referenced asset is resident before building entities.
	await r.Load(a.requiredResources(cfg))

	a.Name = name
	a.Config = cfg
	if err := a.Build(cfg); err != nil {
		systems.GlobalConsole.Warn("[Arena] Failed to load arena " + name + ": " + err.Error())
		a.Config = nil
		return false
	}
	systems.GlobalConsole.Log("[Arena] Loaded arena: " + name)
	return true
}

// requiredResources lists the assets the arena entities need.
func (a *Arena) requiredResources(cfg *ArenaConfig) []string {
	paths := make([]string, 0)
	for i := 0; i < len(cfg.Chunks); i++ {
		paths = append(paths, cfg.Chunks[i])
	}
	if cfg.LightGrid != nil && cfg.LightGrid.Src != "" {
		paths = append(paths, cfg.LightGrid.Src)
	}
	for i := 0; i < len(cfg.Pickups); i++ {
		if def, ok := PickupDefs[cfg.Pickups[i].Type]; ok {
			paths = append(paths, def.MeshName)
		}
	}
	if len(cfg.SpawnPoints) > 1 {
		paths = append(paths, ArenaNPCMesh, ArenaNPCAnim)
	}
	return paths
}

// Build populates the scene from an already-loaded config (synchronous part
// of Load; assets must be resident).
func (a *Arena) Build(cfg *ArenaConfig) error {
	a.Config = cfg
	a.Scene.Init()

	// Random spawn point.
	a.SpawnPoint = &SpawnPoint{}
	if len(cfg.SpawnPoints) > 0 {
		idx := rand.Intn(len(cfg.SpawnPoints))
		a.SpawnPoint = cfg.SpawnPoints[idx]
		systems.GlobalConsole.Log("[Arena] Selected spawn point " + strconv.Itoa(idx) + " from " + strconv.Itoa(len(cfg.SpawnPoints)) + " available.")
	}

	if a.Camera != nil {
		p := &a.SpawnPoint.Position
		a.Camera.SetPosition(p.X, p.Y, p.Z)
		rot := &a.SpawnPoint.Rotation
		a.Camera.SetRotation(ToDegree(rot.X), ToDegree(rot.Y), ToDegree(rot.Z))
	}

	a.setupLighting(cfg)
	if err := a.setupEnvironment(cfg); err != nil {
		return err
	}

	if a.Pickups != nil {
		a.Pickups.Reset()
		for i := 0; i < len(cfg.Pickups); i++ {
			spawn := &cfg.Pickups[i]
			entities := a.Pickups.CreatePickup(spawn.Type, &spawn.Position)
			if entities != nil {
				a.Scene.AddEntities(entities)
			}
		}
	}

	a.setupSpawnPointModels(cfg)
	return nil
}

func (a *Arena) setupLighting(cfg *ArenaConfig) {
	if cfg.LightGrid != nil && cfg.LightGrid.Src != "" {
		data := assets.GlobalResources.GetBytes(cfg.LightGrid.Src)
		if data != nil {
			a.Scene.LightGrid().Load(&scene.LightGridConfig{
				Origin: cfg.LightGrid.Origin,
				Counts: cfg.LightGrid.Counts,
				Step:   cfg.LightGrid.Step,
			}, data)
		}
	}
	if cfg.HasDirectional {
		a.Scene.AddEntity(scene.NewDirectionalLightEntity(cfg.Direction, cfg.LightColor, nil))
	}
}

func (a *Arena) setupEnvironment(cfg *ArenaConfig) error {
	if cfg.Skybox != "" {
		a.Scene.AddEntity(scene.NewSkyboxEntity(cfg.Skybox, a.SkyboxMesh, nil))
		// The shared skybox cube was just renamed to this arena's materials.
		assets.GlobalResources.BindMesh(a.SkyboxMesh)
	}
	for i := 0; i < len(cfg.Chunks); i++ {
		mesh := assets.GlobalResources.GetMesh(cfg.Chunks[i])
		if mesh == nil {
			systems.GlobalConsole.Warn("[Arena] Missing chunk mesh: " + cfg.Chunks[i])
			continue
		}
		entity := scene.NewMeshEntity(scene.TypeMesh, nil, mesh, nil, 1)
		if err := a.Scene.AddStaticGeometry(entity); err != nil {
			systems.GlobalConsole.Warn("[Arena] Failed to add static geometry chunk " + cfg.Chunks[i] + ": " + err.Error())
		}
		a.Scene.AddEntity(entity)
	}
	if err := a.Scene.FinalizeStaticGeometry(); err != nil {
		systems.GlobalConsole.Warn("[Arena] Failed to finalize static collision: " + err.Error())
		return err
	}
	return nil
}

// groundHeight raycasts down from just above (x,y,z) to snap NPCs to the floor.
func (a *Arena) groundHeight(x, y, z float32) float32 {
	result := a.Scene.RaycastStatic(x, y+100, z, x, y-arenaMaxRaycastDistance, z, nil)
	if result != nil && result.HasHit {
		return result.HitPointWorld.Y
	}
	return y
}

// setupSpawnPointModels places an animated robot at every unused spawn point.
func (a *Arena) setupSpawnPointModels(cfg *ArenaConfig) {
	if len(cfg.SpawnPoints) < 2 {
		return
	}
	r := assets.GlobalResources
	mesh := r.GetSkinnedMesh(ArenaNPCMesh)
	skeleton := r.GetSkeleton(ArenaNPCMesh)
	anim := r.GetAnimation(ArenaNPCAnim)
	if mesh == nil {
		return
	}
	for i := 0; i < len(cfg.SpawnPoints); i++ {
		sp := cfg.SpawnPoints[i]
		if sp == a.SpawnPoint {
			continue
		}
		pos := &sp.Position
		groundY := a.groundHeight(pos.X, pos.Y, pos.Z)

		character := scene.NewSkinnedMeshEntity(mathx.NewVec3(pos.X, groundY, pos.Z), mesh, skeleton, nil, ArenaNPCScale)
		character.Base.CastShadow = true
		character.PlayAnimation(anim, true)

		// Yaw first, then stand upright, then scale.
		m := character.Base.BaseMatrix
		mathx.Mat4RotateY(m, m, sp.Rotation.Y)
		mathx.Mat4RotateX(m, m, ToRadian(-90))
		s := ArenaNPCMatrixScale
		mathx.Mat4Scale(m, m, mathx.NewVec3(s, s, s))

		a.Scene.AddEntity(character)
	}
}
