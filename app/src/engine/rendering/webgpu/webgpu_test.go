package webgpu

import (
	"testing"

	"../" // rendering
)

func TestWebGPUBackendCreation(t *testing.T) {
	backend := NewWebGPUBackend()
	if backend.Name() != "webgpu" {
		t.Errorf("Expected backend name 'webgpu', got '%s'", backend.Name())
	}
	if !backend.IsWebGPU() {
		t.Error("Expected IsWebGPU to return true")
	}
}

func TestWgslShaderSources(t *testing.T) {
	expectedShaders := []string{
		"geometry",
		"skinnedGeometry",
		"entityShadows",
		"skinnedEntityShadows",
		"directionalLight",
		"pointLight",
		"spotLight",
		"kawaseBlur",
		"postProcessing",
		"fsrEasu",
		"fsrRcas",
		"transparent",
		"debug",
		"skinnedDebug",
		"billboard",
		"instancedBillboard",
	}

	for _, name := range expectedShaders {
		def := WgslShaderSources[name]
		if len(def.Code) == 0 {
			t.Errorf("Missing or empty WGSL shader code for %s", name)
		}
		if def.Label == "" {
			t.Errorf("Missing label for %s", name)
		}
	}
}

func TestWebGPUInitShaders(t *testing.T) {
	backend := NewWebGPUBackend()
	catalog := rendering.NewShaderCatalog()
	backend.InitShaders(catalog)

	if catalog.Geometry == nil {
		t.Error("Expected catalog.Geometry to be initialized")
	}
	if catalog.SkinnedGeometry == nil {
		t.Error("Expected catalog.SkinnedGeometry to be initialized")
	}
	if catalog.DirectionalLight == nil {
		t.Error("Expected catalog.DirectionalLight to be initialized")
	}
	if catalog.PointLight == nil {
		t.Error("Expected catalog.PointLight to be initialized")
	}
	if catalog.SpotLight == nil {
		t.Error("Expected catalog.SpotLight to be initialized")
	}
	if catalog.PostProcessing == nil {
		t.Error("Expected catalog.PostProcessing to be initialized")
	}
	if catalog.Debug == nil {
		t.Error("Expected catalog.Debug to be initialized")
	}
	if catalog.Transparent == nil {
		t.Error("Expected catalog.Transparent to be initialized")
	}
}

func TestWebGPUBackendDefaults(t *testing.T) {
    backend := NewWebGPUBackend()
    // Verify default state initialization
    if !backend.DepthState.Test {
        t.Error("Expected DepthState.Test to default to true")
    }
    if !backend.DepthState.Write {
        t.Error("Expected DepthState.Write to default to true")
    }
    if backend.DepthState.Func != "less-equal" {
        t.Errorf("Expected DepthState.Func 'less-equal', got '%s'", backend.DepthState.Func)
    }
    if backend.BlendState.Enabled {
        t.Error("Expected BlendState.Enabled to default to false")
    }
    if !backend.CullState.Enabled {
        t.Error("Expected CullState.Enabled to default to true")
    }
    if backend.CullState.Face != "back" {
        t.Errorf("Expected CullState.Face 'back', got '%s'", backend.CullState.Face)
    }
    if backend.RenderScale != 1.0 {
        t.Errorf("Expected RenderScale 1.0, got %f", backend.RenderScale)
    }
    if backend.ResourceIdCounter != 1 {
        t.Errorf("Expected ResourceIdCounter 1, got %d", backend.ResourceIdCounter)
    }
}

func TestWebGPUStateTracking(t *testing.T) {
    backend := NewWebGPUBackend()
    
    // Test blend state tracking
    backend.SetBlendState(true, "src-alpha", "one-minus-src-alpha")
    if !backend.BlendState.Enabled {
        t.Error("Expected BlendState.Enabled to be true after SetBlendState")
    }
    if backend.BlendState.SrcFactor != "src-alpha" {
        t.Errorf("Expected SrcFactor 'src-alpha', got '%s'", backend.BlendState.SrcFactor)
    }
    if backend.BlendState.DstFactor != "one-minus-src-alpha" {
        t.Errorf("Expected DstFactor 'one-minus-src-alpha', got '%s'", backend.BlendState.DstFactor)
    }
    
    // Test depth state tracking
    backend.SetDepthState(false, true, "always")
    if backend.DepthState.Test {
        t.Error("Expected DepthState.Test to be false after SetDepthState")
    }
    if !backend.DepthState.Write {
        t.Error("Expected DepthState.Write to be true")
    }
    if backend.DepthState.Func != "always" {
        t.Errorf("Expected DepthState.Func 'always', got '%s'", backend.DepthState.Func)
    }
    
    // Test cull state tracking
    backend.SetCullState(true, "front")
    if !backend.CullState.Enabled {
        t.Error("Expected CullState.Enabled to be true")
    }
    if backend.CullState.Face != "front" {
        t.Errorf("Expected CullState.Face 'front', got '%s'", backend.CullState.Face)
    }
}

func TestWebGPUBindTexture(t *testing.T) {
    backend := NewWebGPUBackend()
    
    mockTex := &WebGPUTextureHandle{
        Width:  512,
        Height: 512,
        Format: "rgba8unorm",
    }
    
    backend.BindTexture(mockTex, 0)
    if backend.BoundTextures[0] != mockTex {
        t.Error("Expected texture to be bound at unit 0")
    }
    
    backend.UnbindTexture(0)
    if _, found := backend.BoundTextures[0]; found {
        t.Error("Expected texture unit 0 to be unbound")
    }
}

func TestWebGPUUBOCreation(t *testing.T) {
    backend := NewWebGPUBackend()
    // Without a device, CreateUBO should return nil
    ubo := backend.CreateUBO(64, 0)
    if ubo != nil {
        t.Error("Expected CreateUBO to return nil without device")
    }
}

func TestWebGPUTextureCreation(t *testing.T) {
    backend := NewWebGPUBackend()
    // Without a device, CreateTexture should return nil
    tex := backend.CreateTexture(&rendering.TextureDescriptor{
        Width:  256,
        Height: 256,
        Format: "rgba8unorm",
    })
    if tex != nil {
        t.Error("Expected CreateTexture to return nil without device")
    }
}

func TestWebGPUBufferCreation(t *testing.T) {
    backend := NewWebGPUBackend()
    // Without a device, CreateBuffer should return nil
    buf := backend.CreateBuffer(nil, "vertex")
    if buf != nil {
        t.Error("Expected CreateBuffer to return nil without device")
    }
}

func TestWebGPUPackStructPassesThroughRawUniforms(t *testing.T) {
    backend := NewWebGPUBackend()
    if got := backend.packStruct("debugColor"); got != nil {
        t.Errorf("unset debugColor: got %v, want nil", got)
    }
    color := []float32{1, 1, 0, 1}
    backend.SetUniform("debugColor", "vec4", color)
    got := backend.packStruct("debugColor")
    if len(got) != 4 || got[0] != 1 || got[1] != 1 || got[2] != 0 || got[3] != 1 {
        t.Errorf("debugColor: got %v, want %v", got, color)
    }
    bones := make([]float32, 64*16)
    bones[5] = 2
    backend.SetUniform("boneMatrices", "mat4array", bones)
    if got := backend.packStruct("boneMatrices"); len(got) != 1024 || got[5] != 2 {
        t.Errorf("boneMatrices: len=%d", len(got))
    }
}

func TestWebGPUVertexStateFormats(t *testing.T) {
    backend := NewWebGPUBackend()
    vs := backend.CreateVertexState(&rendering.VertexStateDescriptor{
        Attributes: []rendering.VertexAttribute{
            {Slot: 0, Size: 1, Type: "float", Stride: 24, Offset: 16},
            {Slot: 1, Size: 2, Type: "float"},
            {Slot: 2, Size: 3, Type: "float"},
            {Slot: 3, Size: 4, Type: "float"},
        },
    })
    h, ok := vs.(*WebGPUVertexStateHandle)
    if !ok {
        t.Fatal("Expected WebGPUVertexStateHandle")
    }
    want := []string{"float32", "float32x2", "float32x3", "float32x4"}
    for i, w := range want {
        attrs := h.Layout[i].(map[string]any)["attributes"].([]any)
        got := attrs[0].(map[string]any)["format"].(string)
        if got != w {
            t.Errorf("attribute %d: format %q, want %q", i, got, w)
        }
    }
}

func TestWebGPUFramebufferCreation(t *testing.T) {
    backend := NewWebGPUBackend()
    fb := backend.CreateFramebuffer(&rendering.FramebufferDescriptor{
        Width:  1024,
        Height: 768,
    })
    if fb == nil {
        t.Fatal("Expected framebuffer to be created")
    }
    h, ok := fb.(*WebGPUFramebufferHandle)
    if !ok {
        t.Fatal("Expected WebGPUFramebufferHandle")
    }
    if h.Width != 1024 || h.Height != 768 {
        t.Errorf("Expected 1024x768, got %dx%d", h.Width, h.Height)
    }
}

func TestWebGPUInitReportsFailureHeadless(t *testing.T) {
	backend := NewWebGPUBackend()
	called := false
	ok := true
	backend.Init(func(success bool) {
		called = true
		ok = success
	})
	if !called {
		t.Fatal("Expected onReady to be called synchronously when navigator.gpu is missing")
	}
	if ok {
		t.Error("Expected onReady(false) in headless environment")
	}
	if backend.Canvas != nil {
		t.Error("Expected canvas to be removed after failed init")
	}
}

func TestWebGPUSupportsFormat(t *testing.T) {
	backend := NewWebGPUBackend()
	for _, f := range []string{"depth24", "rgba16f", "rgba8", "r8", "rg8", "rgba"} {
		if !backend.SupportsFormat(f) {
			t.Errorf("Expected canonical format %q to be supported", f)
		}
	}
	if backend.SupportsFormat("bogus") {
		t.Error("Expected unknown format to be rejected")
	}
}

func TestWebGPUPackStructReusesBuffer(t *testing.T) {
	backend := NewWebGPUBackend()
	backend.SetUniform("gamma", "float", float32(2.2))
	backend.SetUniform("emissiveMult", "float", float32(1.5))
	first := backend.packStruct("postProcessParams")
	if first == nil || len(first) != 8 {
		t.Fatalf("Expected 8-float postProcessParams buffer, got %v", first)
	}
	if first[0] != float32(2.2) || first[1] != 1.5 {
		t.Errorf("Expected gamma/emissiveMult packed at [0],[1], got %v", first)
	}
	backend.SetUniform("gamma", "float", float32(1.0))
	second := backend.packStruct("postProcessParams")
	var a any = first.buffer
	var b any = second.buffer
	if a != b {
		t.Error("packStruct must reuse the same pre-allocated buffer across calls")
	}
	if first[0] != 1.0 {
		t.Error("Reused buffer must reflect the latest uniform values")
	}
	if backend.packStruct("unknownStruct") != nil {
		t.Error("Unknown struct name must return nil")
	}
}

func TestMipLevelCountFor(t *testing.T) {
	cases := []struct {
		w, h, want int
	}{
		{1, 1, 1},
		{2, 2, 2},
		{256, 256, 9},
		{512, 128, 10},
		{100, 300, 9},
	}
	for _, c := range cases {
		if got := mipLevelCountFor(c.w, c.h); got != c.want {
			t.Errorf("mipLevelCountFor(%d, %d) = %d, want %d", c.w, c.h, got, c.want)
		}
	}
}

func TestWgslLabelFor(t *testing.T) {
	for name, def := range WgslShaderSources {
		if got := wgslLabelFor(def.Code); got != name {
			t.Errorf("wgslLabelFor(%s source) = %q", name, got)
		}
	}
	if got := wgslLabelFor("not a catalog shader"); got != "unknown" {
		t.Errorf("Expected 'unknown' for unmatched source, got %q", got)
	}
}

func TestSetDepthStateMapsGLFuncNames(t *testing.T) {
	backend := NewWebGPUBackend()
	cases := map[string]string{
		"lequal":     "less-equal",
		"gequal":     "greater-equal",
		"notequal":   "not-equal",
		"less":       "less",
		"always":     "always",
		"less-equal": "less-equal",
	}
	for in, want := range cases {
		backend.SetDepthState(true, true, in)
		if backend.DepthState.Func != want {
			t.Errorf("SetDepthState(%q) -> %q, want %q", in, backend.DepthState.Func, want)
		}
	}
}

func TestGenerateMipmapsNoopWithoutDevice(t *testing.T) {
	backend := NewWebGPUBackend()
	backend.GenerateMipmaps(&WebGPUTextureHandle{MipLevelCount: 4})
	backend.GenerateMipmaps(nil)
}
