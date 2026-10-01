package scene

import (
	"math"

	"../physics"
	"../rendering"
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

// ---------------------------------------------------------------------------
// rendering.SceneSource — draw lists refilled by UpdateVisibility
// ---------------------------------------------------------------------------

func (s *Scene) Skyboxes() *rendering.DrawList          { return s.skyboxes }
func (s *Scene) Meshes() *rendering.DrawList            { return s.meshes }
func (s *Scene) FPSMeshes() *rendering.DrawList         { return s.fpsMeshes }
func (s *Scene) SkinnedMeshes() *rendering.DrawList     { return s.skinnedMeshes }
func (s *Scene) DirectionalLights() *rendering.DrawList { return s.directionalLights }
func (s *Scene) PointLights() *rendering.LightList      { return s.pointLights }
func (s *Scene) SpotLights() *rendering.LightList       { return s.spotLights }
func (s *Scene) Billboards() *rendering.DrawList        { return s.billboards }
func (s *Scene) ParticleEmitters() *rendering.DrawList  { return s.particleEmitters }
func (s *Scene) Transparent() *rendering.DrawList       { return s.transparent }

func (s *Scene) resetDrawLists() {
	s.skyboxes.Reset()
	s.meshes.Reset()
	s.fpsMeshes.Reset()
	s.skinnedMeshes.Reset()
	s.directionalLights.Reset()
	s.pointLights.Reset()
	s.spotLights.Reset()
	s.billboards.Reset()
	s.particleEmitters.Reset()
	s.transparent.Reset()
}

// ---------------------------------------------------------------------------
// Visibility cache
// ---------------------------------------------------------------------------

func (s *Scene) clearVisible() {
	for i := 0; i < s.visibleMeshCount; i++ {
		s.visibleMeshes[i] = nil
	}
	s.visibleMeshCount = 0
	for i := 0; i < s.visibleSkinnedCount; i++ {
		s.visibleSkinned[i] = nil
	}
	s.visibleSkinnedCount = 0
}

func (s *Scene) pushVisibleMesh(me *MeshEntity) {
	if s.visibleMeshCount >= len(s.visibleMeshes) {
		grown := make([]*MeshEntity, len(s.visibleMeshes)*2+16)
		for i := 0; i < s.visibleMeshCount; i++ {
			grown[i] = s.visibleMeshes[i]
		}
		s.visibleMeshes = grown
	}
	s.visibleMeshes[s.visibleMeshCount] = me
	s.visibleMeshCount++
}

func (s *Scene) pushVisibleSkinned(sk *SkinnedMeshEntity) {
	if s.visibleSkinnedCount >= len(s.visibleSkinned) {
		grown := make([]*SkinnedMeshEntity, len(s.visibleSkinned)*2+16)
		for i := 0; i < s.visibleSkinnedCount; i++ {
			grown[i] = s.visibleSkinned[i]
		}
		s.visibleSkinned = grown
	}
	s.visibleSkinned[s.visibleSkinnedCount] = sk
	s.visibleSkinnedCount++
}

// addVisible routes a culled entity into its typed bucket / draw list and
// applies the per-frame scene inputs entities cannot reach themselves
// (camera, probes). The concrete type is guaranteed by AddEntity's
// entityTypeMatches check.
func (s *Scene) addVisible(e Entity, b *EntityBase) {
	switch b.Type {
	case TypeMesh:
		me := e.(*MeshEntity)
		s.sampleProbeColor(b, &me.Probe)
		s.pushVisibleMesh(me)
		s.meshes.Add(me)
	case TypeFPSMesh:
		me := e.(*MeshEntity)
		s.sampleProbeColor(b, &me.Probe)
		s.fpsMeshes.Add(me)
	case TypeSkinnedMesh:
		sk := e.(*SkinnedMeshEntity)
		s.sampleProbeColor(b, &sk.Probe)
		s.pushVisibleSkinned(sk)
		s.skinnedMeshes.Add(sk)
	case TypeSkybox:
		sky := e.(*SkyboxEntity)
		if s.Camera != nil {
			sky.CameraPosition = &s.Camera.Position
		} else {
			sky.CameraPosition = nil
		}
		s.skyboxes.Add(sky)
	case TypeDirectionalLight:
		s.directionalLights.Add(e.(*DirectionalLightEntity))
	case TypePointLight:
		s.pointLights.Add(e.(*PointLightEntity))
	case TypeSpotLight:
		s.spotLights.Add(e.(*SpotLightEntity))
	case TypeAnimatedBillboard:
		bb := e.(*AnimatedBillboardEntity)
		if s.Camera != nil {
			bb.CameraView = s.Camera.View
		}
		s.billboards.Add(bb)
	case TypeParticleEmitter:
		s.particleEmitters.Add(e.(*ParticleEmitterEntity))
	}
}

// buildTransparent collects visible meshes with translucent materials sorted
// back-to-front (descending clip-space w).
func (s *Scene) buildTransparent() {
	var vp physics.Mat4
	if s.Camera != nil {
		vp = s.Camera.ViewProjection
	}
	s.transparentSort.Begin()
	for i := 0; i < s.visibleMeshCount; i++ {
		me := s.visibleMeshes[i]
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
	s.transparentSort.SortDescending()
	for i := 0; i < s.transparentSort.Count; i++ {
		s.transparent.Add(s.visibleMeshes[s.transparentSort.Entries[i].Index])
	}
}

// ---------------------------------------------------------------------------
// Ambient probes and drop-shadow heights
// ---------------------------------------------------------------------------

// sampleProbeColor refreshes p with the ambient at the entity (world pos + 32 Y).
func (s *Scene) sampleProbeColor(b *EntityBase, p *probeCache) {
	physics.Mat4Multiply(s.probeMatrix, b.BaseMatrix, b.AniMatrix)
	physics.Mat4GetTranslation(s.probePos, s.probeMatrix)
	s.probePos.Y += 32
	s.AmbientAt(s.probePos, s.probeColor)
	p.R = s.probeColor[0]
	p.G = s.probeColor[1]
	p.B = s.probeColor[2]
}

// calculateShadowHeight raycasts downward from the entity to find the ground.
func (s *Scene) calculateShadowHeight(b *EntityBase, sh *shadowState) {
	physics.Mat4GetTranslation(s.probePos, b.BaseMatrix)
	res := s.RaycastStatic(
		s.probePos.X, s.probePos.Y+1, s.probePos.Z,
		s.probePos.X, s.probePos.Y-maxShadowRaycastDistance, s.probePos.Z,
		nil,
	)
	if res.HasHit {
		sh.Height = res.HitPointWorld.Y
		sh.HeightState = ShadowHeightValid
	} else {
		sh.HeightState = ShadowHeightNone
	}
}

// shouldUpdateSkinnedShadowHeight rate-limits skinned shadow raycasts by
// movement and camera distance.
func (s *Scene) shouldUpdateSkinnedShadowHeight(b *EntityBase, sh *shadowState) bool {
	physics.Mat4GetTranslation(s.probePos, b.BaseMatrix)
	x := s.probePos.X
	y := s.probePos.Y
	z := s.probePos.Z

	if !sh.SampleValid {
		sh.SampleValid = true
		sh.SampleX = x
		sh.SampleY = y
		sh.SampleZ = z
		sh.SampleFrame = s.shadowFrame
		return true
	}

	dx := x - sh.SampleX
	dy := y - sh.SampleY
	dz := z - sh.SampleZ
	movedSq := dx*dx + dy*dy + dz*dz

	frameDelta := s.shadowFrame - sh.SampleFrame
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
		sh.SampleX = x
		sh.SampleY = y
		sh.SampleZ = z
		sh.SampleFrame = s.shadowFrame
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

// updateShadowHeights resolves drop-shadow ground heights for visible casters:
// pending meshes largest-on-screen first within a per-frame raycast budget,
// skinned meshes rate-limited by movement and distance.
func (s *Scene) updateShadowHeights() {
	s.shadowFrame = (s.shadowFrame + 1) % shadowFrameWrap

	var vp physics.Mat4
	if s.Camera != nil {
		vp = s.Camera.ViewProjection
	}

	s.shadowSort.Begin()
	for i := 0; i < s.visibleMeshCount; i++ {
		me := s.visibleMeshes[i]
		if me.Base.CastShadow && me.Shadow.HeightState == ShadowHeightPending {
			s.shadowSort.Add(i, shadowScreenSize(&me.Base, vp))
		}
	}
	s.shadowSort.SortDescending()
	budget := shadowRaycastBudget
	for i := 0; i < s.shadowSort.Count && budget > 0; i++ {
		me := s.visibleMeshes[s.shadowSort.Entries[i].Index]
		s.calculateShadowHeight(&me.Base, &me.Shadow)
		budget--
	}

	for i := 0; i < s.visibleSkinnedCount; i++ {
		sk := s.visibleSkinned[i]
		if sk.Base.CastShadow && s.shouldUpdateSkinnedShadowHeight(&sk.Base, &sk.Shadow) {
			s.calculateShadowHeight(&sk.Base, &sk.Shadow)
		}
	}
}
