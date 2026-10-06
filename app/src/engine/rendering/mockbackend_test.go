package rendering

import (
	"../mathx"
)

// mockCall is one recorded backend invocation (method name + key argument).
type mockCall struct {
	Name string
	Arg  any
}

type mockTexture struct {
	Format string
	Width  int
	Height int
}

type mockFramebuffer struct {
	ID          int
	ColorCount  int
	HasDepth    bool
	Width       int
	Height      int
	DepthHandle any
}

// MockBackend is a recording RenderBackend used to assert renderer behaviour
// without a GPU. Set Recording=false to disable log appends (heap tests).
type MockBackend struct {
	Recording bool
	WebGPU    bool
	Width     int
	Height    int
	NativeW   int
	NativeH   int
	Log       []mockCall
	Formats   map[string]bool
	fbCounter int
	caps      *Capabilities
	state     *PipelineState
}

func newMockBackend(width, height int, webgpu bool) *MockBackend {
	return &MockBackend{
		Recording: true,
		WebGPU:    webgpu,
		Width:     width,
		Height:    height,
		NativeW:   width * 2,
		NativeH:   height * 2,
		Log:       make([]mockCall, 0, 256),
		Formats: map[string]bool{
			"":        true,
			"depth24": true,
			"rgba16f": true,
			"rgba8":   true,
			"r8":      true,
			"rg8":     true,
			"rgba":    true,
		},
		caps: &Capabilities{MaxTextureSize: 4096, MaxColorAttachments: 8, AnisotropicSupport: true, MaxAnisotropy: 16},
	}
}

func (m *MockBackend) record(name string, arg any) {
	if m.Recording {
		m.Log = append(m.Log, mockCall{Name: name, Arg: arg})
	}
}

// Names returns the ordered method names in the log.
func (m *MockBackend) Names() []string {
	out := make([]string, len(m.Log))
	for i := 0; i < len(m.Log); i++ {
		out[i] = m.Log[i].Name
	}
	return out
}

// Count returns how many times name was recorded.
func (m *MockBackend) Count(name string) int {
	n := 0
	for i := 0; i < len(m.Log); i++ {
		if m.Log[i].Name == name {
			n++
		}
	}
	return n
}

// CountArg returns how many times name was recorded with the given arg.
func (m *MockBackend) CountArg(name string, arg any) int {
	n := 0
	for i := 0; i < len(m.Log); i++ {
		if m.Log[i].Name == name && m.Log[i].Arg == arg {
			n++
		}
	}
	return n
}

func (m *MockBackend) Reset() {
	m.Log = m.Log[:0]
}

func (m *MockBackend) Name() string {
	if m.WebGPU {
		return "webgpu"
	}
	return "webgl2"
}
func (m *MockBackend) Init(onReady func(ok bool)) { onReady(true) }
func (m *MockBackend) Dispose()                 { m.record("Dispose", nil) }
func (m *MockBackend) BeginFrame()              { m.record("BeginFrame", nil) }
func (m *MockBackend) EndFrame()                { m.record("EndFrame", nil) }

// InitShaders assigns labelled shaders; the program handle is the label string.
func (m *MockBackend) InitShaders(catalog *ShaderCatalog) {
	catalog.Geometry = NewShader(m, "geometry", "")
	catalog.SkinnedGeometry = NewShader(m, "skinnedGeometry", "")
	catalog.EntityShadows = NewShader(m, "entityShadows", "")
	catalog.SkinnedEntityShadows = NewShader(m, "skinnedEntityShadows", "")
	catalog.DirectionalLight = NewShader(m, "directionalLight", "")
	catalog.PointLight = NewShader(m, "pointLight", "")
	catalog.SpotLight = NewShader(m, "spotLight", "")
	catalog.KawaseBlur = NewShader(m, "kawaseBlur", "")
	catalog.PostProcessing = NewShader(m, "postProcessing", "")
	catalog.FsrEasu = NewShader(m, "fsrEasu", "")
	catalog.FsrRcas = NewShader(m, "fsrRcas", "")
	catalog.Transparent = NewShader(m, "transparent", "")
	catalog.Debug = NewShader(m, "debug", "")
	catalog.SkinnedDebug = NewShader(m, "skinnedDebug", "")
	catalog.Billboard = NewShader(m, "billboard", "")
	catalog.InstancedBillboard = NewShader(m, "instancedBillboard", "")
}

func (m *MockBackend) SupportsFormat(format string) bool { return m.Formats[format] }

func (m *MockBackend) CreateTexture(desc *TextureDescriptor) any {
	m.record("CreateTexture", desc.Format)
	if !m.Formats[desc.Format] {
		return nil
	}
	return &mockTexture{Format: desc.Format, Width: desc.Width, Height: desc.Height}
}
func (m *MockBackend) DisposeTexture(texture any)                 { m.record("DisposeTexture", nil) }
func (m *MockBackend) UploadTextureFromImage(texture any, image any) {}
func (m *MockBackend) GenerateMipmaps(texture any)                { m.record("GenerateMipmaps", nil) }
func (m *MockBackend) SetTextureWrapMode(texture any, mode string) {
	m.record("SetTextureWrapMode", mode)
}
func (m *MockBackend) SetTextureFilter(texture any, minFilter, magFilter, mipFilter string) {}
func (m *MockBackend) SetTextureAnisotropy(texture any, level int) {
	m.record("SetTextureAnisotropy", level)
}
func (m *MockBackend) BindTexture(texture any, unit int) { m.record("BindTexture", unit) }
func (m *MockBackend) UnbindTexture(unit int)            { m.record("UnbindTexture", unit) }

func (m *MockBackend) CreateBuffer(data any, usage BufferUsage) any {
	m.record("CreateBuffer", string(usage))
	return &mockCall{Name: string(usage)}
}
func (m *MockBackend) UpdateBuffer(buffer any, data any, offset int) { m.record("UpdateBuffer", nil) }
func (m *MockBackend) DeleteBuffer(buffer any)                     { m.record("DeleteBuffer", nil) }

func (m *MockBackend) CreateShaderProgram(vertexOrWgsl string, fragment string) any {
	return vertexOrWgsl
}
func (m *MockBackend) BindShader(shader any) { m.record("BindShader", shader) }
func (m *MockBackend) UnbindShader()         { m.record("UnbindShader", nil) }
func (m *MockBackend) DisposeShader(shader any) {}

func (m *MockBackend) CreateUBO(size int, bindingPoint int) any {
	m.record("CreateUBO", bindingPoint)
	return &mockCall{Name: "ubo", Arg: size}
}
func (m *MockBackend) DeleteUBO(ubo any)                          { m.record("DeleteUBO", nil) }
func (m *MockBackend) UpdateUBO(ubo any, data any, offset int)    { m.record("UpdateUBO", ubo) }
func (m *MockBackend) BindUniformBuffer(ubo any)                  { m.record("BindUniformBuffer", ubo) }

func (m *MockBackend) CreateFramebuffer(desc *FramebufferDescriptor) any {
	m.fbCounter++
	fb := &mockFramebuffer{
		ID:          m.fbCounter,
		ColorCount:  len(desc.ColorAttachments),
		HasDepth:    desc.DepthAttachment != nil,
		Width:       desc.Width,
		Height:      desc.Height,
		DepthHandle: desc.DepthAttachment,
	}
	m.record("CreateFramebuffer", fb)
	return fb
}
func (m *MockBackend) DeleteFramebuffer(framebuffer any) { m.record("DeleteFramebuffer", framebuffer) }
func (m *MockBackend) BindFramebuffer(framebuffer any)   { m.record("BindFramebuffer", framebuffer) }
func (m *MockBackend) SetFramebufferAttachment(framebuffer any, attachment int, texture any, level int, layer int) {
}

func (m *MockBackend) CreateVertexState(desc *VertexStateDescriptor) any {
	m.record("CreateVertexState", nil)
	return &mockCall{Name: "vao"}
}
func (m *MockBackend) BindVertexState(state any) { m.record("BindVertexState", state) }
func (m *MockBackend) DeleteVertexState(state any) {}

// ApplyState records the preset pointer so tests can assert which state a
// pass drew with.
func (m *MockBackend) ApplyState(state *PipelineState) {
	if state == nil {
		return
	}
	m.record("ApplyState", state)
	m.state = state
}
func (m *MockBackend) State() *PipelineState            { return m.state }
func (m *MockBackend) SetViewport(x, y, width, height int) { m.record("SetViewport", width) }
// SetDepthRange records near/far as an int code: near*10*10 + far*10
// (0.1..1 -> 20, 0..0.1 -> 1, 0..1 -> 10).
func (m *MockBackend) SetDepthRange(near, far float32) {
	m.record("SetDepthRange", int(near*10+0.5)*10+int(far*10+0.5))
}
func (m *MockBackend) Clear(options *ClearOptions)       { m.record("Clear", options) }

func (m *MockBackend) DrawIndexed(indexBuffer any, indexCount int, indexOffset int, mode Topology) {
	m.record("DrawIndexed", indexCount)
}
func (m *MockBackend) DrawInstanced(indexBuffer any, indexCount int, instanceCount int) {
	m.record("DrawInstanced", instanceCount)
}
func (m *MockBackend) SetUniform(name string, typeName string, value any) {
	m.record("SetUniform", name)
}

func (m *MockBackend) GetCapabilities() *Capabilities { return m.caps }
func (m *MockBackend) IsWebGPU() bool                 { return m.WebGPU }
func (m *MockBackend) GetCanvas() any                 { return nil }
func (m *MockBackend) GetWidth() int                  { return m.Width }
func (m *MockBackend) GetHeight() int                 { return m.Height }
func (m *MockBackend) GetNativeWidth() int            { return m.NativeW }
func (m *MockBackend) GetNativeHeight() int           { return m.NativeH }
func (m *MockBackend) GetAspectRatio() float32        { return float32(m.Width) / float32(m.Height) }
func (m *MockBackend) Resize()                        { m.record("Resize", nil) }
func (m *MockBackend) ClearBindGroupCaches()          { m.record("ClearBindGroupCaches", nil) }

// mockDrawable records Draw* callbacks into the backend log as
// ("draw"/"shadow"/"wire"/"skel", name).
type mockDrawable struct {
	backend *MockBackend
	name    string
	casts   bool
	tris    int
	score   float32
	spot    bool
	bounds  *mathx.BoundingBox
}

func (d *mockDrawable) Draw(r *Renderer, sh *Shader, mode MaterialMode) { d.backend.record("draw", d.name) }
func (d *mockDrawable) DrawShadow(r *Renderer, sh *Shader)         { d.backend.record("shadow", d.name) }
func (d *mockDrawable) DrawWireframe(r *Renderer, sh *Shader)      { d.backend.record("wire", d.name) }
func (d *mockDrawable) DrawSkeleton(r *Renderer, sh *Shader)       { d.backend.record("skel", d.name) }
func (d *mockDrawable) Bounds() *mathx.BoundingBox               { return d.bounds }
func (d *mockDrawable) TriangleCount() int                         { return d.tris }
func (d *mockDrawable) CastsShadow() bool                          { return d.casts }
func (d *mockDrawable) LightScore(camPos *mathx.Vec3) float32    { return d.score }
func (d *mockDrawable) AddToLighting(data *LightingData) bool {
	if d.spot {
		return data.AddSpotLight(0, 0, 0, 1, 1, 1, 1, d.score, 0, -1, 0, 0.5)
	}
	return data.AddPointLight(0, 0, 0, 1, 1, 1, 1, d.score)
}

// mockScene is a SceneSource with one mock drawable per list.
type mockScene struct {
	backend *MockBackend

	skyboxes, meshes, fps, skinned, directional, billboards, particles, transparent *DrawList
	points, spots                                                                  *LightList
}

// newMockScene builds a scene with one drawable of every kind; casters
// controls whether the mesh/skinned entries cast shadows.
func newMockScene(mb *MockBackend, casters bool) *mockScene {
	s := &mockScene{
		backend:     mb,
		skyboxes:    NewDrawList(1),
		meshes:      NewDrawList(1),
		fps:         NewDrawList(1),
		skinned:     NewDrawList(1),
		directional: NewDrawList(1),
		billboards:  NewDrawList(1),
		particles:   NewDrawList(1),
		transparent: NewDrawList(1),
		points:      NewLightList(1),
		spots:       NewLightList(1),
	}
	s.skyboxes.Add(&mockDrawable{backend: mb, name: "skybox"})
	s.meshes.Add(&mockDrawable{backend: mb, name: "mesh", casts: casters, tris: 2, bounds: mathx.NewBoundingBox()})
	s.fps.Add(&mockDrawable{backend: mb, name: "fps", tris: 3})
	s.skinned.Add(&mockDrawable{backend: mb, name: "skinned", casts: casters, tris: 5})
	s.directional.Add(&mockDrawable{backend: mb, name: "directional"})
	s.points.Add(&mockDrawable{backend: mb, name: "point", score: 1})
	s.spots.Add(&mockDrawable{backend: mb, name: "spot", score: 1, spot: true})
	s.billboards.Add(&mockDrawable{backend: mb, name: "billboard"})
	s.particles.Add(&mockDrawable{backend: mb, name: "particle"})
	s.transparent.Add(&mockDrawable{backend: mb, name: "transparent"})
	return s
}

func (s *mockScene) Ambient(out *mathx.Vec3) {
	out.X = 0.1
	out.Y = 0.2
	out.Z = 0.3
}
func (s *mockScene) Skyboxes() *DrawList          { return s.skyboxes }
func (s *mockScene) Meshes() *DrawList            { return s.meshes }
func (s *mockScene) FPSMeshes() *DrawList         { return s.fps }
func (s *mockScene) SkinnedMeshes() *DrawList     { return s.skinned }
func (s *mockScene) DirectionalLights() *DrawList { return s.directional }
func (s *mockScene) PointLights() *LightList      { return s.points }
func (s *mockScene) SpotLights() *LightList       { return s.spots }
func (s *mockScene) Billboards() *DrawList        { return s.billboards }
func (s *mockScene) ParticleEmitters() *DrawList  { return s.particles }
func (s *mockScene) Transparent() *DrawList       { return s.transparent }

// nopScene is a SceneSource with nothing to draw: every list is empty and the
// ambient colour is black. Used where a test only exercises the screen-space
// passes.
type nopScene struct {
	draw  *DrawList
	light *LightList
}

func newNopScene() *nopScene {
	return &nopScene{draw: NewDrawList(1), light: NewLightList(1)}
}

func (s *nopScene) Ambient(out *mathx.Vec3) {
	out.X = 0
	out.Y = 0
	out.Z = 0
}
func (s *nopScene) Skyboxes() *DrawList          { return s.draw }
func (s *nopScene) Meshes() *DrawList            { return s.draw }
func (s *nopScene) FPSMeshes() *DrawList         { return s.draw }
func (s *nopScene) SkinnedMeshes() *DrawList     { return s.draw }
func (s *nopScene) DirectionalLights() *DrawList { return s.draw }
func (s *nopScene) PointLights() *LightList      { return s.light }
func (s *nopScene) SpotLights() *LightList       { return s.light }
func (s *nopScene) Billboards() *DrawList        { return s.draw }
func (s *nopScene) ParticleEmitters() *DrawList  { return s.draw }
func (s *nopScene) Transparent() *DrawList       { return s.draw }

// newMockRenderer wires a mock backend, shaders, shapes and an initialised renderer.
func newMockRenderer(width, height int, webgpu bool, doFSR bool) (*MockBackend, *Renderer) {
	mb := newMockBackend(width, height, webgpu)
	r := NewRenderer(mb)
	r.InitShaders()
	r.InitShapes()
	r.Init(width, height, doFSR)
	mb.Reset()
	return mb, r
}

func newTestCamera() *CameraView {
	cam := &CameraView{
		View:                  make([]float32, 16),
		Projection:            make([]float32, 16),
		ViewProjection:        make([]float32, 16),
		InverseViewProjection: make([]float32, 16),
	}
	for i := 0; i < 16; i++ {
		cam.View[i] = float32(i)
		cam.Projection[i] = float32(16 + i)
		cam.ViewProjection[i] = float32(32 + i)
		cam.InverseViewProjection[i] = float32(48 + i)
	}
	cam.Position = mathx.Vec3{X: 1, Y: 2, Z: 3}
	return cam
}
