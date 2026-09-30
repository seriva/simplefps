package scene

import (
	"testing"

	"../animation"
	"../physics"
	"../rendering"
	"../systems"
)

// ---------------------------------------------------------------------------
// Compact recording backend (rendering's mock is not importable from tests).
// ---------------------------------------------------------------------------

type call struct {
	Name string
	Arg  any
}

type testBackend struct {
	Recording bool
	Log       []call
	caps      *rendering.Capabilities
}

func newTestBackend() *testBackend {
	return &testBackend{
		Recording: true,
		Log:       make([]call, 0, 512),
		caps:      &rendering.Capabilities{MaxTextureSize: 4096, MaxColorAttachments: 8},
	}
}

func (m *testBackend) record(name string, arg any) {
	if m.Recording {
		m.Log = append(m.Log, call{Name: name, Arg: arg})
	}
}

func (m *testBackend) Count(name string) int {
	n := 0
	for i := 0; i < len(m.Log); i++ {
		if m.Log[i].Name == name {
			n++
		}
	}
	return n
}

func (m *testBackend) CountArg(name string, arg any) int {
	n := 0
	for i := 0; i < len(m.Log); i++ {
		if m.Log[i].Name == name && m.Log[i].Arg == arg {
			n++
		}
	}
	return n
}

// IndexOf returns the first log index with name/arg, or -1.
func (m *testBackend) IndexOf(name string, arg any) int {
	for i := 0; i < len(m.Log); i++ {
		if m.Log[i].Name == name && m.Log[i].Arg == arg {
			return i
		}
	}
	return -1
}

func (m *testBackend) Reset() { m.Log = m.Log[:0] }

func (m *testBackend) Name() string                  { return "mock" }
func (m *testBackend) Init(onReady func(ok bool))    { onReady(true) }
func (m *testBackend) Dispose()                      {}
func (m *testBackend) BeginFrame()                   {}
func (m *testBackend) EndFrame()                     {}
func (m *testBackend) InitShaders(catalog *rendering.ShaderCatalog) {
	catalog.Geometry = rendering.NewShader("geometry", "")
	catalog.SkinnedGeometry = rendering.NewShader("skinnedGeometry", "")
	catalog.EntityShadows = rendering.NewShader("entityShadows", "")
	catalog.SkinnedEntityShadows = rendering.NewShader("skinnedEntityShadows", "")
	catalog.DirectionalLight = rendering.NewShader("directionalLight", "")
	catalog.PointLight = rendering.NewShader("pointLight", "")
	catalog.SpotLight = rendering.NewShader("spotLight", "")
	catalog.KawaseBlur = rendering.NewShader("kawaseBlur", "")
	catalog.PostProcessing = rendering.NewShader("postProcessing", "")
	catalog.FsrEasu = rendering.NewShader("fsrEasu", "")
	catalog.FsrRcas = rendering.NewShader("fsrRcas", "")
	catalog.Transparent = rendering.NewShader("transparent", "")
	catalog.Debug = rendering.NewShader("debug", "")
	catalog.SkinnedDebug = rendering.NewShader("skinnedDebug", "")
	catalog.Billboard = rendering.NewShader("billboard", "")
	catalog.InstancedBillboard = rendering.NewShader("instancedBillboard", "")
}
func (m *testBackend) SupportsFormat(format string) bool { return true }
func (m *testBackend) CreateTexture(desc *rendering.TextureDescriptor) any {
	return &call{Name: "tex"}
}
func (m *testBackend) DisposeTexture(texture any)                                   {}
func (m *testBackend) UploadTextureFromImage(texture any, image any)                {}
func (m *testBackend) GenerateMipmaps(texture any)                                  {}
func (m *testBackend) SetTextureWrapMode(texture any, mode string)                  {}
func (m *testBackend) SetTextureFilter(texture any, minF, magF, mipF string)        {}
func (m *testBackend) SetTextureAnisotropy(texture any, level int)                  {}
func (m *testBackend) BindTexture(texture any, unit int)                            { m.record("BindTexture", unit) }
func (m *testBackend) UnbindTexture(unit int)                                       { m.record("UnbindTexture", unit) }
func (m *testBackend) CreateBuffer(data any, usage string) any {
	m.record("CreateBuffer", usage)
	return &call{Name: usage}
}
func (m *testBackend) UpdateBuffer(buffer any, data any, offset int) { m.record("UpdateBuffer", nil) }
func (m *testBackend) DeleteBuffer(buffer any)                     { m.record("DeleteBuffer", nil) }
func (m *testBackend) CreateShaderProgram(v string, f string) any  { return v }
func (m *testBackend) BindShader(shader any)                       { m.record("BindShader", shader) }
func (m *testBackend) UnbindShader()                               { m.record("UnbindShader", nil) }
func (m *testBackend) DisposeShader(shader any)                    {}
func (m *testBackend) CreateUBO(size int, bindingPoint int) any {
	return &call{Name: "ubo", Arg: size}
}
func (m *testBackend) DeleteUBO(ubo any)                       {}
func (m *testBackend) UpdateUBO(ubo any, data any, offset int) { m.record("UpdateUBO", nil) }
func (m *testBackend) BindUniformBuffer(ubo any)               { m.record("BindUniformBuffer", nil) }
func (m *testBackend) CreateFramebuffer(desc *rendering.FramebufferDescriptor) any {
	return &call{Name: "fb"}
}
func (m *testBackend) DeleteFramebuffer(framebuffer any) {}
func (m *testBackend) BindFramebuffer(framebuffer any)   {}
func (m *testBackend) SetFramebufferAttachment(fb any, attachment int, texture any, level int, layer int) {
}
func (m *testBackend) CreateVertexState(desc *rendering.VertexStateDescriptor) any {
	m.record("CreateVertexState", len(desc.Attributes))
	return &call{Name: "vao"}
}
func (m *testBackend) BindVertexState(state any)                          { m.record("BindVertexState", nil) }
func (m *testBackend) DeleteVertexState(state any)                        { m.record("DeleteVertexState", nil) }
func (m *testBackend) SetBlendState(enabled bool, src, dst string)         {}
func (m *testBackend) SetDepthState(test bool, write bool, funcName string) { m.record("SetDepthState", test) }
func (m *testBackend) SetCullState(enabled bool, face string)             { m.record("SetCullState", enabled) }
func (m *testBackend) SetPolygonOffset(enabled bool, factor, units float32) {}
func (m *testBackend) SetColorMask(r, g, b, a bool)                       {}
func (m *testBackend) SetViewport(x, y, width, height int)                {}
func (m *testBackend) SetDepthRange(near, far float32)                    {}
func (m *testBackend) Clear(options *rendering.ClearOptions)              {}
func (m *testBackend) DrawIndexed(indexBuffer any, indexCount int, indexOffset int, mode string) {
	m.record("DrawIndexed", mode)
}
func (m *testBackend) DrawInstanced(indexBuffer any, indexCount int, instanceCount int) {
	m.record("DrawInstanced", instanceCount)
}
func (m *testBackend) SetUniform(name string, typeName string, value any) {
	m.record("SetUniform", name)
}
func (m *testBackend) GetCapabilities() *rendering.Capabilities { return m.caps }
func (m *testBackend) IsWebGPU() bool                          { return false }
func (m *testBackend) GetCanvas() any                          { return nil }
func (m *testBackend) GetWidth() int                           { return 320 }
func (m *testBackend) GetHeight() int                          { return 240 }
func (m *testBackend) GetNativeWidth() int                     { return 640 }
func (m *testBackend) GetNativeHeight() int                    { return 480 }
func (m *testBackend) GetAspectRatio() float32                 { return 4.0 / 3.0 }
func (m *testBackend) Resize()                                 {}
func (m *testBackend) ClearBindGroupCaches()                   {}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

func approx(a, b float32) bool {
	d := a - b
	return d < 0.001 && d > -0.001
}

// setup wires a mock backend, shaders, shapes, renderer and a fresh scene.
func setup() (*testBackend, *rendering.Renderer, *Scene) {
	mb := newTestBackend()
	r := rendering.NewRenderer(mb)
	rendering.InitShaders()
	rendering.InitShapes()
	r.Init(320, 240, false)
	for i := 0; i < len(physics.ActiveFrustumPlanes); i++ {
		physics.ActiveFrustumPlanes[i] = 0
	}
	cam := systems.NewCamera()
	s := NewScene(cam)
	mb.Reset()
	return mb, r, s
}

// unitQuad builds a 2-triangle mesh in the XZ plane at y=0 spanning [-1,1].
func unitQuad(material string) *rendering.Mesh {
	verts := []float32{-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1}
	idx := []uint32{0, 2, 1, 0, 3, 2}
	groups := []rendering.IndexGroup{rendering.IndexGroup{Material: material, Array: idx}}
	return rendering.NewMesh(verts, nil, nil, nil, groups)
}

func meshAt(x, y, z float32) *MeshEntity {
	return NewMeshEntity(TypeMesh, physics.NewVec3(x, y, z), unitQuad("none"), nil, 1)
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
	return rendering.NewSkinnedMesh(verts, nil, nil, groups, joints, weights)
}

// ---------------------------------------------------------------------------
// Entity management
// ---------------------------------------------------------------------------

func TestAddRemoveEntities(t *testing.T) {
	_, _, s := setup()
	a := meshAt(0, 0, 0)
	b := meshAt(5, 0, 0)
	light := NewPointLightEntity(physics.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil)
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
	// removing again is a no-op
	s.RemoveEntity(a)
	if s.EntityCount() != 2 {
		t.Errorf("double remove changed count")
	}
}

func TestUpdateCallbackAndRemoval(t *testing.T) {
	_, _, s := setup()
	ticks := 0
	keep := NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, 0), unitQuad("none"), func(e Entity, dt float32) bool {
		ticks++
		return true
	}, 1)
	dieNext := NewMeshEntity(TypeMesh, physics.NewVec3(1, 0, 0), unitQuad("none"), func(e Entity, dt float32) bool {
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

	// Invisible entities skip their callback.
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

	_, vis := s.VisibleEntities(TypeMesh)
	if vis != 2 {
		t.Fatalf("all-zero planes should keep everything visible, got %d", vis)
	}

	// Plane x - 10 >= 0 keeps only boxes reaching x >= 10.
	physics.ActiveFrustumPlanes[0] = 1
	physics.ActiveFrustumPlanes[3] = -10
	s.UpdateVisibility()
	items, vis := s.VisibleEntities(TypeMesh)
	if vis != 1 || items[0] != Entity(far) {
		t.Errorf("culling kept %d entities", vis)
	}
	physics.ActiveFrustumPlanes[0] = 0
	physics.ActiveFrustumPlanes[3] = 0
}

func TestMeshEntitySetRotationWarnsWhenStatic(t *testing.T) {
	_, _, _ = setup()
	e := meshAt(0, 0, 0)
	e.SetRotation(0, 90, 0)
	m := e.Base.BaseMatrix
	// Rotating 90° about Y maps local +X to world -Z.
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
	floor := NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, 0), unitQuad("none"), nil, 10)
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
	// Vertices baked in world space (scaled by 10).
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

	// Backface skipped by default; double-sided option hits from below.
	below := s.RaycastStatic(0, -5, 0, 0, 5, 0, nil)
	if below.HasHit {
		t.Errorf("backface should be skipped by default")
	}
	both := s.RaycastStatic(0, -5, 0, 0, 5, 0, &physics.RayOptions{SkipBackfaces: false, Mode: physics.RayModeClosest})
	if !both.HasHit {
		t.Errorf("SkipBackfaces=false should hit from below")
	}

	// Installed as the global static provider for physics.
	out := &physics.RaycastResult{}
	got := physics.RaycastStatic(1, 5, 1, 1, -5, 1, nil, out)
	if got != out || !out.HasHit || !approx(out.HitPointWorld.Y, 0) {
		t.Errorf("GlobalRaycastStatic not wired: %+v", out)
	}

	// Dispose releases the merged trimesh's buffers and drops the reference.
	s.Dispose()
	if tm.Vertices != nil || tm.Tree != nil || s.StaticTrimesh() != nil {
		t.Errorf("Dispose did not release static trimesh")
	}
}

func TestStaticGeometryDoubleSidedFlags(t *testing.T) {
	_, _, s := setup()
	mesh := unitQuad("glass")
	mat := rendering.NewMaterial("glass")
	mat.Translucent = true
	mesh.MaterialLookup["glass"] = mat
	e := NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, 0), mesh, nil, 1)
	s.AddStaticGeometry(e)
	s.FinalizeStaticGeometry()
	tm := s.StaticTrimesh()
	if len(tm.TriangleFlags) != 2 || tm.TriangleFlags[0] != 1 || tm.TriangleFlags[1] != 1 {
		t.Errorf("translucent material should flag triangles double-sided: %v", tm.TriangleFlags)
	}
	// Ray from below now hits even with backface skipping.
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
	e.Base.Collider = physics.NewTrimesh(verts, idx, nil)
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
	out := &physics.Vec3{}
	s.Ambient(out)
	if !approx(out.X, 0.5) || !approx(out.Y, 0.5) {
		t.Errorf("default ambient = %+v", out)
	}
	s.SetAmbient(0.1, 0.2, 0.3)
	buf := make([]float32, 3)
	s.AmbientAt(physics.NewVec3(0, 0, 0), buf)
	if !approx(buf[2], 0.3) {
		t.Errorf("AmbientAt flat = %v", buf)
	}

	// 2x2x2 grid, 64 units apart: x axis goes 0 -> 255 red.
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
	// Halfway along X: red 0.5; grid Z maps to engine +Y (fz = relY/step).
	s.AmbientAt(physics.NewVec3(32, 0, 0), buf)
	if !approx(buf[0], 0.5) || !approx(buf[1], 128.0/255.0) || !approx(buf[2], 0) {
		t.Errorf("trilinear sample = %v", buf)
	}
	s.AmbientAt(physics.NewVec3(0, 64, 0), buf)
	if !approx(buf[2], 1) {
		t.Errorf("engine +Y should map to grid Z: %v", buf)
	}
	// Outside the grid clamps.
	s.AmbientAt(physics.NewVec3(-500, -500, 500), buf)
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

func TestRenderWorldGeometryOrderAndUniforms(t *testing.T) {
	mb, r, s := setup()
	s.AddEntity(NewSkyboxEntity("test", nil))
	s.AddEntity(meshAt(0, 0, 0))
	skinned := NewSkinnedMeshEntity(physics.NewVec3(0, 0, 0), skinnedQuad(), testSkeleton(), nil, 1)
	s.AddEntity(skinned)
	s.Update(16)
	mb.Reset()
	rendering.ClearRenderStats()

	s.RenderWorldGeometry(r)

	geo := mb.IndexOf("BindShader", "geometry")
	sk := mb.IndexOf("BindShader", "skinnedGeometry")
	if geo == -1 || sk == -1 || sk < geo {
		t.Fatalf("shader order wrong: geometry=%d skinned=%d", geo, sk)
	}
	if mb.CountArg("SetUniform", "proceduralNoise") < 2 {
		t.Errorf("proceduralNoise not set for both shaders")
	}
	if mb.CountArg("SetUniform", "uProbeColor") < 3 {
		t.Errorf("uProbeColor set %d times, want >= 3", mb.CountArg("SetUniform", "uProbeColor"))
	}
	if mb.CountArg("SetUniform", "boneMatrices") != 1 {
		t.Errorf("boneMatrices set %d times", mb.CountArg("SetUniform", "boneMatrices"))
	}
	// skybox depth off/on + three draws (skybox 6 groups, mesh, skinned)
	if mb.CountArg("SetDepthState", false) != 1 {
		t.Errorf("skybox depth state not toggled")
	}
	if mb.CountArg("DrawIndexed", "triangles") != 8 {
		t.Errorf("draws = %d, want 8", mb.CountArg("DrawIndexed", "triangles"))
	}
	if mb.Log[len(mb.Log)-1].Name != "SetCullState" {
		t.Errorf("pass must end restoring cull state")
	}
	st := rendering.ActiveRenderStats
	if st.MeshCount != 2 || st.TriangleCount != 4 {
		t.Errorf("stats = %+v", st)
	}

	// Skybox material names assigned to the shared cube.
	if rendering.GlobalShapes.SkyBox.Indices[2].Material != "mat_skybox_test_top" {
		t.Errorf("skybox material = %q", rendering.GlobalShapes.SkyBox.Indices[2].Material)
	}
}

func TestRenderShadowsBudgetAndHeights(t *testing.T) {
	mb, r, s := setup()
	floor := NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, 0), unitQuad("none"), nil, 100)
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
	mb.Reset()

	if !s.HasShadowCasters() {
		t.Fatalf("HasShadowCasters false")
	}

	s.RenderShadows(r)
	resolved := 0
	for i := 0; i < 20; i++ {
		if casters[i].Base.ShadowHeightState == ShadowHeightValid {
			resolved++
			if !approx(casters[i].Base.ShadowHeight, 0) {
				t.Errorf("shadow height = %v", casters[i].Base.ShadowHeight)
			}
		}
	}
	if noGround.Base.ShadowHeightState == ShadowHeightValid {
		resolved++
	}
	pendingAfterFirst := 21 - resolved
	if resolved > shadowRaycastBudget || pendingAfterFirst == 0 {
		t.Errorf("raycast budget not respected: resolved=%d", resolved)
	}
	if mb.IndexOf("BindShader", "entityShadows") == -1 {
		t.Errorf("entityShadows not bound")
	}
	if mb.CountArg("SetUniform", "ambient") < 1 {
		t.Errorf("ambient uniform not set")
	}
	firstDraws := mb.CountArg("DrawIndexed", "triangles")
	if firstDraws != resolved-boolToInt(noGround.Base.ShadowHeightState == ShadowHeightValid) {
		t.Errorf("draws %d != resolved casters", firstDraws)
	}

	// Second frame resolves the rest.
	s.RenderShadows(r)
	for i := 0; i < 20; i++ {
		if casters[i].Base.ShadowHeightState != ShadowHeightValid {
			t.Fatalf("caster %d unresolved after 2 frames", i)
		}
	}
	if noGround.Base.ShadowHeightState != ShadowHeightNone {
		t.Errorf("entity above nothing should be ShadowHeightNone, got %d", noGround.Base.ShadowHeightState)
	}
	// Floor itself does not cast (CastShadow false by default for meshes).
	if floor.Base.CastShadow {
		t.Errorf("mesh entities default CastShadow=false")
	}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func TestSkinnedShadowSampling(t *testing.T) {
	mb, r, s := setup()
	floor := NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, 0), unitQuad("none"), nil, 100)
	s.AddEntity(floor)
	s.AddStaticGeometry(floor)
	s.FinalizeStaticGeometry()
	sk := NewSkinnedMeshEntity(physics.NewVec3(0, 2, 0), skinnedQuad(), testSkeleton(), nil, 1)
	sk.Base.CastShadow = true
	s.AddEntity(sk)
	s.Update(16)
	mb.Reset()

	s.RenderShadows(r)
	if sk.Base.ShadowHeightState != ShadowHeightValid || !approx(sk.Base.ShadowHeight, 0) {
		t.Fatalf("skinned shadow height not sampled: state=%d", sk.Base.ShadowHeightState)
	}
	if mb.IndexOf("BindShader", "skinnedEntityShadows") == -1 || mb.CountArg("SetUniform", "shadowHeight") != 1 {
		t.Errorf("skinned shadow uniforms missing")
	}
	// Unmoved entity within interval: no re-sample.
	frame := sk.Base.ShadowSampleFrame
	s.RenderShadows(r)
	if sk.Base.ShadowSampleFrame != frame {
		t.Errorf("re-sampled without movement")
	}
	// Move beyond epsilon triggers re-sample.
	physics.Mat4Translate(sk.Base.BaseMatrix, sk.Base.BaseMatrix, physics.NewVec3(1, 0, 0))
	s.RenderShadows(r)
	if sk.Base.ShadowSampleFrame == frame {
		t.Errorf("movement should re-sample")
	}
}

func TestRenderLightingSortsByContribution(t *testing.T) {
	mb, r, s := setup()
	s.Camera.Position.Set(0, 0, 0)
	far := NewPointLightEntity(physics.NewVec3(100, 0, 0), 5, []float32{1, 0, 0}, 1, nil)
	near := NewPointLightEntity(physics.NewVec3(1, 0, 0), 5, []float32{0, 1, 0}, 1, nil)
	spot := NewSpotLightEntity(physics.NewVec3(0, 5, 0), physics.NewVec3(0, -1, 0), []float32{1, 1, 1}, 2, 30, 20, nil)
	s.AddEntity(far)
	s.AddEntity(near)
	s.AddEntity(spot)
	s.AddEntity(NewDirectionalLightEntity([]float32{0, -1, 0}, []float32{1, 1, 1}, nil))
	s.Update(16)
	mb.Reset()
	rendering.ClearRenderStats()

	s.RenderLighting(r)

	if mb.IndexOf("BindShader", "directionalLight") == -1 || mb.IndexOf("BindShader", "pointLight") == -1 || mb.IndexOf("BindShader", "spotLight") == -1 {
		t.Fatalf("light shaders not bound")
	}
	if mb.CountArg("SetUniform", "pointLight.posRange") != 2 || mb.CountArg("SetUniform", "spotLight.dirCutoff") != 1 {
		t.Errorf("light uniforms not set")
	}
	if rendering.ActiveRenderStats.LightCount != 3 {
		t.Errorf("LightCount = %d", rendering.ActiveRenderStats.LightCount)
	}
	// Point sorter puts near (index 1) first.
	lights, _ := s.VisibleEntities(TypePointLight)
	first := lights[s.pointSorter.Entries[0].Index].(*PointLightEntity)
	if first != near {
		t.Errorf("nearest light should sort first")
	}
	if !approx(spot.Cutoff, 0.8660254) {
		t.Errorf("spot cutoff = %v", spot.Cutoff)
	}
}

func TestRenderLightingDrawsAllLightsBeyondSorterCapacity(t *testing.T) {
	mb, r, s := setup()
	const n = 70 // > NewLightSorter(64)
	for i := 0; i < n; i++ {
		s.AddEntity(NewPointLightEntity(physics.NewVec3(float32(i), 0, 0), 5, []float32{1, 1, 1}, 1, nil))
	}
	s.Update(16)
	mb.Reset()
	rendering.ClearRenderStats()

	s.RenderLighting(r)

	if got := mb.CountArg("SetUniform", "pointLight.posRange"); got != n {
		t.Errorf("rendered %d point lights, want %d", got, n)
	}
	if rendering.ActiveRenderStats.LightCount != n {
		t.Errorf("LightCount = %d, want %d", rendering.ActiveRenderStats.LightCount, n)
	}
}

// foreignMesh reuses the built-in TypeMesh id on a non-MeshEntity struct.
type foreignMesh struct{ Base EntityBase }

func (f *foreignMesh) GetBase() *EntityBase                                                  { return &f.Base }
func (f *foreignMesh) Update(frameTime float32) bool                                          { return true }
func (f *foreignMesh) UpdateBoundingVolume()                                                  {}
func (f *foreignMesh) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {}
func (f *foreignMesh) RenderShadow(renderMode string, shader *rendering.Shader)               {}
func (f *foreignMesh) RenderWireFrame()                                                       {}
func (f *foreignMesh) Dispose()                                                               {}

func TestAddEntityRejectsMismatchedTypeID(t *testing.T) {
	_, _, s := setup()
	f := &foreignMesh{}
	initBase(&f.Base, TypeMesh, nil)
	s.AddEntity(f)
	if s.EntityCount() != 0 {
		t.Fatalf("foreign entity with built-in type id was added")
	}
	// Unknown type ids are still accepted.
	initBase(&f.Base, TypeCount+1, nil)
	s.AddEntity(f)
	if s.EntityCount() != 1 {
		t.Fatalf("custom type id entity not added")
	}
}

func TestRenderTransparentSortsAndUploadsLights(t *testing.T) {
	mb, r, s := setup()
	s.Camera.Position.Set(0, 0, 0)
	// Frustum planes stay zero (everything visible); give VP a clip-w row so
	// depth sorting is exercised: w = z + 1 (camera looks down +Z).
	vp := s.Camera.ViewProjection
	for i := 0; i < 16; i++ {
		vp[i] = 0
	}
	vp[11] = 1
	vp[15] = 1

	glass := rendering.NewMaterial("glass")
	glass.Translucent = true
	makeGlass := func(z float32) *MeshEntity {
		m := unitQuad("glass")
		m.MaterialLookup["glass"] = glass
		return NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, z), m, nil, 1)
	}
	nearG := makeGlass(5)
	farG := makeGlass(50)
	opaque := meshAt(0, 0, 10)
	s.AddEntity(nearG)
	s.AddEntity(farG)
	s.AddEntity(opaque)
	s.AddEntity(NewPointLightEntity(physics.NewVec3(0, 1, 0), 3, []float32{1, 1, 1}, 1, nil))
	s.Update(16)
	mb.Reset()

	s.RenderTransparent(r)

	if mb.IndexOf("BindShader", "transparent") == -1 {
		_, visN := s.VisibleEntities(TypeMesh)
		t.Fatalf("transparent shader not bound (visible=%d, translucent=%v, sortCount=%d, log=%d)", visN, nearG.HasTranslucent(), s.transparentSort.Count, len(mb.Log))
	}
	if mb.Count("UpdateUBO") < 1 || mb.Count("BindUniformBuffer") < 1 {
		t.Errorf("lighting UBO not uploaded: update=%d bind=%d", mb.Count("UpdateUBO"), mb.Count("BindUniformBuffer"))
	}
	if s.lighting.PointCount != 1 || !approx(s.lighting.Data[1], 1) || !approx(s.lighting.Data[3], 3) {
		t.Errorf("lighting data = count %d, %v", s.lighting.PointCount, s.lighting.Data[0:8])
	}
	if s.transparentSort.Count != 2 {
		t.Fatalf("transparent count = %d", s.transparentSort.Count)
	}
	meshes, _ := s.VisibleEntities(TypeMesh)
	if meshes[s.transparentSort.Entries[0].Index] != Entity(farG) {
		t.Errorf("farthest translucent should render first")
	}
	if mb.CountArg("DrawIndexed", "triangles") != 2 {
		t.Errorf("translucent draws = %d", mb.CountArg("DrawIndexed", "triangles"))
	}

	// No translucent meshes -> early out without binding anything.
	s.RemoveEntity(nearG)
	s.RemoveEntity(farG)
	s.Update(16)
	mb.Reset()
	s.RenderTransparent(r)
	if len(mb.Log) != 0 {
		t.Errorf("expected early-out, got %d calls", len(mb.Log))
	}
}

func TestBillboardAndParticles(t *testing.T) {
	mb, r, s := setup()
	tex := rendering.NewTexture(&rendering.TextureDescriptor{Width: 4, Height: 4, Format: "rgba8"})
	bb := NewAnimatedBillboardEntity(physics.NewVec3(0, 1, 0), &BillboardConfig{
		Texture: tex, Duration: 100, GridSize: 2, FrameCount: 4, Scale: 2,
	})
	pe := NewParticleEmitterEntity(tex, nil, nil)
	pe.AddParticle(physics.NewVec3(0, 0, 0), physics.NewVec3(0, 1, 0), 50, 1, 0, 0)
	pe.AddParticle(physics.NewVec3(1, 0, 0), physics.NewVec3(0, 1, 0), 500, 1, 0, 0)
	s.AddEntity(bb)
	s.AddEntity(pe)

	if bb.Base.BoundingBox == nil || !approx(bb.Base.BoundingBox.Max.Y, 3) {
		t.Fatalf("billboard bounds = %+v", bb.Base.BoundingBox)
	}

	s.Update(30)
	mb.Reset()
	s.RenderBillboards(r)

	if mb.IndexOf("BindShader", "billboard") == -1 || mb.CountArg("SetUniform", "uFrameOffset") != 1 {
		t.Errorf("billboard shader/uniforms missing")
	}
	if mb.IndexOf("BindShader", "instancedBillboard") == -1 || mb.CountArg("DrawInstanced", 2) != 1 {
		t.Errorf("particles should draw 2 instances")
	}
	if mb.CountArg("CreateVertexState", 6) != 1 {
		t.Errorf("particle vertex state should have 6 attributes")
	}

	// Particle 1 dies at 50ms; billboard dies at 100ms.
	s.Update(30)
	if pe.Count() != 1 {
		t.Errorf("particle count = %d, want 1", pe.Count())
	}
	s.Update(50)
	if s.EntityCount() != 1 {
		t.Errorf("billboard should be removed after duration, count=%d", s.EntityCount())
	}
	s.Update(1000)
	if s.EntityCount() != 0 {
		t.Errorf("empty emitter should remove itself, count=%d", s.EntityCount())
	}
}

func TestRenderDebugTogglesAndColors(t *testing.T) {
	mb, r, s := setup()
	s.AddEntity(meshAt(0, 0, 0))
	s.AddEntity(NewPointLightEntity(physics.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil))
	sk := NewSkinnedMeshEntity(physics.NewVec3(0, 0, 0), skinnedQuad(), testSkeleton(), nil, 1)
	s.AddEntity(sk)
	s.Update(16)
	mb.Reset()

	opts := rendering.ActiveDebugOptions
	opts.ShowBoundingVolumes = false
	opts.ShowWireframes = false
	opts.ShowLightVolumes = false
	opts.ShowSkeleton = false
	s.RenderDebug(r)
	if len(mb.Log) != 0 {
		t.Fatalf("debug pass should be a no-op when disabled")
	}

	opts.ShowBoundingVolumes = true
	opts.ShowWireframes = true
	opts.ShowLightVolumes = true
	opts.ShowSkeleton = true
	s.RenderDebug(r)
	if mb.IndexOf("BindShader", "debug") == -1 {
		t.Errorf("debug shader not bound")
	}
	if mb.CountArg("SetUniform", "debugColor") < 4 {
		t.Errorf("debugColor set %d times", mb.CountArg("SetUniform", "debugColor"))
	}
	if mb.CountArg("DrawIndexed", "lines") < 5 {
		t.Errorf("line draws = %d", mb.CountArg("DrawIndexed", "lines"))
	}
	if mb.IndexOf("BindShader", "skinnedDebug") == -1 {
		t.Errorf("skinned wireframe should use skinnedDebug")
	}
	if mb.Count("UpdateBuffer") != 1 {
		t.Errorf("skeleton vertices should upload once, got %d", mb.Count("UpdateBuffer"))
	}
	opts.ShowBoundingVolumes = false
	opts.ShowWireframes = false
	opts.ShowLightVolumes = false
	opts.ShowSkeleton = false

	// Console toggles flip the shared options.
	RegisterDebugCommands()
	systems.GlobalConsole.ExecuteCmd("tbv")
	if !opts.ShowBoundingVolumes {
		t.Errorf("tbv did not toggle bounding volumes")
	}
	opts.ShowBoundingVolumes = false
}

func TestSkinnedEntityAnimationDrivesBones(t *testing.T) {
	_, _, s := setup()
	skel := testSkeleton()
	sk := NewSkinnedMeshEntity(physics.NewVec3(0, 0, 0), skinnedQuad(), skel, nil, 1)
	s.AddEntity(sk)

	// One-frame clip moving the root up by 2.
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
	mb, r, s := setup()
	floor := NewMeshEntity(TypeMesh, physics.NewVec3(0, 0, 0), unitQuad("none"), nil, 100)
	s.AddEntity(floor)
	s.AddStaticGeometry(floor)
	s.FinalizeStaticGeometry()
	for i := 0; i < 4; i++ {
		m := meshAt(float32(i*3), 2, 0)
		m.Base.CastShadow = true
		s.AddEntity(m)
	}
	s.AddEntity(NewPointLightEntity(physics.NewVec3(0, 2, 0), 4, []float32{1, 1, 1}, 1, nil))
	s.AddEntity(NewSpotLightEntity(physics.NewVec3(0, 5, 0), physics.NewVec3(0, -1, 0), []float32{1, 1, 1}, 1, 30, 20, nil))
	s.AddEntity(NewSkinnedMeshEntity(physics.NewVec3(2, 2, 0), skinnedQuad(), testSkeleton(), nil, 1))
	mb.Recording = false

	frame := func() {
		s.Update(16)
		s.RenderWorldGeometry(r)
		s.RenderShadows(r)
		s.RenderFPSGeometry(r)
		s.RenderLighting(r)
		s.RenderTransparent(r)
		s.RenderBillboards(r)
	}
	for i := 0; i < 3; i++ {
		frame()
	}
	before := len(s.entities.Items) + len(s.shadowSort.Entries) + len(s.transparentSort.Entries) + len(s.visible[TypeMesh].Items)
	for i := 0; i < 50; i++ {
		frame()
	}
	after := len(s.entities.Items) + len(s.shadowSort.Entries) + len(s.transparentSort.Entries) + len(s.visible[TypeMesh].Items)
	if before != after {
		t.Errorf("per-frame buffers grew: %d -> %d", before, after)
	}
}
