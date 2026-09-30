package rendering

import (
	"../physics"
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
	catalog.Geometry = NewShader("geometry", "")
	catalog.SkinnedGeometry = NewShader("skinnedGeometry", "")
	catalog.EntityShadows = NewShader("entityShadows", "")
	catalog.SkinnedEntityShadows = NewShader("skinnedEntityShadows", "")
	catalog.DirectionalLight = NewShader("directionalLight", "")
	catalog.PointLight = NewShader("pointLight", "")
	catalog.SpotLight = NewShader("spotLight", "")
	catalog.KawaseBlur = NewShader("kawaseBlur", "")
	catalog.PostProcessing = NewShader("postProcessing", "")
	catalog.FsrEasu = NewShader("fsrEasu", "")
	catalog.FsrRcas = NewShader("fsrRcas", "")
	catalog.Transparent = NewShader("transparent", "")
	catalog.Debug = NewShader("debug", "")
	catalog.SkinnedDebug = NewShader("skinnedDebug", "")
	catalog.Billboard = NewShader("billboard", "")
	catalog.InstancedBillboard = NewShader("instancedBillboard", "")
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

func (m *MockBackend) CreateBuffer(data any, usage string) any {
	m.record("CreateBuffer", usage)
	return &mockCall{Name: usage}
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

func (m *MockBackend) SetBlendState(enabled bool, srcFactor, dstFactor string) {
	if enabled {
		m.record("SetBlendState", srcFactor+"/"+dstFactor)
	} else {
		m.record("SetBlendState", "off")
	}
}
func (m *MockBackend) SetDepthState(testEnabled bool, writeEnabled bool, funcName string) {
	m.record("SetDepthState", funcName)
}
func (m *MockBackend) SetCullState(enabled bool, face string) { m.record("SetCullState", enabled) }
func (m *MockBackend) SetPolygonOffset(enabled bool, factor, units float32) {
	m.record("SetPolygonOffset", enabled)
}
func (m *MockBackend) SetColorMask(r, g, b, a bool)      { m.record("SetColorMask", r) }
func (m *MockBackend) SetViewport(x, y, width, height int) { m.record("SetViewport", width) }
// SetDepthRange records near/far as an int code: near*10*10 + far*10
// (0.1..1 -> 20, 0..0.1 -> 1, 0..1 -> 10).
func (m *MockBackend) SetDepthRange(near, far float32) {
	m.record("SetDepthRange", int(near*10+0.5)*10+int(far*10+0.5))
}
func (m *MockBackend) Clear(options *ClearOptions)       { m.record("Clear", options) }

func (m *MockBackend) DrawIndexed(indexBuffer any, indexCount int, indexOffset int, mode string) {
	m.record("DrawIndexed", indexCount)
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

// mockScene records SceneSource callbacks into the backend log as "scene:*".
type mockScene struct {
	backend *MockBackend
	casters bool
}

func (s *mockScene) Ambient(out *physics.Vec3) {
	out.X = 0.1
	out.Y = 0.2
	out.Z = 0.3
}
func (s *mockScene) RenderWorldGeometry(r *Renderer) { s.backend.record("scene:World", nil) }
func (s *mockScene) RenderFPSGeometry(r *Renderer)   { s.backend.record("scene:FPS", nil) }
func (s *mockScene) RenderShadows(r *Renderer)       { s.backend.record("scene:Shadows", nil) }
func (s *mockScene) RenderLighting(r *Renderer)      { s.backend.record("scene:Lighting", nil) }
func (s *mockScene) RenderTransparent(r *Renderer)   { s.backend.record("scene:Transparent", nil) }
func (s *mockScene) RenderBillboards(r *Renderer)    { s.backend.record("scene:Billboards", nil) }
func (s *mockScene) RenderDebug(r *Renderer)         { s.backend.record("scene:Debug", nil) }
func (s *mockScene) HasShadowCasters() bool          { return s.casters }

// newMockRenderer wires a mock backend, shaders, shapes and an initialised renderer.
func newMockRenderer(width, height int, webgpu bool, doFSR bool) (*MockBackend, *Renderer) {
	mb := newMockBackend(width, height, webgpu)
	r := NewRenderer(mb)
	InitShaders()
	InitShapes()
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
	cam.Position = physics.Vec3{X: 1, Y: 2, Z: 3}
	return cam
}
