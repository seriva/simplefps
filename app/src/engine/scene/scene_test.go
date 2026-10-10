package scene

import (
	"testing"

	"../animation"
	"../collision"
	"../mathx"
	"../physics"
	"../rendering"
	"../rendering/fakegpu"
	"../systems"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

func approx(a, b float32) bool {
	d := a - b
	return d < 0.001 && d > -0.001
}

// testBE is the backend of the most recent setup(); mesh fixtures build on it.
var testBE *rendering.Backend

// setup wires a fake GPU device, renderer and a fresh scene.
func setup() (*fakegpu.Device, *rendering.Renderer, *Scene) {
	dev := fakegpu.NewDevice()
	b := rendering.NewBackend()
	b.Canvas = map[string]any{"clientWidth": 320, "clientHeight": 240, "width": 320, "height": 240}
	var d any = dev
	var ctx any = fakegpu.NewContext(dev, 320, 240)
	b.InitWithDevice(d, ctx)
	testBE = b
	r := rendering.NewRenderer(b)
	r.Init(320, 240, false)
	cam := systems.NewCamera()
	for i := 0; i < len(cam.FrustumPlanes); i++ {
		cam.FrustumPlanes[i] = 0
	}
	s := NewScene(cam)
	dev.ResetFrame()
	return dev, r, s
}

// testView mirrors engine.RenderFrame's CameraView snapshot of the scene camera.
var testView = &rendering.CameraView{
	View:                  mathx.NewMat4(),
	Projection:            mathx.NewMat4(),
	ViewProjection:        mathx.NewMat4(),
	InverseViewProjection: mathx.NewMat4(),
}

// testOpts: no blur passes, no FSR, no dirt — keeps the recording to scene draws.
var testOpts = &rendering.RenderOptions{}

// renderFrame runs one full renderer frame pulling from s.
func renderFrame(r *rendering.Renderer, s *Scene) {
	if s.Camera != nil {
		testView.Position = s.Camera.Position
		testView.View = s.Camera.View
		testView.Projection = s.Camera.Projection
		testView.ViewProjection = s.Camera.ViewProjection
		testView.InverseViewProjection = s.Camera.InverseViewProjection
	}
	r.Render(testView, s, testOpts, 0)
}

// slotOf returns the ObjectData slot a recorded draw used.
func slotOf(d fakegpu.DrawRecord) int { return d.ObjectOffset / rendering.ObjectStride }

// offProbe/offParams0 mirror rendering's ObjectData float offsets.
const (
	offProbe   = 16
	offParams0 = 20
	offParams1 = 24
	offParams2 = 28
)

// unitQuad builds a 2-triangle mesh in the XZ plane at y=0 spanning [-1,1].
func unitQuad(material string) *rendering.Mesh {
	verts := []float32{-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1}
	idx := []uint32{0, 2, 1, 0, 3, 2}
	groups := []rendering.IndexGroup{rendering.IndexGroup{Material: material, Array: idx}}
	return rendering.NewMesh(testBE, verts, nil, nil, nil, groups)
}

func meshAt(x, y, z float32) *MeshEntity {
	return NewMeshEntity(TypeMesh, mathx.NewVec3(x, y, z), unitQuad("none"), nil, 1)
}

func testSkeleton() *animation.Skeleton {
	defs := []animation.JointDef{
		animation.JointDef{Name: "root", Parent: -1, Pos: []float32{0, 0, 0}, Rot: []float32{0, 0, 0, 1}},
		animation.JointDef{Name: "child", Parent: 0, Pos: []float32{0, 1, 0}, Rot: []float32{0, 0, 0, 1}},
	}
	return animation.NewSkeleton(defs)
}

func skinnedQuad() *rendering.SkinnedMesh {
	verts := []float32{-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1}
	idx := []uint32{0, 2, 1, 0, 3, 2}
	groups := []rendering.IndexGroup{rendering.IndexGroup{Material: "none", Array: idx}}
	joints := make([]uint8, 16)
	weights := make([]float32, 16)
	for i := 0; i < 4; i++ {
		weights[i*4] = 1
	}
	return rendering.NewSkinnedMesh(testBE, verts, nil, nil, groups, joints, weights)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ---------------------------------------------------------------------------
// Entity management
// ---------------------------------------------------------------------------

func TestAddRemoveEntities(t *testing.T) {
	_, _, s := setup()
	a := meshAt(0, 0, 0)
	b := meshAt(5, 0, 0)
	light := NewPointLightEntity(mathx.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil)
	s.AddEntities([]Entity{a, b, light, nil})

	if s.EntityCount() != 3 {
		t.Fatalf("EntityCount = %d, want 3", s.EntityCount())
	}
	_, meshCount := s.GetEntities(TypeMesh)
	_, lightCount := s.GetEntities(TypePointLight)
	if meshCount != 2 || lightCount != 1 {
		t.Fatalf("typed counts = %d meshes, %d lights", meshCount, lightCount)
	}

	s.RemoveEntity(a)
	if s.EntityCount() != 2 {
		t.Fatalf("after remove EntityCount = %d", s.EntityCount())
	}
	items, meshCount := s.GetEntities(TypeMesh)
	if meshCount != 1 || items[0] != Entity(b) {
		t.Fatalf("mesh list after remove wrong")
	}
	if a.Mesh != nil {
		t.Errorf("removed entity should be disposed")
	}
	s.RemoveEntity(a)
	if s.EntityCount() != 2 {
		t.Errorf("double remove changed count")
	}
}

func TestUpdateCallbackAndRemoval(t *testing.T) {
	_, _, s := setup()
	ticks := 0
	keep := NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, 0), unitQuad("none"), func(e Entity, dt float32) bool {
		ticks++
		return true
	}, 1)
	dieNext := NewMeshEntity(TypeMesh, mathx.NewVec3(1, 0, 0), unitQuad("none"), func(e Entity, dt float32) bool {
		return false
	}, 1)
	static := meshAt(2, 0, 0)
	static.Base.IsStatic = true
	static.Base.Callback = func(e Entity, dt float32) bool {
		t.Errorf("static entity must not update")
		return true
	}
	s.AddEntity(keep)
	s.AddEntity(dieNext)
	s.AddEntity(static)

	s.Update(16)
	if ticks != 1 {
		t.Errorf("callback ticks = %d, want 1", ticks)
	}
	if s.EntityCount() != 2 {
		t.Fatalf("EntityCount after removal = %d, want 2", s.EntityCount())
	}
	_, n := s.GetEntities(TypeMesh)
	if n != 2 {
		t.Errorf("typed list not rebuilt: %d", n)
	}
	if dieNext.Mesh != nil {
		t.Errorf("removed entity not disposed")
	}

	s.Pause(true)
	s.Update(16)
	if ticks != 1 {
		t.Errorf("paused scene still updated")
	}

	s.Pause(false)
	keep.Base.Visible = false
	s.Update(16)
	if ticks != 1 {
		t.Errorf("invisible entity ran callback")
	}
}

func TestBoundingVolumeAndVisibility(t *testing.T) {
	_, _, s := setup()
	near := meshAt(0, 0, 0)
	far := meshAt(50, 0, 0)
	s.AddEntity(near)
	s.AddEntity(far)
	s.Update(16)

	bb := far.Base.BoundingBox
	if bb == nil || !approx(bb.Min.X, 49) || !approx(bb.Max.X, 51) {
		t.Fatalf("far bbox = %+v", bb)
	}

	_, vis := s.VisibleMeshes()
	if vis != 2 {
		t.Fatalf("all-zero planes should keep everything visible, got %d", vis)
	}

	s.Camera.FrustumPlanes[0] = 1
	s.Camera.FrustumPlanes[3] = -10
	s.UpdateVisibility()
	items, vis := s.VisibleMeshes()
	if vis != 1 || items[0] != far {
		t.Errorf("culling kept %d entities", vis)
	}

	s.Camera = nil
	s.UpdateVisibility()
	_, vis = s.VisibleMeshes()
	if vis != 2 {
		t.Errorf("camera-less scene culled: %d visible", vis)
	}
}

func TestMeshEntitySetRotationWarnsWhenStatic(t *testing.T) {
	_, _, _ = setup()
	e := meshAt(0, 0, 0)
	e.SetRotation(0, 90, 0)
	m := e.Base.BaseMatrix
	if !approx(m[0], 0) || !approx(m[2], -1) {
		t.Errorf("rotation not applied: m[0]=%v m[2]=%v", m[0], m[2])
	}
	e.Base.IsStatic = true
	e.SetRotation(0, 90, 0)
	if !approx(m[2], -1) {
		t.Errorf("static entity was rotated")
	}
}

// ---------------------------------------------------------------------------
// Static geometry & raycasts
// ---------------------------------------------------------------------------

func TestStaticGeometryRaycast(t *testing.T) {
	_, _, s := setup()
	floor := NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, 0), unitQuad("none"), nil, 10)
	s.AddEntity(floor)
	s.AddStaticGeometry(floor)
	s.FinalizeStaticGeometry()

	if !floor.Base.IsStatic {
		t.Fatalf("entity not flagged static")
	}
	tm := s.StaticTrimesh()
	if tm == nil || len(tm.Indices) != 6 {
		t.Fatalf("static trimesh indices = %v", tm)
	}
	if !approx(tm.Vertices[0], -10) {
		t.Errorf("world vertex x = %v, want -10", tm.Vertices[0])
	}

	res := s.RaycastStatic(2, 5, 2, 2, -5, 2, nil)
	if !res.HasHit {
		t.Fatalf("ray should hit floor")
	}
	if !approx(res.HitPointWorld.Y, 0) || !approx(res.Distance, 5) {
		t.Errorf("hit = %+v dist=%v", res.HitPointWorld, res.Distance)
	}

	miss := s.RaycastStatic(50, 5, 50, 50, -5, 50, nil)
	if miss.HasHit {
		t.Errorf("ray outside floor should miss")
	}

	below := s.RaycastStatic(0, -5, 0, 0, 5, 0, nil)
	if below.HasHit {
		t.Errorf("backface should be skipped by default")
	}
	both := s.RaycastStatic(0, -5, 0, 0, 5, 0, &collision.RayOptions{SkipBackfaces: false, Mode: collision.RayModeClosest})
	if !both.HasHit {
		t.Errorf("SkipBackfaces=false should hit from below")
	}

	var provider physics.RaycastProvider = s.StaticWorld()
	got := provider.RaycastStatic(1, 5, 1, 1, -5, 1, nil)
	if !got.HasHit || !approx(got.HitPointWorld.Y, 0) {
		t.Errorf("RaycastProvider: %+v", got)
	}
	body := physics.NewDynamicBody(mathx.NewVec3(0.5, 2, 0.5), &physics.DynamicBodyConfig{Radius: 1, Gravity: 1000})
	body.Provider = s.StaticWorld()
	for i := 0; i < 20 && !body.IsResting && body.BounceCount == 0; i++ {
		body.Update(50)
	}
	if body.BounceCount == 0 && !body.IsResting {
		t.Errorf("DynamicBody never hit the static floor via the scene provider")
	}

	s.Dispose()
	if s.StaticTrimesh() != nil || s.RaycastStatic(1, 5, 1, 1, -5, 1, nil).HasHit {
		t.Errorf("Dispose did not release static trimesh")
	}
}

func TestStaticGeometryDoubleSidedFlags(t *testing.T) {
	_, _, s := setup()
	mesh := unitQuad("glass")
	mat := rendering.NewMaterial(testBE, "glass")
	mat.Translucent = true
	mesh.MaterialLookup["glass"] = mat
	e := NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, 0), mesh, nil, 1)
	s.AddStaticGeometry(e)
	s.FinalizeStaticGeometry()
	tm := s.StaticTrimesh()
	if len(tm.TriangleFlags) != 2 || tm.TriangleFlags[0] != 1 || tm.TriangleFlags[1] != 1 {
		t.Errorf("translucent material should flag triangles double-sided: %v", tm.TriangleFlags)
	}
	below := s.RaycastStatic(0, -5, 0, 0, 5, 0, nil)
	if !below.HasHit {
		t.Errorf("double-sided triangle should be hit from below")
	}
}

func TestDynamicRaycast(t *testing.T) {
	_, _, s := setup()
	e := meshAt(0, 3, 0)
	verts := []float32{-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1}
	idx := []int32{0, 2, 1, 0, 3, 2}
	e.Base.Collider = collision.NewTrimesh(verts, idx, nil)
	s.AddEntity(e)

	res := s.RaycastDynamic(0, 10, 0, 0, -10, 0, nil)
	if !res.HasHit || !approx(res.HitPointWorld.Y, 3) {
		t.Fatalf("dynamic hit = %+v (hit=%v)", res.HitPointWorld, res.HasHit)
	}
	all := s.Raycast(0, 10, 0, 0, -10, 0, nil)
	if !all.HasHit || !approx(all.HitPointWorld.Y, 3) {
		t.Errorf("Raycast should include collidables")
	}
	stat := s.RaycastStatic(0, 10, 0, 0, -10, 0, nil)
	if stat.HasHit {
		t.Errorf("RaycastStatic must ignore entity colliders")
	}
}

// ---------------------------------------------------------------------------
// Ambient / light grid
// ---------------------------------------------------------------------------

func TestAmbientDefaultsAndLightGrid(t *testing.T) {
	_, _, s := setup()
	out := &mathx.Vec3{}
	s.Ambient(out)
	if !approx(out.X, 0.5) || !approx(out.Y, 0.5) {
		t.Errorf("default ambient = %+v", out)
	}
	s.SetAmbient(0.1, 0.2, 0.3)
	buf := make([]float32, 3)
	s.AmbientAt(mathx.NewVec3(0, 0, 0), buf)
	if !approx(buf[2], 0.3) {
		t.Errorf("AmbientAt flat = %v", buf)
	}

	cfg := &LightGridConfig{Origin: []float32{0, 0, 0}, Counts: []int{2, 2, 2}, Step: []float32{64, 64, 64}}
	data := make([]byte, 8*3)
	for z := 0; z < 2; z++ {
		for y := 0; y < 2; y++ {
			for x := 0; x < 2; x++ {
				i := (z*4 + y*2 + x) * 3
				data[i] = byte(x * 255)
				data[i+1] = 128
				data[i+2] = byte(z * 255)
			}
		}
	}
	if !s.LightGrid().Load(cfg, data) {
		t.Fatalf("Load failed")
	}
	s.Ambient(out)
	if out.X != 0 || out.Y != 0 || out.Z != 0 {
		t.Errorf("ambient with grid should be black: %+v", out)
	}
	s.AmbientAt(mathx.NewVec3(32, 0, 0), buf)
	if !approx(buf[0], 0.5) || !approx(buf[1], 128.0/255.0) || !approx(buf[2], 0) {
		t.Errorf("trilinear sample = %v", buf)
	}
	s.AmbientAt(mathx.NewVec3(0, 64, 0), buf)
	if !approx(buf[2], 1) {
		t.Errorf("engine +Y should map to grid Z: %v", buf)
	}
	s.AmbientAt(mathx.NewVec3(-500, -500, 500), buf)
	if !approx(buf[0], 0) || !approx(buf[2], 0) {
		t.Errorf("clamped sample = %v", buf)
	}

	if s.LightGrid().Load(cfg, make([]byte, 3)) {
		t.Errorf("undersized buffer must fail to load")
	}
	if s.LightGrid().HasData() {
		t.Errorf("failed load should reset data")
	}
}

// ---------------------------------------------------------------------------
// Render passes
// ---------------------------------------------------------------------------

func TestRenderWorldGeometryOrderAndObjectData(t *testing.T) {
	dev, r, s := setup()
	s.SetAmbient(0.25, 0.5, 0.75)
	s.AddEntity(NewSkyboxEntity("test", r.Shapes.SkyBox, nil))
	s.AddEntity(meshAt(3, 0, 0))
	skinned := NewSkinnedMeshEntity(mathx.NewVec3(0, 0, 0), skinnedQuad(), testSkeleton(), nil, 1)
	s.AddEntity(skinned)
	s.Update(16)
	dev.ResetFrame()

	renderFrame(r, s)

	sky := dev.FirstDraw("skybox")
	geo := dev.FirstDraw("geometry")
	sk := dev.FirstDraw("skinned-geometry")
	if sky < 0 || geo < 0 || sk < 0 {
		t.Fatalf("expected skybox, geometry and skinned draws: %d %d %d", sky, geo, sk)
	}
	if !(sky < geo && geo < sk) {
		t.Errorf("gbuffer order must be skybox, meshes, skinned: %d %d %d", sky, geo, sk)
	}
	if dev.Draws[geo].Pass != "gbuffer" {
		t.Errorf("geometry drawn in pass %q", dev.Draws[geo].Pass)
	}
	// Skybox probe is white; meshes carry their world matrix and probe colour.
	if r.ObjectValue(slotOf(dev.Draws[sky]), offProbe) != 1 {
		t.Error("skybox probe must be white")
	}
	gs := slotOf(dev.Draws[geo])
	if !approx(r.ObjectValue(gs, 12), 3) {
		t.Errorf("mesh world translation x = %v", r.ObjectValue(gs, 12))
	}
	if !approx(r.ObjectValue(gs, offProbe), 0.25) || !approx(r.ObjectValue(gs, offProbe+2), 0.75) {
		t.Errorf("mesh probe = ambient, got %v %v", r.ObjectValue(gs, offProbe), r.ObjectValue(gs, offProbe+2))
	}
	// Skinned draw points misc.x at its bone range and uploads bones.
	if r.Bones.Count != rendering.MaxJoints {
		t.Errorf("bone ring count = %d, want one full palette (%d)", r.Bones.Count, rendering.MaxJoints)
	}
	if dev.Draws[sk].Group1 == "" {
		t.Error("skinned draw must bind a material group")
	}
	if r.Stats.MeshCount != 2 || r.Stats.TriangleCount != 4 {
		t.Errorf("stats meshes=%d tris=%d", r.Stats.MeshCount, r.Stats.TriangleCount)
	}
	// Everything landed in one submit with the ring uploaded once.
	if dev.Submits != 1 {
		t.Errorf("submits = %d", dev.Submits)
	}
}

func TestRenderShadowsBudgetAndHeights(t *testing.T) {
	dev, r, s := setup()
	floor := NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, 0), unitQuad("none"), nil, 100)
	s.AddEntity(floor)
	s.AddStaticGeometry(floor)
	s.FinalizeStaticGeometry()

	casters := make([]*MeshEntity, 20)
	for i := 0; i < 20; i++ {
		casters[i] = meshAt(float32(i), 5, 0)
		casters[i].Base.CastShadow = true
		s.AddEntity(casters[i])
	}
	noGround := meshAt(500, 5, 500)
	noGround.Base.CastShadow = true
	s.AddEntity(noGround)

	s.Update(16)
	resolved := 0
	for i := 0; i < 20; i++ {
		if casters[i].Shadow.HeightState == ShadowHeightValid {
			resolved++
			if !approx(casters[i].Shadow.Height, 0) {
				t.Errorf("shadow height = %v", casters[i].Shadow.Height)
			}
		}
	}
	if noGround.Shadow.HeightState == ShadowHeightValid {
		resolved++
	}
	pendingAfterFirst := 21 - resolved
	if resolved > shadowRaycastBudget || pendingAfterFirst == 0 {
		t.Errorf("raycast budget not respected: resolved=%d", resolved)
	}
	if floor.Base.CastShadow || floor.Shadow.HeightState != ShadowHeightPending {
		t.Errorf("non-caster should stay pending (CastShadow=%v state=%d)", floor.Base.CastShadow, floor.Shadow.HeightState)
	}

	dev.ResetFrame()
	renderFrame(r, s)
	shadowDraws := dev.CountDraws("entity-shadows")
	want := resolved - boolToInt(noGround.Shadow.HeightState == ShadowHeightValid)
	if shadowDraws != want {
		t.Errorf("shadow draws %d != resolved casters %d", shadowDraws, want)
	}
	first := dev.FirstDraw("entity-shadows")
	if first < 0 {
		t.Fatal("entity-shadows never drew")
	}
	if dev.Draws[first].Pass != "shadow" {
		t.Errorf("shadow draws in pass %q", dev.Draws[first].Pass)
	}
	fs := slotOf(dev.Draws[first])
	if !approx(r.ObjectValue(fs, offProbe), 0.5) || !approx(r.ObjectValue(fs, offProbe+3), 0) {
		t.Errorf("shadow probe = ambient + height, got %v / %v", r.ObjectValue(fs, offProbe), r.ObjectValue(fs, offProbe+3))
	}

	s.Update(16)
	for i := 0; i < 20; i++ {
		if casters[i].Shadow.HeightState != ShadowHeightValid {
			t.Fatalf("caster %d unresolved after 2 updates", i)
		}
	}
	if noGround.Shadow.HeightState != ShadowHeightNone {
		t.Errorf("entity above nothing should be ShadowHeightNone, got %d", noGround.Shadow.HeightState)
	}
}

func TestSkinnedShadowSampling(t *testing.T) {
	dev, r, s := setup()
	floor := NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, 0), unitQuad("none"), nil, 100)
	s.AddEntity(floor)
	s.AddStaticGeometry(floor)
	s.FinalizeStaticGeometry()
	sk := NewSkinnedMeshEntity(mathx.NewVec3(0, 2, 0), skinnedQuad(), testSkeleton(), nil, 1)
	sk.Base.CastShadow = true
	s.AddEntity(sk)
	s.Update(16)
	if sk.Shadow.HeightState != ShadowHeightValid || !approx(sk.Shadow.Height, 0) {
		t.Fatalf("skinned shadow height not sampled: state=%d", sk.Shadow.HeightState)
	}

	dev.ResetFrame()
	renderFrame(r, s)
	i := dev.FirstDraw("skinned-entity-shadows")
	if i < 0 {
		t.Fatal("skinned shadow pipeline never drew")
	}
	if !approx(r.ObjectValue(slotOf(dev.Draws[i]), offProbe+3), 0) {
		t.Error("skinned shadow height must be written to probe.w")
	}
	frame := sk.Shadow.SampleFrame
	s.Update(16)
	if sk.Shadow.SampleFrame != frame {
		t.Errorf("re-sampled without movement")
	}
	mathx.Mat4Translate(sk.Base.BaseMatrix, sk.Base.BaseMatrix, mathx.NewVec3(1, 0, 0))
	s.Update(16)
	if sk.Shadow.SampleFrame == frame {
		t.Errorf("movement should re-sample")
	}
}

func TestRenderLightingSortsByContribution(t *testing.T) {
	dev, r, s := setup()
	s.Camera.Position.Set(0, 0, 0)
	far := NewPointLightEntity(mathx.NewVec3(100, 0, 0), 5, []float32{1, 0, 0}, 1, nil)
	near := NewPointLightEntity(mathx.NewVec3(1, 0, 0), 5, []float32{0, 1, 0}, 1, nil)
	spot := NewSpotLightEntity(mathx.NewVec3(0, 5, 0), mathx.NewVec3(0, -1, 0), []float32{1, 1, 1}, 2, 30, 20, nil)
	s.AddEntity(far)
	s.AddEntity(near)
	s.AddEntity(spot)
	s.AddEntity(NewDirectionalLightEntity([]float32{0, -1, 0}, []float32{1, 1, 1}, nil))
	s.Update(16)
	dev.ResetFrame()

	renderFrame(r, s)

	d := dev.FirstDraw("directional-light")
	p := dev.FirstDraw("point-light")
	sp := dev.FirstDraw("spot-light")
	if d < 0 || p < 0 || sp < 0 {
		t.Fatalf("light pipelines not drawn: %d %d %d", d, p, sp)
	}
	if !(d < p && p < sp) {
		t.Errorf("lighting order must be directional, point, spot")
	}
	if dev.Draws[d].VertexCount != 3 {
		t.Error("directional light is a fullscreen triangle")
	}
	if dev.CountDraws("point-light") != 2 || dev.CountDraws("spot-light") != 1 {
		t.Errorf("point draws %d spot draws %d", dev.CountDraws("point-light"), dev.CountDraws("spot-light"))
	}
	if r.Stats.LightCount != 3 {
		t.Errorf("LightCount = %d", r.Stats.LightCount)
	}
	// Nearest point light first: params0 = position + range.
	ps := slotOf(dev.Draws[p])
	if !approx(r.ObjectValue(ps, offParams0), 1) || !approx(r.ObjectValue(ps, offParams0+3), 5) {
		t.Errorf("first point light params0 = %v,...,%v (want near light x=1 range 5)", r.ObjectValue(ps, offParams0), r.ObjectValue(ps, offParams0+3))
	}
	if !approx(r.ObjectValue(ps, offParams1+1), 1) {
		t.Error("near light colour must be green in params1")
	}
	ss := slotOf(dev.Draws[sp])
	if !approx(r.ObjectValue(ss, offParams2+1), -1) || !approx(r.ObjectValue(ss, offParams2+3), 0.8660254) {
		t.Errorf("spot params2 = dir + cutoff, got dir.y=%v cutoff=%v", r.ObjectValue(ss, offParams2+1), r.ObjectValue(ss, offParams2+3))
	}
	cam := &s.Camera.Position
	if near.LightScore(cam) <= far.LightScore(cam) {
		t.Errorf("near score %v should beat far %v", near.LightScore(cam), far.LightScore(cam))
	}
	if !approx(spot.LightScore(cam), 2.0/25.0) {
		t.Errorf("spot score = %v", spot.LightScore(cam))
	}
}

func TestRenderLightingDrawsAllLightsBeyondSorterCapacity(t *testing.T) {
	dev, r, s := setup()
	const n = 70 // > renderer's NewLightSorter(64)
	for i := 0; i < n; i++ {
		s.AddEntity(NewPointLightEntity(mathx.NewVec3(float32(i), 0, 0), 5, []float32{1, 1, 1}, 1, nil))
	}
	s.Update(16)
	dev.ResetFrame()

	renderFrame(r, s)

	if got := dev.CountDraws("point-light"); got != n {
		t.Errorf("rendered %d point lights, want %d", got, n)
	}
	if r.Stats.LightCount != n {
		t.Errorf("LightCount = %d, want %d", r.Stats.LightCount, n)
	}
}

// foreignMesh reuses the built-in TypeMesh id on a non-MeshEntity struct. It
// only satisfies Entity (no Drawable), which is all the Scene may require.
type foreignMesh struct{ Base EntityBase }

func (f *foreignMesh) GetBase() *EntityBase          { return &f.Base }
func (f *foreignMesh) Update(frameTime float32) bool { return true }
func (f *foreignMesh) Dispose()                      {}

func TestAddEntityRejectsMismatchedTypeID(t *testing.T) {
	_, _, s := setup()
	f := &foreignMesh{}
	initBase(&f.Base, TypeMesh, nil)
	s.AddEntity(f)
	if s.EntityCount() != 0 {
		t.Fatalf("foreign entity with built-in type id was added")
	}
	initBase(&f.Base, TypeCount+1, nil)
	s.AddEntity(f)
	if s.EntityCount() != 1 {
		t.Fatalf("custom type id entity not added")
	}
	s.Update(16)
	if s.Meshes().Count != 0 {
		t.Errorf("non-drawable entity reached a draw list")
	}
}

func TestVisibilityFillsTypedBuckets(t *testing.T) {
	_, _, s := setup()
	mesh := meshAt(0, 0, 0)
	hidden := meshAt(1, 0, 0)
	hidden.Base.Visible = false
	fps := NewMeshEntity(TypeFPSMesh, mathx.NewVec3(0, 0, 0), unitQuad("none"), nil, 1)
	sk := NewSkinnedMeshEntity(mathx.NewVec3(0, 0, 0), skinnedQuad(), testSkeleton(), nil, 1)
	pl := NewPointLightEntity(mathx.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil)
	sl := NewSpotLightEntity(mathx.NewVec3(0, 5, 0), mathx.NewVec3(0, -1, 0), []float32{1, 1, 1}, 1, 30, 20, nil)
	dl := NewDirectionalLightEntity([]float32{0, -1, 0}, []float32{1, 1, 1}, nil)
	s.AddEntities([]Entity{mesh, hidden, fps, sk, pl, sl, dl})
	s.Update(16)

	meshes, n := s.VisibleMeshes()
	if n != 1 || meshes[0] != mesh {
		t.Fatalf("visible meshes = %d (FPS/skinned/hidden must not land here)", n)
	}
	skinned, n := s.VisibleSkinnedMeshes()
	if n != 1 || skinned[0] != sk {
		t.Fatalf("visible skinned = %d", n)
	}

	var dm rendering.Drawable = mesh
	var df rendering.Drawable = fps
	var ds rendering.Drawable = sk
	var dd rendering.Drawable = dl
	if s.Meshes().Count != 1 || s.Meshes().Items[0] != dm {
		t.Errorf("Meshes() does not alias the visible mesh")
	}
	if s.FPSMeshes().Count != 1 || s.FPSMeshes().Items[0] != df {
		t.Errorf("FPSMeshes() wrong")
	}
	if s.SkinnedMeshes().Count != 1 || s.SkinnedMeshes().Items[0] != ds {
		t.Errorf("SkinnedMeshes() wrong")
	}
	if s.DirectionalLights().Count != 1 || s.DirectionalLights().Items[0] != dd {
		t.Errorf("DirectionalLights() wrong")
	}
	var lp rendering.LightDrawable = pl
	var ls rendering.LightDrawable = sl
	if s.PointLights().Count != 1 || s.PointLights().Items[0] != lp {
		t.Errorf("PointLights() wrong")
	}
	if s.SpotLights().Count != 1 || s.SpotLights().Items[0] != ls {
		t.Errorf("SpotLights() wrong")
	}

	if !approx(mesh.Probe.R, 0.5) || !approx(fps.Probe.G, 0.5) || !approx(sk.Probe.B, 0.5) {
		t.Errorf("probe colours not sampled: %v %v %v", mesh.Probe.R, fps.Probe.G, sk.Probe.B)
	}
	if hidden.Probe.R != 0 {
		t.Errorf("hidden mesh should not be probed")
	}

	s.RemoveEntity(mesh)
	s.RemoveEntity(sk)
	s.Update(16)
	if _, n := s.VisibleMeshes(); n != 0 {
		t.Errorf("mesh bucket not cleared: %d", n)
	}
	if _, n := s.VisibleSkinnedMeshes(); n != 0 {
		t.Errorf("skinned bucket not cleared: %d", n)
	}
}

func TestRenderTransparentSortsAndUploadsLights(t *testing.T) {
	dev, r, s := setup()
	s.Camera.Position.Set(0, 0, 0)
	vp := s.Camera.ViewProjection
	for i := 0; i < 16; i++ {
		vp[i] = 0
	}
	vp[11] = 1
	vp[15] = 1

	glass := rendering.NewMaterial(testBE, "glass")
	glass.Translucent = true
	makeGlass := func(z float32) *MeshEntity {
		m := unitQuad("glass")
		m.MaterialLookup["glass"] = glass
		return NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, z), m, nil, 1)
	}
	nearG := makeGlass(5)
	farG := makeGlass(50)
	opaque := meshAt(0, 0, 10)
	s.AddEntity(nearG)
	s.AddEntity(farG)
	s.AddEntity(opaque)
	s.AddEntity(NewPointLightEntity(mathx.NewVec3(0, 1, 0), 3, []float32{1, 1, 1}, 1, nil))
	s.Update(16)
	dev.ResetFrame()

	if s.Transparent().Count != 2 {
		_, visN := s.VisibleMeshes()
		t.Fatalf("transparent count = %d (visible=%d, translucent=%v)", s.Transparent().Count, visN, nearG.HasTranslucent())
	}
	var first rendering.Drawable = farG
	if s.Transparent().Items[0] != first {
		t.Errorf("farthest translucent should render first")
	}

	renderFrame(r, s)

	if dev.CountDraws("transparent") != 2 {
		t.Errorf("translucent draws = %d", dev.CountDraws("transparent"))
	}
	i := dev.FirstDraw("transparent")
	if i < 0 || dev.Draws[i].Pass != "transparent" {
		t.Fatal("transparent draws must happen in the transparent pass")
	}
	if !approx(r.ObjectValue(slotOf(dev.Draws[i]), 14), 50) {
		t.Error("far glass must be drawn first (back to front)")
	}
	if r.Lighting.PointCount != 1 || r.Lighting.Header[4] != 1 || !approx(r.Lighting.Data[1], 1) {
		t.Errorf("lighting data must hold the point light: count=%d header=%v", r.Lighting.PointCount, r.Lighting.Header)
	}
	// Opaque glass-less mesh is excluded from the translucent draw list but
	// drawn in the gbuffer.
	if dev.CountDraws("geometry") != 1 {
		t.Errorf("opaque geometry draws = %d", dev.CountDraws("geometry"))
	}

	s.RemoveEntity(nearG)
	s.RemoveEntity(farG)
	s.Update(16)
	dev.ResetFrame()
	renderFrame(r, s)
	if s.Transparent().Count != 0 || dev.CountDraws("transparent") != 0 || dev.PassIndex("transparent") >= 0 {
		t.Errorf("expected transparent pass skip")
	}
}

func TestBillboardAndParticles(t *testing.T) {
	dev, r, s := setup()
	tex := rendering.NewTexture(testBE, &rendering.TextureDescriptor{Width: 4, Height: 4})
	bb := NewAnimatedBillboardEntity(mathx.NewVec3(0, 1, 0), &BillboardConfig{
		Texture: tex, Duration: 100, GridSize: 2, FrameCount: 4, Scale: 2,
	})
	pe := NewParticleEmitterEntity(tex, nil, nil)
	pe.AddParticle(mathx.NewVec3(0, 0, 0), mathx.NewVec3(0, 1, 0), 50, 1, 0, 0)
	pe.AddParticle(mathx.NewVec3(1, 0, 0), mathx.NewVec3(0, 1, 0), 500, 1, 0, 0)
	s.AddEntity(bb)
	s.AddEntity(pe)

	if bb.Base.BoundingBox == nil || !approx(bb.Base.BoundingBox.Max.Y, 3) {
		t.Fatalf("billboard bounds = %+v", bb.Base.BoundingBox)
	}

	s.Update(30)
	dev.ResetFrame()
	renderFrame(r, s)

	bi := dev.FirstDraw("billboard")
	if bi < 0 {
		t.Fatal("billboard pipeline never drew")
	}
	bs := slotOf(dev.Draws[bi])
	if !approx(r.ObjectValue(bs, offParams0+2), 0.5) || !approx(r.ObjectValue(bs, offParams1), 1) {
		t.Errorf("billboard params: frame scale %v opacity %v", r.ObjectValue(bs, offParams0+2), r.ObjectValue(bs, offParams1))
	}
	if dev.Draws[bi].Group1 == "" {
		t.Error("billboard must bind its sprite group")
	}

	// Particles: one compute dispatch covering both spawned slots, then one
	// instanced draw of 2 instances.
	if dev.CountDispatches("particle-update") != 1 {
		t.Fatalf("particle dispatches = %d", dev.CountDispatches("particle-update"))
	}
	disp := dev.Dispatches[0]
	ds := disp.ObjectOffset / rendering.ObjectStride
	if disp.X != 1 || !approx(r.ObjectValue(ds, offParams0+1), 30) || !approx(r.ObjectValue(ds, offParams0+2), 2) {
		t.Errorf("dispatch groups=%d frameMs=%v count=%v", disp.X, r.ObjectValue(ds, offParams0+1), r.ObjectValue(ds, offParams0+2))
	}
	pi := dev.FirstDraw("instanced-billboard")
	if pi < 0 || dev.Draws[pi].InstanceCount != 2 {
		t.Errorf("particles should draw 2 instances")
	}
	if dev.LastWrittenBuffer == "" {
		t.Error("particle records must be uploaded")
	}

	s.Update(30)
	if pe.Count() != 1 || pe.SpawnedCount() != 2 {
		t.Errorf("particle count = %d spawned=%d, want 1/2", pe.Count(), pe.SpawnedCount())
	}
	// Dead slots are still dispatched/drawn (GPU zero-sizes them); the banked
	// time carries into the next simulate.
	dev.ResetFrame()
	renderFrame(r, s)
	ds = dev.Dispatches[0].ObjectOffset / rendering.ObjectStride
	if !approx(r.ObjectValue(ds, offParams0+1), 30) {
		t.Errorf("banked frame time = %v", r.ObjectValue(ds, offParams0+1))
	}
	s.Update(50)
	if s.EntityCount() != 1 {
		t.Errorf("billboard should be removed after duration, count=%d", s.EntityCount())
	}
	before := dev.LiveBuffers()
	s.Update(1000)
	if s.EntityCount() != 0 {
		t.Errorf("empty emitter should remove itself, count=%d", s.EntityCount())
	}
	if dev.LiveBuffers() != before-3 {
		t.Errorf("emitter dispose must free particle, instance and curve buffers (%d -> %d)", before, dev.LiveBuffers())
	}
}

func TestParticleEmitterGrowsGPUBuffers(t *testing.T) {
	dev, r, s := setup()
	tex := rendering.NewTexture(testBE, &rendering.TextureDescriptor{Width: 1, Height: 1})
	pe := NewParticleEmitterEntity(tex, nil, nil)
	for i := 0; i < particleInitialCapacity; i++ {
		pe.AddParticle(mathx.NewVec3(0, 0, 0), mathx.NewVec3(0, 1, 0), 5000, 1, 0, 0)
	}
	s.AddEntity(pe)
	s.Update(16)
	renderFrame(r, s)
	capBefore := pe.gpuCapacity
	live := dev.LiveBuffers()
	for i := 0; i < 4; i++ {
		pe.AddParticle(mathx.NewVec3(0, 0, 0), mathx.NewVec3(0, 1, 0), 5000, 1, 0, 0)
	}
	s.Update(16)
	renderFrame(r, s)
	if pe.gpuCapacity <= capBefore || pe.gpuCapacity < pe.SpawnedCount() {
		t.Errorf("capacity %d -> %d for %d particles", capBefore, pe.gpuCapacity, pe.SpawnedCount())
	}
	if dev.LiveBuffers() != live {
		t.Errorf("growth must release the old buffers: %d -> %d live", live, dev.LiveBuffers())
	}
	d := dev.Dispatches[len(dev.Dispatches)-1]
	wantGroups := (pe.SpawnedCount() + particleWorkgroup - 1) / particleWorkgroup
	if d.X != wantGroups {
		t.Errorf("dispatch groups = %d, want %d", d.X, wantGroups)
	}
}

func TestRenderDebugTogglesAndColors(t *testing.T) {
	dev, r, s := setup()
	s.AddEntity(meshAt(0, 0, 0))
	s.AddEntity(NewPointLightEntity(mathx.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil))
	sk := NewSkinnedMeshEntity(mathx.NewVec3(0, 0, 0), skinnedQuad(), testSkeleton(), nil, 1)
	s.AddEntity(sk)
	s.Update(16)
	dev.ResetFrame()

	opts := r.Debug
	opts.ShowBoundingVolumes = false
	opts.ShowWireframes = false
	opts.ShowLightVolumes = false
	opts.ShowSkeleton = false
	renderFrame(r, s)
	if dev.PassIndex("debug") >= 0 {
		t.Fatalf("debug pass should be a no-op when disabled")
	}
	dev.ResetFrame()

	opts.ShowBoundingVolumes = true
	opts.ShowWireframes = true
	opts.ShowLightVolumes = true
	opts.ShowSkeleton = true
	renderFrame(r, s)
	if dev.PassIndex("debug") < 0 || dev.CountDraws("debug") == 0 {
		t.Fatalf("debug pass not drawn")
	}
	if dev.CountDraws("skinned-debug") != 1 {
		t.Errorf("skinned wireframe should use skinned-debug once, got %d", dev.CountDraws("skinned-debug"))
	}
	// 3 bounds (mesh, light, skinned) + mesh wireframe + skinned wireframe + light volume + skeleton.
	if n := dev.CountDraws("debug") + dev.CountDraws("skinned-debug"); n < 7 {
		t.Errorf("debug draws = %d", n)
	}
	// Colours: bounds red for meshes, yellow for lights, magenta for skinned;
	// wireframes white; light volumes yellow; skeleton green.
	seen := map[string]bool{}
	for _, d := range dev.Draws {
		if d.Pipeline != "debug" && d.Pipeline != "skinned-debug" {
			continue
		}
		sl := slotOf(d)
		key := ""
		rr := r.ObjectValue(sl, offParams0)
		gg := r.ObjectValue(sl, offParams0+1)
		bb := r.ObjectValue(sl, offParams0+2)
		switch {
		case rr == 1 && gg == 1 && bb == 1:
			key = "white"
		case rr == 1 && gg == 1 && bb == 0:
			key = "yellow"
		case rr == 1 && gg == 0 && bb == 0:
			key = "red"
		case rr == 1 && gg == 0 && bb == 1:
			key = "magenta"
		case rr == 0 && gg == 1 && bb == 0:
			key = "green"
		}
		seen[key] = true
	}
	for _, k := range []string{"white", "yellow", "red", "magenta", "green"} {
		if !seen[k] {
			t.Errorf("debug colour %s never used", k)
		}
	}
	if dev.PassIndex("debug") < dev.PassIndex("postprocess") {
		t.Error("debug overlay must draw after post-processing")
	}
}

func TestSkinnedEntityAnimationDrivesBones(t *testing.T) {
	_, _, s := setup()
	skel := testSkeleton()
	sk := NewSkinnedMeshEntity(mathx.NewVec3(0, 0, 0), skinnedQuad(), skel, nil, 1)
	s.AddEntity(sk)

	pose := animation.NewPose(2)
	pose.SetBindPose(skel)
	pose.SetJointTransform(0, 0, 2, 0, 0, 0, 0, 1)
	anim := animation.NewAnimation("up", 1, []*animation.Pose{pose}, nil)
	sk.PlayAnimation(anim, true)
	s.Update(16)

	bones := sk.BoneMatrices()
	if !approx(bones[13], 2) {
		t.Errorf("root skin matrix Y translation = %v, want 2", bones[13])
	}
	if sk.Base.BoundingBox == nil || !approx(sk.Base.BoundingBox.Min.Y, 0) {
		t.Errorf("bounds without anim bounds should use mesh AABB: %+v", sk.Base.BoundingBox)
	}
}

func TestSceneUpdateAndRenderNoGrowth(t *testing.T) {
	dev, r, s := setup()
	floor := NewMeshEntity(TypeMesh, mathx.NewVec3(0, 0, 0), unitQuad("none"), nil, 100)
	s.AddEntity(floor)
	s.AddStaticGeometry(floor)
	s.FinalizeStaticGeometry()
	for i := 0; i < 4; i++ {
		m := meshAt(float32(i*3), 2, 0)
		m.Base.CastShadow = true
		s.AddEntity(m)
	}
	s.AddEntity(NewPointLightEntity(mathx.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil))
	s.AddEntity(NewSpotLightEntity(mathx.NewVec3(0, 5, 0), mathx.NewVec3(0, -1, 0), []float32{1, 1, 1}, 1, 30, 20, nil))
	s.AddEntity(NewSkinnedMeshEntity(mathx.NewVec3(2, 2, 0), skinnedQuad(), testSkeleton(), nil, 1))
	tex := rendering.NewTexture(testBE, &rendering.TextureDescriptor{Width: 1, Height: 1})
	pe := NewParticleEmitterEntity(tex, nil, nil)
	pe.AddParticle(mathx.NewVec3(0, 0, 0), mathx.NewVec3(0, 1, 0), 1e9, 1, 0, 0)
	s.AddEntity(pe)

	frame := func() {
		dev.ResetFrame()
		s.Update(16)
		renderFrame(r, s)
	}
	size := func() int {
		return len(s.entities.Items) + len(s.shadowSort.Entries) + len(s.transparentSort.Entries) + len(s.visibleMeshes) + len(s.visibleSkinned) +
			len(s.meshes.Items) + len(s.skinnedMeshes.Items) + len(s.pointLights.Items) + len(s.spotLights.Items) + len(s.transparent.Items)
	}
	for i := 0; i < 3; i++ {
		frame()
	}
	before := size()
	buffers := len(dev.Buffers)
	groups := len(dev.BindGroups)
	for i := 0; i < 50; i++ {
		frame()
	}
	if after := size(); before != after {
		t.Errorf("per-frame buffers grew: %d -> %d", before, after)
	}
	if len(dev.Buffers) != buffers || len(dev.BindGroups) != groups {
		t.Errorf("steady-state frames must not create GPU resources: buffers %d -> %d, bind groups %d -> %d", buffers, len(dev.Buffers), groups, len(dev.BindGroups))
	}
}
