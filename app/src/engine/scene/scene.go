package scene

import (
	"math"

	"../physics"
	"../rendering"
	"../systems"
)

// entityList is a growable slice with an explicit Count so per-frame clears
// and swap-removes never allocate.
type entityList struct {
	Items []Entity
	Count int
}

func newEntityList(capacity int) *entityList {
	return &entityList{Items: make([]Entity, capacity)}
}

func (l *entityList) Add(e Entity) {
	if l.Count >= len(l.Items) {
		newCap := len(l.Items) * 2
		if newCap < 8 {
			newCap = 8
		}
		grown := make([]Entity, newCap)
		for i := 0; i < l.Count; i++ {
			grown[i] = l.Items[i]
		}
		l.Items = grown
	}
	l.Items[l.Count] = e
	l.Count++
}

func (l *entityList) IndexOf(e Entity) int {
	for i := 0; i < l.Count; i++ {
		if l.Items[i] == e {
			return i
		}
	}
	return -1
}

func (l *entityList) SwapRemove(index int) {
	l.Count--
	l.Items[index] = l.Items[l.Count]
	l.Items[l.Count] = nil
}

func (l *entityList) Clear() {
	for i := 0; i < l.Count; i++ {
		l.Items[i] = nil
	}
	l.Count = 0
}

// Scene owns entities, the merged static collision trimesh, ambient lighting
// and drives per-pass rendering through rendering.SceneSource.
type Scene struct {
	// Camera supplies view transforms/position to passes and entities.
	Camera *systems.Camera

	entities    *entityList
	collidables *entityList
	byType      []*entityList
	visible     []*entityList

	ambient   []float32
	lightGrid *LightGrid
	paused    bool

	staticTrimesh *physics.Trimesh
	staticMatrix  physics.Mat4

	ray         *physics.Ray
	defaultOpts *physics.RayOptions

	// Render-pass state (see renderpasses.go).
	renderFrame       int
	shadowFrame       int
	lightsSortedFrame int
	pointSorter       *rendering.LightSorter
	spotSorter        *rendering.LightSorter
	lighting          *rendering.LightingData
	shadowSort        *scoreList
	transparentSort   *scoreList
	probePos          *physics.Vec3
	probeMatrix       physics.Mat4
	identity          physics.Mat4
	ambientOut        []float32
	pendingRemoval    bool
}

var defaultAmbient = []float32{0.5, 0.5, 0.5}

// NewScene creates an empty scene and installs it as the static raycast provider.
func NewScene(camera *systems.Camera) *Scene {
	s := &Scene{
		Camera:            camera,
		entities:          newEntityList(64),
		collidables:       newEntityList(16),
		byType:            make([]*entityList, TypeCount),
		visible:           make([]*entityList, TypeCount),
		ambient:           make([]float32, 3),
		lightGrid:         NewLightGrid(),
		staticMatrix:      physics.NewMat4(),
		ray:               physics.NewRay(nil, nil),
		defaultOpts:       &physics.RayOptions{SkipBackfaces: true, CollisionFilterMask: 1, Mode: physics.RayModeClosest},
		lightsSortedFrame: -1,
		pointSorter:       rendering.NewLightSorter(64),
		spotSorter:        rendering.NewLightSorter(64),
		lighting:          rendering.NewLightingData(),
		shadowSort:        newScoreList(64),
		transparentSort:   newScoreList(64),
		probePos:          &physics.Vec3{},
		probeMatrix:       physics.NewMat4(),
		identity:          physics.NewMat4(),
		ambientOut:        make([]float32, 3),
	}
	for t := 1; t < TypeCount; t++ {
		s.byType[t] = newEntityList(16)
		s.visible[t] = newEntityList(16)
	}
	s.SetAmbient(defaultAmbient[0], defaultAmbient[1], defaultAmbient[2])
	// Closure rather than a method value: GoFront emits method values unbound.
	physics.GlobalRaycastStatic = func(fromX, fromY, fromZ, toX, toY, toZ float32, options *physics.RayOptions, out *physics.RaycastResult) *physics.RaycastResult {
		return s.raycastStaticProvider(fromX, fromY, fromZ, toX, toY, toZ, options, out)
	}
	return s
}

// ---------------------------------------------------------------------------
// Entity management
// ---------------------------------------------------------------------------

// entityTypeMatches checks that a built-in Type id is carried by its concrete
// entity struct, so the render passes' single-value type assertions are safe.
func entityTypeMatches(e Entity, entityType int) bool {
	switch entityType {
	case TypeMesh, TypeFPSMesh:
		_, ok := e.(*MeshEntity)
		return ok
	case TypeDirectionalLight:
		_, ok := e.(*DirectionalLightEntity)
		return ok
	case TypePointLight:
		_, ok := e.(*PointLightEntity)
		return ok
	case TypeSpotLight:
		_, ok := e.(*SpotLightEntity)
		return ok
	case TypeSkybox:
		_, ok := e.(*SkyboxEntity)
		return ok
	case TypeSkinnedMesh:
		_, ok := e.(*SkinnedMeshEntity)
		return ok
	case TypeAnimatedBillboard:
		_, ok := e.(*AnimatedBillboardEntity)
		return ok
	case TypeParticleEmitter:
		_, ok := e.(*ParticleEmitterEntity)
		return ok
	}
	return true
}

// AddEntity registers e (nil or a built-in Type id on a foreign struct is
// rejected with a warning).
func (s *Scene) AddEntity(e Entity) {
	if e == nil {
		systems.GlobalConsole.Warn("Attempted to add nil entity")
		return
	}
	b := e.GetBase()
	if !entityTypeMatches(e, b.Type) {
		systems.GlobalConsole.Warn("Entity type id does not match its concrete type; not added")
		return
	}
	s.entities.Add(e)
	if b.Type > 0 && b.Type < TypeCount {
		s.byType[b.Type].Add(e)
	}
	if b.Collider != nil {
		s.collidables.Add(e)
	}
}

// AddEntities registers every non-nil entity in list.
func (s *Scene) AddEntities(list []Entity) {
	for i := 0; i < len(list); i++ {
		if list[i] != nil {
			s.AddEntity(list[i])
		}
	}
}

// RemoveEntity unregisters and disposes e.
func (s *Scene) RemoveEntity(e Entity) {
	if e == nil {
		return
	}
	idx := s.entities.IndexOf(e)
	if idx == -1 {
		return
	}
	s.entities.SwapRemove(idx)
	b := e.GetBase()
	if b.Type > 0 && b.Type < TypeCount {
		ti := s.byType[b.Type].IndexOf(e)
		if ti != -1 {
			s.byType[b.Type].SwapRemove(ti)
		}
	}
	ci := s.collidables.IndexOf(e)
	if ci != -1 {
		s.collidables.SwapRemove(ci)
	}
	e.Dispose()
}

// GetEntities returns the live entities of the given type (valid up to count).
func (s *Scene) GetEntities(entityType int) ([]Entity, int) {
	if entityType <= 0 || entityType >= TypeCount {
		return nil, 0
	}
	l := s.byType[entityType]
	return l.Items, l.Count
}

// EntityCount returns the number of registered entities.
func (s *Scene) EntityCount() int { return s.entities.Count }

// VisibleEntities returns the frustum-visible entities of a type from the last Update.
func (s *Scene) VisibleEntities(entityType int) ([]Entity, int) {
	if entityType <= 0 || entityType >= TypeCount {
		return nil, 0
	}
	l := s.visible[entityType]
	return l.Items, l.Count
}

// Init clears entity lists and static geometry without disposing entities.
func (s *Scene) Init() {
	s.entities.Clear()
	s.collidables.Clear()
	for t := 1; t < TypeCount; t++ {
		s.byType[t].Clear()
		s.visible[t].Clear()
	}
	s.staticTrimesh = nil
}

// Dispose disposes all entities and resets scene state.
func (s *Scene) Dispose() {
	for i := 0; i < s.entities.Count; i++ {
		s.entities.Items[i].Dispose()
	}
	if s.staticTrimesh != nil {
		s.staticTrimesh.Dispose()
	}
	s.Init()
	s.SetAmbient(defaultAmbient[0], defaultAmbient[1], defaultAmbient[2])
	s.paused = false
	s.lightGrid.Reset()
}

// ---------------------------------------------------------------------------
// Ambient
// ---------------------------------------------------------------------------

// SetAmbient sets the flat ambient colour used when no light grid is loaded.
func (s *Scene) SetAmbient(r, g, b float32) {
	s.ambient[0] = r
	s.ambient[1] = g
	s.ambient[2] = b
}

// LightGrid returns the probe grid for loading data.
func (s *Scene) LightGrid() *LightGrid { return s.lightGrid }

// Ambient implements rendering.SceneSource: global ambient (black with a light grid).
func (s *Scene) Ambient(out *physics.Vec3) {
	if s.lightGrid.HasData() {
		out.Set(0, 0, 0)
		return
	}
	out.Set(s.ambient[0], s.ambient[1], s.ambient[2])
}

// AmbientAt writes the ambient colour at a world position into out (3 floats).
func (s *Scene) AmbientAt(position *physics.Vec3, out []float32) {
	if s.lightGrid.HasData() {
		s.lightGrid.GetAmbient(position, out)
		return
	}
	out[0] = s.ambient[0]
	out[1] = s.ambient[1]
	out[2] = s.ambient[2]
}

// ---------------------------------------------------------------------------
// Static geometry
// ---------------------------------------------------------------------------

// AddStaticGeometry bakes a mesh entity's world-space triangles into the merged
// static trimesh and marks the entity static (no further updates/transforms).
func (s *Scene) AddStaticGeometry(e *MeshEntity) {
	mesh := e.Mesh
	if mesh == nil || len(mesh.Vertices) == 0 || len(mesh.Indices) == 0 {
		systems.GlobalConsole.Warn("Cannot make static: mesh has no vertex/index data")
		return
	}
	if s.staticTrimesh == nil {
		s.staticTrimesh = physics.NewEmptyTrimesh()
	}

	total := 0
	for i := 0; i < len(mesh.Indices); i++ {
		total += len(mesh.Indices[i].Array)
	}
	flat := make([]int32, total)
	flags := make([]byte, total/3)
	offset := 0
	for i := 0; i < len(mesh.Indices); i++ {
		group := &mesh.Indices[i]
		arr := group.Array
		for j := 0; j < len(arr); j++ {
			flat[offset+j] = int32(arr[j])
		}
		mat := mesh.MaterialLookup[group.Material]
		if mat != nil && (mat.Translucent || mat.DoubleSided || mat.Opacity < 1.0) {
			startTri := offset / 3
			numTri := len(arr) / 3
			for t := 0; t < numTri; t++ {
				flags[startTri+t] = 1
			}
		}
		offset += len(arr)
	}

	src := mesh.Vertices
	m := e.Base.BaseMatrix
	world := make([]float32, len(src))
	for i := 0; i < len(src); i += 3 {
		x := src[i]
		y := src[i+1]
		z := src[i+2]
		world[i] = m[0]*x + m[4]*y + m[8]*z + m[12]
		world[i+1] = m[1]*x + m[5]*y + m[9]*z + m[13]
		world[i+2] = m[2]*x + m[6]*y + m[10]*z + m[14]
	}

	s.staticTrimesh.AddMesh(world, flat, flags)
	e.Base.IsStatic = true
}

// FinalizeStaticGeometry builds the merged trimesh's octree.
func (s *Scene) FinalizeStaticGeometry() {
	if s.staticTrimesh == nil {
		return
	}
	s.staticTrimesh.Finalize()
	systems.GlobalConsole.Log("[Scene] Static trimesh finalized")
}

// StaticTrimesh returns the merged static collision mesh (nil until geometry is added).
func (s *Scene) StaticTrimesh() *physics.Trimesh { return s.staticTrimesh }

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

// Pause toggles entity updates.
func (s *Scene) Pause(doPause bool) { s.paused = doPause }

// IsPaused reports whether updates are suspended.
func (s *Scene) IsPaused() bool { return s.paused }

// Update advances all non-static entities by frameTime (ms), removes those
// that returned false, and rebuilds the visibility cache.
func (s *Scene) Update(frameTime float32) {
	if s.paused {
		return
	}
	s.pendingRemoval = false
	for i := 0; i < s.entities.Count; i++ {
		e := s.entities.Items[i]
		b := e.GetBase()
		if b.IsStatic {
			continue
		}
		if !e.Update(frameTime) {
			b.markedForRemoval = true
			s.pendingRemoval = true
		}
	}

	if s.pendingRemoval {
		s.compactRemoved()
	}

	s.UpdateVisibility()
}

func (s *Scene) compactRemoved() {
	// Compact collidables first (entities still hold the flag).
	cLen := 0
	for i := 0; i < s.collidables.Count; i++ {
		e := s.collidables.Items[i]
		if !e.GetBase().markedForRemoval {
			s.collidables.Items[cLen] = e
			cLen++
		}
	}
	for i := cLen; i < s.collidables.Count; i++ {
		s.collidables.Items[i] = nil
	}
	s.collidables.Count = cLen

	for t := 1; t < TypeCount; t++ {
		s.byType[t].Clear()
	}

	eLen := 0
	for i := 0; i < s.entities.Count; i++ {
		e := s.entities.Items[i]
		b := e.GetBase()
		if b.markedForRemoval {
			b.markedForRemoval = false
			e.Dispose()
			continue
		}
		s.entities.Items[eLen] = e
		eLen++
		if b.Type > 0 && b.Type < TypeCount {
			s.byType[b.Type].Add(e)
		}
	}
	for i := eLen; i < s.entities.Count; i++ {
		s.entities.Items[i] = nil
	}
	s.entities.Count = eLen
}

// UpdateVisibility rebuilds the per-type visibility cache via frustum culling.
func (s *Scene) UpdateVisibility() {
	for t := 1; t < TypeCount; t++ {
		s.visible[t].Clear()
	}
	for i := 0; i < s.entities.Count; i++ {
		e := s.entities.Items[i]
		b := e.GetBase()
		// View models are camera-attached; never frustum-cull them.
		if b.Type != TypeFPSMesh && b.BoundingBox != nil && !b.BoundingBox.IsVisible() {
			continue
		}
		if b.Type > 0 && b.Type < TypeCount {
			s.visible[b.Type].Add(e)
		}
	}
}

// ---------------------------------------------------------------------------
// Raycasts
// ---------------------------------------------------------------------------

func (s *Scene) setupRay(fromX, fromY, fromZ, toX, toY, toZ float32, options *physics.RayOptions) {
	if options == nil {
		options = s.defaultOpts
	}
	r := s.ray
	r.From.Set(fromX, fromY, fromZ)
	r.To.Set(toX, toY, toZ)
	r.UpdateDirection()
	r.HasHit = false
	r.SkipBackfaces = options.SkipBackfaces
	r.CollisionFilterMask = options.CollisionFilterMask
	r.Mode = options.Mode
	if r.Mode == 0 {
		r.Mode = physics.RayModeClosest
	}
	r.Result.HasHit = false
	r.Result.Distance = float32(math.Inf(1))
	r.Result.ShouldStop = false
}

// Raycast tests the segment against every collidable (dynamic and static).
// A nil options uses the defaults (skip backfaces, closest hit); an explicit
// RayOptions is taken literally, so set SkipBackfaces yourself.
func (s *Scene) Raycast(fromX, fromY, fromZ, toX, toY, toZ float32, options *physics.RayOptions) *physics.RaycastResult {
	s.setupRay(fromX, fromY, fromZ, toX, toY, toZ, options)
	for i := 0; i < s.collidables.Count; i++ {
		b := s.collidables.Items[i].GetBase()
		s.ray.IntersectTrimesh(b.Collider, b.BaseMatrix)
	}
	if s.staticTrimesh != nil {
		s.ray.IntersectTrimesh(s.staticTrimesh, s.staticMatrix)
	}
	return &s.ray.Result
}

// RaycastStatic tests only the merged static trimesh.
func (s *Scene) RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ float32, options *physics.RayOptions) *physics.RaycastResult {
	s.setupRay(fromX, fromY, fromZ, toX, toY, toZ, options)
	if s.staticTrimesh != nil {
		s.ray.IntersectTrimesh(s.staticTrimesh, s.staticMatrix)
	}
	return &s.ray.Result
}

// RaycastDynamic tests only entity colliders.
func (s *Scene) RaycastDynamic(fromX, fromY, fromZ, toX, toY, toZ float32, options *physics.RayOptions) *physics.RaycastResult {
	s.setupRay(fromX, fromY, fromZ, toX, toY, toZ, options)
	for i := 0; i < s.collidables.Count; i++ {
		b := s.collidables.Items[i].GetBase()
		s.ray.IntersectTrimesh(b.Collider, b.BaseMatrix)
	}
	return &s.ray.Result
}

// raycastStaticProvider adapts RaycastStatic to physics.RaycastStaticFunc.
func (s *Scene) raycastStaticProvider(fromX, fromY, fromZ, toX, toY, toZ float32, options *physics.RayOptions, out *physics.RaycastResult) *physics.RaycastResult {
	res := s.RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ, options)
	if out == nil {
		return res
	}
	out.HasHit = res.HasHit
	out.Distance = res.Distance
	out.HitFaceIndex = res.HitFaceIndex
	out.ShouldStop = res.ShouldStop
	out.RayFromWorld.Copy(&res.RayFromWorld)
	out.RayToWorld.Copy(&res.RayToWorld)
	out.HitNormalWorld.Copy(&res.HitNormalWorld)
	out.HitPointWorld.Copy(&res.HitPointWorld)
	out.Shape = res.Shape
	out.Body = res.Body
	return out
}
