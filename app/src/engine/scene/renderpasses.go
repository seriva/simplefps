package scene

import (
	"math"

	"../physics"
	"../rendering"
	"../systems"
)

const (
	maxShadowRaycastDistance     = 200
	skinnedShadowRaycastInterval = 3
	skinnedShadowMoveEpsilonSq   = 0.04
	shadowFrameWrap              = 1000000
	shadowRaycastBudget          = 16
)

// scoreEntry pairs a visibility-cache index with a sort score.
type scoreEntry struct {
	Index int
	Score float32
}

// scoreList is a fixed-capacity score buffer with in-place insertion sort.
type scoreList struct {
	Entries []scoreEntry
	Count   int
}

func newScoreList(capacity int) *scoreList {
	return &scoreList{Entries: make([]scoreEntry, capacity)}
}

func (l *scoreList) Begin() { l.Count = 0 }

func (l *scoreList) Add(index int, score float32) {
	if l.Count >= len(l.Entries) {
		grown := make([]scoreEntry, len(l.Entries)*2)
		for i := 0; i < l.Count; i++ {
			grown[i].Index = l.Entries[i].Index
			grown[i].Score = l.Entries[i].Score
		}
		l.Entries = grown
	}
	l.Entries[l.Count].Index = index
	l.Entries[l.Count].Score = score
	l.Count++
}

// SortDescending orders entries by descending score.
func (l *scoreList) SortDescending() {
	e := l.Entries
	for i := 1; i < l.Count; i++ {
		for j := i; j > 0 && e[j].Score > e[j-1].Score; j-- {
			idx := e[j].Index
			sc := e[j].Score
			e[j].Index = e[j-1].Index
			e[j].Score = e[j-1].Score
			e[j-1].Index = idx
			e[j-1].Score = sc
		}
	}
}

// Debug colours per entity type (index = type).
var boundingBoxColors = [][]float32{
	nil,
	{1, 0, 0, 1},   // MESH red
	{0, 1, 0, 1},   // FPS_MESH green
	{1, 1, 0, 1},   // DIRECTIONAL_LIGHT yellow
	{1, 1, 0, 1},   // POINT_LIGHT yellow
	{1, 1, 0, 1},   // SPOT_LIGHT yellow
	{0, 0, 1, 1},   // SKYBOX blue
	{1, 0, 1, 1},   // SKINNED_MESH magenta
	{0, 1, 1, 1},   // ANIMATED_BILLBOARD cyan
	{1, 0.5, 0, 1}, // PARTICLE_EMITTER orange
}

var (
	debugMeshTypes  = []int{TypeMesh, TypeSkinnedMesh, TypeFPSMesh, TypeSkybox}
	debugLightTypes = []int{TypePointLight, TypeSpotLight}
	debugYellow     = []float32{1, 1, 0, 1}
	zeroVec         = &physics.Vec3{}
)

// RegisterDebugCommands adds tbv/twf/tlv/tsk console toggles for the debug overlays.
func RegisterDebugCommands() {
	c := systems.GlobalConsole
	c.RegisterCmd("tbv", func(args []string) string {
		rendering.ActiveDebugOptions.ShowBoundingVolumes = !rendering.ActiveDebugOptions.ShowBoundingVolumes
		return ""
	})
	c.RegisterCmd("twf", func(args []string) string {
		rendering.ActiveDebugOptions.ShowWireframes = !rendering.ActiveDebugOptions.ShowWireframes
		return ""
	})
	c.RegisterCmd("tlv", func(args []string) string {
		rendering.ActiveDebugOptions.ShowLightVolumes = !rendering.ActiveDebugOptions.ShowLightVolumes
		return ""
	})
	c.RegisterCmd("tsk", func(args []string) string {
		rendering.ActiveDebugOptions.ShowSkeleton = !rendering.ActiveDebugOptions.ShowSkeleton
		return ""
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// sampleProbeColor returns the entity's ambient probe colour (world pos + 32 Y),
// cached per render frame.
func (s *Scene) sampleProbeColor(b *EntityBase) []float32 {
	if b.ProbeFrame == s.renderFrame {
		return b.ProbeColor
	}
	physics.Mat4Multiply(s.probeMatrix, b.BaseMatrix, b.AniMatrix)
	physics.Mat4GetTranslation(s.probePos, s.probeMatrix)
	s.probePos.Y += 32
	s.AmbientAt(s.probePos, b.ProbeColor)
	b.ProbeFrame = s.renderFrame
	return b.ProbeColor
}

// calculateShadowHeight raycasts downward from the entity to find the ground.
func (s *Scene) calculateShadowHeight(b *EntityBase) {
	physics.Mat4GetTranslation(s.probePos, b.BaseMatrix)
	res := s.RaycastStatic(
		s.probePos.X, s.probePos.Y+1, s.probePos.Z,
		s.probePos.X, s.probePos.Y-maxShadowRaycastDistance, s.probePos.Z,
		nil,
	)
	if res.HasHit {
		b.ShadowHeight = res.HitPointWorld.Y
		b.ShadowHeightState = ShadowHeightValid
	} else {
		b.ShadowHeightState = ShadowHeightNone
	}
}

// shouldUpdateSkinnedShadowHeight rate-limits skinned shadow raycasts by
// movement and camera distance.
func (s *Scene) shouldUpdateSkinnedShadowHeight(b *EntityBase) bool {
	physics.Mat4GetTranslation(s.probePos, b.BaseMatrix)
	x := s.probePos.X
	y := s.probePos.Y
	z := s.probePos.Z

	if !b.ShadowSampleValid {
		b.ShadowSampleValid = true
		b.ShadowSampleX = x
		b.ShadowSampleY = y
		b.ShadowSampleZ = z
		b.ShadowSampleFrame = s.shadowFrame
		return true
	}

	dx := x - b.ShadowSampleX
	dy := y - b.ShadowSampleY
	dz := z - b.ShadowSampleZ
	movedSq := dx*dx + dy*dy + dz*dz

	frameDelta := s.shadowFrame - b.ShadowSampleFrame
	if frameDelta < 0 {
		frameDelta += shadowFrameWrap
	}

	var distSq float32
	if s.Camera != nil {
		cdx := x - s.Camera.Position.X
		cdy := y - s.Camera.Position.Y
		cdz := z - s.Camera.Position.Z
		distSq = cdx*cdx + cdy*cdy + cdz*cdz
	}
	lod := int(distSq / 500000)
	if lod > 12 {
		lod = 12
	}
	lodInterval := skinnedShadowRaycastInterval + lod

	if movedSq >= float32(skinnedShadowMoveEpsilonSq) || frameDelta >= lodInterval {
		b.ShadowSampleX = x
		b.ShadowSampleY = y
		b.ShadowSampleZ = z
		b.ShadowSampleFrame = s.shadowFrame
		return true
	}
	return false
}

// shadowScreenSize scores shadow priority by projected footprint (worldSize / clipW).
func shadowScreenSize(b *EntityBase, vp physics.Mat4) float32 {
	bb := b.BoundingBox
	if bb == nil || vp == nil {
		return 0
	}
	m := b.BaseMatrix
	px := m[12]
	py := m[13]
	pz := m[14]
	dx := bb.Max.X - bb.Min.X
	dy := bb.Max.Y - bb.Min.Y
	dz := bb.Max.Z - bb.Min.Z
	worldSize := float32(math.Sqrt(float64(dx*dx + dy*dy + dz*dz)))
	w := vp[3]*px + vp[7]*py + vp[11]*pz + vp[15]
	if w <= 0 {
		return 0
	}
	return worldSize / w
}

func (s *Scene) bindGeometryShader() *rendering.Shader {
	sh := rendering.Shaders.Geometry
	if sh == nil {
		return nil
	}
	sh.Bind()
	sh.SetInt("proceduralNoise", 5)
	if systems.ActiveSettings.ProceduralDetail {
		sh.SetInt("doProceduralDetail", 1)
	} else {
		sh.SetInt("doProceduralDetail", 0)
	}
	sh.SetMat4("matWorld", s.identity)
	return sh
}

func (s *Scene) ensureLightsSorted() {
	if s.lightsSortedFrame == s.renderFrame {
		return
	}
	s.lightsSortedFrame = s.renderFrame
	cam := zeroVec
	if s.Camera != nil {
		cam = &s.Camera.Position
	}

	s.pointSorter.Begin()
	pl := s.visible[TypePointLight]
	for i := 0; i < pl.Count; i++ {
		light := pl.Items[i].(*PointLightEntity)
		m := light.Base.BaseMatrix
		s.pointSorter.Add(i, m[12], m[13], m[14], light.Intensity, cam)
	}
	s.pointSorter.Sort()

	s.spotSorter.Begin()
	sl := s.visible[TypeSpotLight]
	for i := 0; i < sl.Count; i++ {
		light := sl.Items[i].(*SpotLightEntity)
		m := light.Base.BaseMatrix
		s.spotSorter.Add(i, m[12], m[13], m[14], light.Intensity, cam)
	}
	s.spotSorter.Sort()
}

// ---------------------------------------------------------------------------
// SceneSource passes
// ---------------------------------------------------------------------------

func (s *Scene) renderSkybox(r *rendering.Renderer) {
	b := r.Backend
	b.SetDepthState(false, false, "lequal")
	sky := s.visible[TypeSkybox]
	for i := 0; i < sky.Count; i++ {
		e := sky.Items[i].(*SkyboxEntity)
		if s.Camera != nil {
			e.CameraPosition = &s.Camera.Position
		}
		e.Render(nil, "all", rendering.Shaders.Geometry)
	}
	b.SetDepthState(true, true, "lequal")
}

// RenderWorldGeometry draws skybox, meshes, FPS meshes and skinned meshes into the G-buffer.
func (s *Scene) RenderWorldGeometry(r *rendering.Renderer) {
	s.renderFrame++
	stats := rendering.ActiveRenderStats

	if s.bindGeometryShader() == nil {
		return
	}
	s.renderSkybox(r)
	geo := s.bindGeometryShader()

	meshes := s.visible[TypeMesh]
	for i := 0; i < meshes.Count; i++ {
		e := meshes.Items[i]
		b := e.GetBase()
		e.Render(s.sampleProbeColor(b), "opaque", geo)
		stats.MeshCount++
		stats.TriangleCount += b.TriangleCount
	}
	fps := s.visible[TypeFPSMesh]
	for i := 0; i < fps.Count; i++ {
		e := fps.Items[i]
		e.Render(s.sampleProbeColor(e.GetBase()), "opaque", geo)
	}
	r.Backend.UnbindShader()

	skinnedShader := rendering.Shaders.SkinnedGeometry
	if skinnedShader != nil {
		skinnedShader.Bind()
		skinnedShader.SetInt("proceduralNoise", 5)
		if systems.ActiveSettings.ProceduralDetail {
			skinnedShader.SetInt("doProceduralDetail", 1)
		} else {
			skinnedShader.SetInt("doProceduralDetail", 0)
		}
		skinned := s.visible[TypeSkinnedMesh]
		for i := 0; i < skinned.Count; i++ {
			e := skinned.Items[i]
			b := e.GetBase()
			e.Render(s.sampleProbeColor(b), "opaque", skinnedShader)
			stats.MeshCount++
			stats.TriangleCount += b.TriangleCount
		}
		r.Backend.UnbindShader()
	}

	r.Backend.SetCullState(true, "back")
}

// RenderFPSGeometry draws first-person meshes with the near depth range.
func (s *Scene) RenderFPSGeometry(r *rendering.Renderer) {
	geo := s.bindGeometryShader()
	if geo == nil {
		return
	}
	fps := s.visible[TypeFPSMesh]
	for i := 0; i < fps.Count; i++ {
		e := fps.Items[i]
		e.Render(s.sampleProbeColor(e.GetBase()), "all", geo)
	}
	r.Backend.UnbindShader()
}

// RenderShadows draws flattened drop shadows for meshes (budgeted raycasts) and skinned meshes.
func (s *Scene) RenderShadows(r *rendering.Renderer) {
	s.shadowFrame = (s.shadowFrame + 1) % shadowFrameWrap

	ambient := s.ambientOut
	if s.lightGrid.HasData() {
		ambient[0] = 0
		ambient[1] = 0
		ambient[2] = 0
	} else {
		ambient[0] = s.ambient[0]
		ambient[1] = s.ambient[1]
		ambient[2] = s.ambient[2]
	}

	var vp physics.Mat4
	if s.Camera != nil {
		vp = s.Camera.ViewProjection
	}

	sh := rendering.Shaders.EntityShadows
	if sh != nil {
		sh.Bind()
		sh.SetVec3("ambient", ambient)
		sh.SetVec3("uProbeColor", ambient)

		meshes := s.visible[TypeMesh]
		s.shadowSort.Begin()
		for i := 0; i < meshes.Count; i++ {
			s.shadowSort.Add(i, shadowScreenSize(meshes.Items[i].GetBase(), vp))
		}
		s.shadowSort.SortDescending()

		budget := shadowRaycastBudget
		for i := 0; i < s.shadowSort.Count; i++ {
			e := meshes.Items[s.shadowSort.Entries[i].Index]
			b := e.GetBase()
			if b.ShadowHeightState == ShadowHeightPending {
				if budget > 0 {
					s.calculateShadowHeight(b)
					budget--
				} else {
					continue
				}
			}
			e.RenderShadow("all", sh)
		}
		r.Backend.UnbindShader()
	}

	ssh := rendering.Shaders.SkinnedEntityShadows
	if ssh != nil {
		ssh.Bind()
		ssh.SetVec3("ambient", ambient)
		ssh.SetVec3("uProbeColor", ambient)
		skinned := s.visible[TypeSkinnedMesh]
		for i := 0; i < skinned.Count; i++ {
			e := skinned.Items[i]
			b := e.GetBase()
			if s.shouldUpdateSkinnedShadowHeight(b) {
				s.calculateShadowHeight(b)
			}
			e.RenderShadow("all", ssh)
		}
		r.Backend.UnbindShader()
	}
}

// HasShadowCasters reports whether any visible mesh/skinned mesh casts a shadow.
func (s *Scene) HasShadowCasters() bool {
	meshes := s.visible[TypeMesh]
	for i := 0; i < meshes.Count; i++ {
		if meshes.Items[i].GetBase().CastShadow {
			return true
		}
	}
	skinned := s.visible[TypeSkinnedMesh]
	for i := 0; i < skinned.Count; i++ {
		if skinned.Items[i].GetBase().CastShadow {
			return true
		}
	}
	return false
}

// RenderLighting draws directional, point and spot lights into the light buffer.
func (s *Scene) RenderLighting(r *rendering.Renderer) {
	stats := rendering.ActiveRenderStats
	b := r.Backend

	if dl := rendering.Shaders.DirectionalLight; dl != nil {
		dl.Bind()
		dl.SetInt("normalBuffer", 1)
		dl.SetInt("colorBuffer", 3)
		dir := s.visible[TypeDirectionalLight]
		for i := 0; i < dir.Count; i++ {
			dir.Items[i].Render(nil, "all", dl)
		}
		b.UnbindShader()
	}

	s.ensureLightsSorted()

	if pl := rendering.Shaders.PointLight; pl != nil {
		pl.Bind()
		pl.SetInt("positionBuffer", 0)
		pl.SetInt("normalBuffer", 1)
		lights := s.visible[TypePointLight]
		for i := 0; i < s.pointSorter.Count; i++ {
			lights.Items[s.pointSorter.Entries[i].Index].Render(nil, "all", pl)
			stats.LightCount++
		}
		b.UnbindShader()
	}

	if sl := rendering.Shaders.SpotLight; sl != nil {
		sl.Bind()
		sl.SetInt("positionBuffer", 0)
		sl.SetInt("normalBuffer", 1)
		lights := s.visible[TypeSpotLight]
		for i := 0; i < s.spotSorter.Count; i++ {
			lights.Items[s.spotSorter.Entries[i].Index].Render(nil, "all", sl)
			stats.LightCount++
		}
		b.UnbindShader()
	}
}

// RenderTransparent draws translucent mesh groups back-to-front with the
// highest-contribution lights packed into the LightingData UBO.
func (s *Scene) RenderTransparent(r *rendering.Renderer) {
	meshes := s.visible[TypeMesh]
	var vp physics.Mat4
	if s.Camera != nil {
		vp = s.Camera.ViewProjection
	}

	s.transparentSort.Begin()
	for i := 0; i < meshes.Count; i++ {
		me := meshes.Items[i].(*MeshEntity)
		if !me.HasTranslucent() {
			continue
		}
		m := me.Base.BaseMatrix
		var w float32
		if vp != nil {
			w = vp[3]*m[12] + vp[7]*m[13] + vp[11]*m[14] + vp[15]
		}
		s.transparentSort.Add(i, w)
	}
	if s.transparentSort.Count == 0 {
		return
	}
	s.transparentSort.SortDescending()

	sh := rendering.Shaders.Transparent
	if sh == nil {
		return
	}
	sh.Bind()
	sh.SetMat4("matWorld", s.identity)
	sh.SetInt("colorSampler", 0)

	s.ensureLightsSorted()
	s.lighting.Reset()

	pls := s.visible[TypePointLight]
	for i := 0; i < s.pointSorter.Count && i < rendering.MaxPointLights; i++ {
		light := pls.Items[s.pointSorter.Entries[i].Index].(*PointLightEntity)
		light.WorldPosition(s.probePos)
		s.lighting.AddPointLight(s.probePos.X, s.probePos.Y, s.probePos.Z, light.Size,
			light.Color[0], light.Color[1], light.Color[2], light.Intensity)
	}
	sls := s.visible[TypeSpotLight]
	for i := 0; i < s.spotSorter.Count && i < rendering.MaxSpotLights; i++ {
		light := sls.Items[s.spotSorter.Entries[i].Index].(*SpotLightEntity)
		s.lighting.AddSpotLight(light.Position.X, light.Position.Y, light.Position.Z, light.Range,
			light.Color[0], light.Color[1], light.Color[2], light.Intensity,
			light.Direction.X, light.Direction.Y, light.Direction.Z, light.Cutoff)
	}
	s.lighting.Upload(r)

	for i := 0; i < s.transparentSort.Count; i++ {
		e := meshes.Items[s.transparentSort.Entries[i].Index]
		e.Render(s.sampleProbeColor(e.GetBase()), "translucent", sh)
	}
	r.Backend.UnbindShader()
}

// RenderBillboards draws animated billboards then particle emitters.
func (s *Scene) RenderBillboards(r *rendering.Renderer) {
	bbs := s.visible[TypeAnimatedBillboard]
	for i := 0; i < bbs.Count; i++ {
		e := bbs.Items[i].(*AnimatedBillboardEntity)
		if s.Camera != nil {
			e.CameraView = s.Camera.View
		}
		e.Render(nil, "all", rendering.Shaders.Billboard)
	}
	pes := s.visible[TypeParticleEmitter]
	for i := 0; i < pes.Count; i++ {
		pes.Items[i].Render(nil, "all", rendering.Shaders.InstancedBillboard)
	}
}

// RenderDebug draws bounding boxes, wireframes, light volumes and skeletons.
func (s *Scene) RenderDebug(r *rendering.Renderer) {
	opts := rendering.ActiveDebugOptions
	if !opts.ShowBoundingVolumes && !opts.ShowWireframes && !opts.ShowLightVolumes && !opts.ShowSkeleton {
		return
	}
	sh := rendering.Shaders.Debug
	if sh == nil {
		return
	}
	b := r.Backend
	sh.Bind()
	b.SetDepthState(false, false, "lequal")

	if opts.ShowBoundingVolumes {
		for t := 1; t < TypeCount; t++ {
			list := s.visible[t]
			if list.Count == 0 {
				continue
			}
			sh.SetVec4("debugColor", boundingBoxColors[t])
			for i := 0; i < list.Count; i++ {
				RenderBoundingBox(list.Items[i].GetBase())
			}
		}
	}

	if opts.ShowWireframes {
		sh.SetVec4("debugColor", debugWhite)
		for ti := 0; ti < len(debugMeshTypes); ti++ {
			list := s.visible[debugMeshTypes[ti]]
			for i := 0; i < list.Count; i++ {
				list.Items[i].RenderWireFrame()
			}
		}
	}

	if opts.ShowLightVolumes {
		sh.SetVec4("debugColor", debugYellow)
		for ti := 0; ti < len(debugLightTypes); ti++ {
			list := s.visible[debugLightTypes[ti]]
			for i := 0; i < list.Count; i++ {
				list.Items[i].RenderWireFrame()
			}
		}
	}

	if opts.ShowSkeleton {
		list := s.visible[TypeSkinnedMesh]
		for i := 0; i < list.Count; i++ {
			list.Items[i].(*SkinnedMeshEntity).RenderSkeleton()
		}
	}

	b.SetDepthState(true, true, "lequal")
	b.UnbindShader()
}
