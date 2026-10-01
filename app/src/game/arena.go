package game

import (
	"math/rand"
	"strconv"

	"../engine/assets"
	"../engine/physics"
	"../engine/rendering"
	"../engine/scene"
	"../engine/systems"
)

const arenaMaxRaycastDistance = float32(500)

// SpawnPoint is a player start: position and Euler rotation in radians.
type SpawnPoint struct {
	Position physics.Vec3
	Rotation physics.Vec3
}

// PickupSpawn places a pickup of Type at Position.
type PickupSpawn struct {
	Type     string
	Position physics.Vec3
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

// ParseArenaConfig decodes a config.arena JSON document; nil when invalid.
func ParseArenaConfig(text string) *ArenaConfig {
	parsed := JSON.parse(text)
	if parsed == nil {
		return nil
	}
	cfg := &ArenaConfig{
		Chunks:      make([]string, 0),
		SpawnPoints: make([]*SpawnPoint, 0),
		Pickups:     make([]PickupSpawn, 0),
	}
	if parsed.skybox != nil {
		if s, ok := parsed.skybox.(string); ok {
			cfg.Skybox = s
		} else {
			cfg.Skybox = strconv.Itoa(int(parsed.skybox.(float64)))
		}
	}
	if parsed.chunks != nil {
		chunks := parsed.chunks.([]any)
		for i := 0; i < len(chunks); i++ {
			cfg.Chunks = append(cfg.Chunks, chunks[i].(string))
		}
	}
	if parsed.directional != nil {
		cfg.HasDirectional = true
		cfg.Direction = floatsOr(parsed.directional.direction, []float32{0.5, 1.0, 0.3})
		cfg.LightColor = floatsOr(parsed.directional.color, []float32{1, 1, 1})
	}
	if parsed.lightGrid != nil && parsed.lightGrid.origin != nil {
		lg := parsed.lightGrid
		grid := &ArenaLightGrid{
			Origin: floatsOr(lg.origin, nil),
			Step:   floatsOr(lg.step, nil),
			Counts: make([]int, 0),
		}
		if lg.src != nil {
			grid.Src = lg.src.(string)
		}
		if lg.counts != nil {
			counts := lg.counts.([]any)
			for i := 0; i < len(counts); i++ {
				grid.Counts = append(grid.Counts, int(counts[i].(float64)))
			}
		}
		cfg.LightGrid = grid
	}
	if parsed.spawnpoints != nil {
		sps := parsed.spawnpoints.([]any)
		for i := 0; i < len(sps); i++ {
			cfg.SpawnPoints = append(cfg.SpawnPoints, parseSpawnPoint(sps[i]))
		}
	} else if parsed.spawnpoint != nil {
		cfg.SpawnPoints = append(cfg.SpawnPoints, parseSpawnPoint(parsed.spawnpoint))
	}
	if parsed.pickups != nil {
		items := parsed.pickups.([]any)
		for i := 0; i < len(items); i++ {
			item := items[i]
			if item == nil || item["type"] == nil {
				continue
			}
			spawn := PickupSpawn{Type: item["type"].(string)}
			setVec3(&spawn.Position, item.position)
			cfg.Pickups = append(cfg.Pickups, spawn)
		}
	}
	return cfg
}

func parseSpawnPoint(v any) *SpawnPoint {
	sp := &SpawnPoint{}
	if v != nil {
		setVec3(&sp.Position, v.position)
		setVec3(&sp.Rotation, v.rotation)
	}
	return sp
}

func setVec3(out *physics.Vec3, v any) {
	if v == nil {
		return
	}
	arr := v.([]any)
	if len(arr) >= 3 {
		out.Set(float32(arr[0].(float64)), float32(arr[1].(float64)), float32(arr[2].(float64)))
	}
}

func floatsOr(v any, def []float32) []float32 {
	if v == nil {
		return def
	}
	arr := v.([]any)
	out := make([]float32, len(arr))
	for i := 0; i < len(arr); i++ {
		out[i] = float32(arr[i].(float64))
	}
	return out
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
	a.Build(cfg)
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
func (a *Arena) Build(cfg *ArenaConfig) {
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
	a.setupEnvironment(cfg)

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

func (a *Arena) setupEnvironment(cfg *ArenaConfig) {
	if cfg.Skybox != "" {
		a.Scene.AddEntity(scene.NewSkyboxEntity(cfg.Skybox, nil))
		// The shared skybox cube was just renamed to this arena's materials.
		assets.GlobalResources.BindMesh(rendering.GlobalShapes.SkyBox)
	}
	for i := 0; i < len(cfg.Chunks); i++ {
		mesh := assets.GlobalResources.GetMesh(cfg.Chunks[i])
		if mesh == nil {
			continue
		}
		entity := scene.NewMeshEntity(scene.TypeMesh, nil, mesh, nil, 1)
		a.Scene.AddStaticGeometry(entity)
		a.Scene.AddEntity(entity)
	}
	a.Scene.FinalizeStaticGeometry()
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

		character := scene.NewSkinnedMeshEntity(physics.NewVec3(pos.X, groundY, pos.Z), mesh, skeleton, nil, ArenaNPCScale)
		character.Base.CastShadow = true
		character.PlayAnimation(anim, true)

		// Yaw first, then stand upright, then scale.
		m := character.Base.BaseMatrix
		physics.Mat4RotateY(m, m, sp.Rotation.Y)
		physics.Mat4RotateX(m, m, ToRadian(-90))
		s := ArenaNPCMatrixScale
		physics.Mat4Scale(m, m, physics.NewVec3(s, s, s))

		a.Scene.AddEntity(character)
	}
}
