package rendering

import (
	"testing"

	"js:./interop.d.ts"
)

const (
	depthRange01to1 = 20 // SetDepthRange(0.1, 1.0) as encoded by MockBackend
	depthRange0to01 = 1  // SetDepthRange(0.0, 0.1)
)

func defaultRenderOptions(doFSR bool) *RenderOptions {
	return &RenderOptions{
		ProceduralDetail:     true,
		ShadowBlurIterations: 2,
		ShadowBlurOffset:     0.5,
		LightBlurIterations:  1,
		EmissiveIterations:   3,
		EmissiveOffset:       0.3,
		EmissiveMult:         1.5,
		Gamma:                2.2,
		DoDirt:               true,
		DirtIntensity:        0.4,
		ShadowIntensity:      0.8,
		DoFSR:                doFSR,
		FsrSharpness:         0.2,
	}
}

func TestAllocateBuffersResolvesEveryFormat(t *testing.T) {
	mb := newMockBackend(64, 32, false)
	r := NewRenderer(mb)
	r.Init(64, 32, true)

	textures := map[string]*Texture{
		"Depth":         r.Depth,
		"WorldPosition": r.GBuffer.WorldPosition,
		"Normal":        r.GBuffer.Normal,
		"Color":         r.GBuffer.Color,
		"Emissive":      r.GBuffer.Emissive,
		"Shadow":        r.ShadowBuffer.Shadow,
		"Light":         r.LightBuffer.Light,
		"Scratch":       r.ScratchBuffer.Color,
		"EASU":          r.FSRBuffer.EASU,
		"Noise":         r.ProceduralNoise,
	}
	for name, tex := range textures {
		if tex == nil || tex.GetHandle() == nil {
			t.Errorf("%s texture did not resolve to a backend handle (unknown format?)", name)
		}
	}
	for i := 0; i < len(mb.Log); i++ {
		c := mb.Log[i]
		if c.Name == "CreateTexture" && !mb.Formats[c.Arg.(string)] {
			t.Errorf("CreateTexture called with unsupported format %q", c.Arg)
		}
	}

	// Format parity with renderer.js.
	if r.Depth.GetHandle().(*mockTexture).Format != "depth24" {
		t.Error("Depth must be depth24")
	}
	if r.GBuffer.WorldPosition.GetHandle().(*mockTexture).Format != "rgba16f" {
		t.Error("WorldPosition must be rgba16f")
	}
	if r.GBuffer.Normal.GetHandle().(*mockTexture).Format != "rgba8" {
		t.Error("Normal must be rgba8")
	}
	if r.ShadowBuffer.Shadow.GetHandle().(*mockTexture).Format != "r8" {
		t.Error("Shadow must be r8")
	}
	if r.LightBuffer.Light.GetHandle().(*mockTexture).Format != "rgba8" {
		t.Error("Light must be rgba8")
	}

	// Shared depth attachment across G-buffer, shadow and light FBs.
	depth := r.Depth.GetHandle()
	for _, fb := range []any{r.GBuffer.Framebuffer, r.ShadowBuffer.Framebuffer, r.LightBuffer.Framebuffer} {
		if fb.(*mockFramebuffer).DepthHandle != depth {
			t.Error("G-buffer, shadow and light FBs must share the depth texture")
		}
	}
	for _, fb := range []any{r.EmissiveFB, r.ShadowBuffer.BlurFB, r.LightBuffer.BlurFB, r.ScratchBuffer.Framebuffer} {
		if fb.(*mockFramebuffer).HasDepth {
			t.Error("Blur/scratch FBs must be colour-only")
		}
	}
	if r.GBuffer.Framebuffer.(*mockFramebuffer).ColorCount != 4 {
		t.Error("G-buffer must have 4 colour attachments")
	}

	// FSR target at native size.
	fsr := r.FSRBuffer.Framebuffer.(*mockFramebuffer)
	if fsr.Width != mb.NativeW || fsr.Height != mb.NativeH {
		t.Errorf("FSR buffer must be native size %dx%d, got %dx%d", mb.NativeW, mb.NativeH, fsr.Width, fsr.Height)
	}

	// Noise texture: repeat wrap, mipmaps, anisotropy.
	if mb.CountArg("SetTextureWrapMode", "repeat") == 0 {
		t.Error("Procedural noise must use repeat wrapping")
	}
	if mb.Count("GenerateMipmaps") == 0 {
		t.Error("Procedural noise must generate mipmaps")
	}
	if mb.Count("SetTextureAnisotropy") == 0 {
		t.Error("Procedural noise must set anisotropy")
	}
}

func TestAllocateBuffersSkipsFSRWhenDisabled(t *testing.T) {
	mb := newMockBackend(64, 32, false)
	r := NewRenderer(mb)
	r.Init(64, 32, false)
	if r.FSRBuffer.Framebuffer != nil || r.FSRBuffer.EASU != nil {
		t.Error("FSR buffer must not be allocated when doFSR is false")
	}
	before := mb.Count("CreateTexture")
	r.Resize(128, 64, false)
	if mb.Count("CreateTexture") <= before {
		t.Error("Resize must reallocate textures")
	}
	if mb.Count("DisposeTexture") == 0 {
		t.Error("Resize must dispose previous textures")
	}
	r.Dispose()
	if r.GBuffer.Framebuffer != nil || r.ProceduralNoise != nil || r.FrameDataUBO != nil {
		t.Error("Dispose must release all renderer resources")
	}
}

// indexOfCall returns the log index of the n-th (0-based) call matching name+arg, or -1.
func indexOfCall(mb *MockBackend, name string, arg any, nth int) int {
	seen := 0
	for i := 0; i < len(mb.Log); i++ {
		c := mb.Log[i]
		if c.Name == name && (arg == nil || c.Arg == arg) {
			if seen == nth {
				return i
			}
			seen++
		}
	}
	return -1
}

func assertOrder(t *testing.T, mb *MockBackend, steps []mockCall) {
	last := -1
	for i := 0; i < len(steps); i++ {
		s := steps[i]
		found := -1
		for j := last + 1; j < len(mb.Log); j++ {
			c := mb.Log[j]
			if c.Name == s.Name && (s.Arg == nil || c.Arg == s.Arg) {
				found = j
				break
			}
		}
		if found < 0 {
			t.Fatalf("stage %d (%s %v) not found after log index %d", i, s.Name, s.Arg, last)
		}
		last = found
	}
}

func TestRenderStageOrderWebGL(t *testing.T) {
	mb, r := newMockRenderer(64, 32, false, true)
	scene := newMockScene(mb, true)
	opts := defaultRenderOptions(true)
	r.Debug.ShowWireframes = true
	r.Render(newTestCamera(), scene, opts, 1.5)

	assertOrder(t, mb, []mockCall{
		{"BeginFrame", nil},
		{"UpdateUBO", r.FrameDataUBO},
		// World geometry: depth range 0.1..1, gbuffer, ambient clear, noise on unit 5.
		{"SetDepthRange", depthRange01to1},
		{"BindFramebuffer", r.GBuffer.Framebuffer},
		{"Clear", clearAmbient},
		{"BindTexture", 5},
		{"BindShader", "geometry"},
		{"SetDepthState", "lequal"},
		{"draw", "skybox"},
		{"draw", "mesh"},
		{"draw", "fps"},
		{"BindShader", "skinnedGeometry"},
		{"draw", "skinned"},
		{"SetCullState", true},
		// Shadow pass: white clear, colour mask, lequal, polygon offset.
		{"BindFramebuffer", r.ShadowBuffer.Framebuffer},
		{"Clear", clearWhite},
		{"SetColorMask", true},
		{"SetDepthState", "lequal"},
		{"SetPolygonOffset", true},
		{"BindShader", "entityShadows"},
		{"SetUniform", "ambient"},
		{"shadow", "mesh"},
		{"BindShader", "skinnedEntityShadows"},
		{"shadow", "skinned"},
		{"SetPolygonOffset", false},
		// Shadow blur (WebGL only).
		{"BindShader", "kawaseBlur"},
		{"BindFramebuffer", r.ScratchBuffer.Framebuffer},
		{"BindFramebuffer", r.ShadowBuffer.BlurFB},
		// FPS geometry: depth range 0..0.1, no clear.
		{"SetDepthRange", depthRange0to01},
		{"BindFramebuffer", r.GBuffer.Framebuffer},
		{"BindShader", "geometry"},
		{"draw", "fps"},
		// Lighting: ambient clear, gbuffer 0-3, additive.
		{"BindFramebuffer", r.LightBuffer.Framebuffer},
		{"Clear", clearAmbientColor},
		{"BindTexture", 0},
		{"BindTexture", 1},
		{"BindTexture", 2},
		{"BindTexture", 3},
		{"SetBlendState", "one/one"},
		{"BindShader", "directionalLight"},
		{"draw", "directional"},
		{"BindShader", "pointLight"},
		{"draw", "point"},
		{"BindShader", "spotLight"},
		{"draw", "spot"},
		// Lighting blur (1 iteration → identity copy-back).
		{"BindShader", "kawaseBlur"},
		{"BindFramebuffer", r.LightBuffer.BlurFB},
		// Transparent into light FB (lighting UBO uploaded first), then billboards additive.
		{"BindFramebuffer", r.LightBuffer.Framebuffer},
		{"SetBlendState", "src-alpha/one-minus-src-alpha"},
		{"BindShader", "transparent"},
		{"UpdateUBO", r.LightingUBO},
		{"draw", "transparent"},
		{"SetBlendState", "src-alpha/one"},
		{"BindShader", "billboard"},
		{"draw", "billboard"},
		{"BindShader", "instancedBillboard"},
		{"draw", "particle"},
		// Emissive blur.
		{"BindShader", "kawaseBlur"},
		{"BindFramebuffer", r.EmissiveFB},
		// Post-processing to scratch (FSR on), 6 samplers.
		{"BindFramebuffer", r.ScratchBuffer.Framebuffer},
		{"BindShader", "postProcessing"},
		{"SetUniform", "normalBuffer"},
		{"DrawIndexed", 6},
		// FSR EASU → RCAS.
		{"BindFramebuffer", r.FSRBuffer.Framebuffer},
		{"SetViewport", mb.NativeW},
		{"BindShader", "fsrEasu"},
		{"DrawIndexed", 6},
		{"BindShader", "fsrRcas"},
		{"DrawIndexed", 6},
		// Debug overlay last (wireframes enabled).
		{"BindShader", "debug"},
		{"wire", "mesh"},
		{"wire", "skinned"},
		{"wire", "fps"},
		{"wire", "skybox"},
		{"EndFrame", nil},
	})

	// Stats come from the counted lists: mesh + skinned, 2 + 5 triangles, 2 lights.
	if r.Stats.MeshCount != 2 || r.Stats.TriangleCount != 7 || r.Stats.LightCount != 2 {
		t.Errorf("stats = %+v", r.Stats)
	}
	// FPS meshes are drawn twice (world pass + near-range pass); mesh once.
	if mb.CountArg("draw", "fps") != 2 || mb.CountArg("draw", "mesh") != 1 {
		t.Errorf("fps draws=%d mesh draws=%d", mb.CountArg("draw", "fps"), mb.CountArg("draw", "mesh"))
	}
	// Only the mesh lists are shadow casters; skeletons/bounds are off.
	if mb.Count("shadow") != 2 || mb.Count("skel") != 0 {
		t.Errorf("shadow draws=%d skel draws=%d", mb.Count("shadow"), mb.Count("skel"))
	}

	// Post-processing bound six sampler units.
	ppStart := indexOfCall(mb, "BindShader", "postProcessing", 0)
	for unit := 0; unit < 6; unit++ {
		found := false
		for j := ppStart - 8; j < ppStart; j++ {
			if j >= 0 && mb.Log[j].Name == "BindTexture" && mb.Log[j].Arg == unit {
				found = true
			}
		}
		if !found && unit != 3 { // unit 3 is dirt, nil in this test
			t.Errorf("post-processing did not bind texture unit %d", unit)
		}
	}

	// Kawase blur sessions: shadow + lighting + emissive.
	if got := mb.CountArg("BindShader", "kawaseBlur"); got != 3 {
		t.Errorf("expected 3 kawase blur sessions on WebGL, got %d", got)
	}
	// Ambient sampled from scene lands in the clear colour (Float32Array storage).
	if clearAmbient.Color[0] != float32(0.1) || clearAmbient.Color[1] != float32(0.2) || clearAmbient.Color[2] != float32(0.3) {
		t.Errorf("ambient clear colour not updated: %v", clearAmbient.Color)
	}
}

func TestRenderStageOrderWebGPU(t *testing.T) {
	mb, r := newMockRenderer(64, 32, true, false)
	scene := newMockScene(mb, true)
	opts := defaultRenderOptions(false)
	r.Debug.ShowBoundingVolumes = true
	r.Render(newTestCamera(), scene, opts, 1.5)

	// Shadow blur is skipped on WebGPU: lighting + emissive only.
	if got := mb.CountArg("BindShader", "kawaseBlur"); got != 2 {
		t.Errorf("expected 2 kawase blur sessions on WebGPU, got %d", got)
	}
	if mb.CountArg("BindFramebuffer", r.ShadowBuffer.BlurFB) != 0 {
		t.Error("shadow BlurFB must not be bound on WebGPU")
	}
	// No FSR: post-processing goes to the backbuffer, no EASU/RCAS.
	if mb.CountArg("BindShader", "fsrEasu") != 0 || mb.CountArg("BindShader", "fsrRcas") != 0 {
		t.Error("FSR shaders must not run when DoFSR is false")
	}
	assertOrder(t, mb, []mockCall{
		{"BeginFrame", nil},
		{"draw", "skybox"},
		{"shadow", "mesh"},
		{"draw", "fps"},
		{"draw", "directional"},
		{"draw", "transparent"},
		{"draw", "billboard"},
		{"BindShader", "postProcessing"},
		{"BindShader", "debug"},
		{"SetUniform", "debugColor"},
		{"DrawIndexed", 24},
		{"EndFrame", nil},
	})
	// Only the mesh mock has bounds: exactly one bounding box (24 line indices) drawn.
	if mb.CountArg("DrawIndexed", 24) != 1 {
		t.Errorf("bounding box draws = %d, want 1", mb.CountArg("DrawIndexed", 24))
	}
}

func TestShadowBlurSkippedWithoutCasters(t *testing.T) {
	mb, r := newMockRenderer(64, 32, false, false)
	scene := newMockScene(mb, false)
	r.Render(newTestCamera(), scene, defaultRenderOptions(false), 0)
	if mb.CountArg("BindFramebuffer", r.ShadowBuffer.BlurFB) != 0 {
		t.Error("shadow blur must be skipped when the scene has no casters")
	}
}

func TestTransparentPassSkipsShaderWhenEmpty(t *testing.T) {
	mb, r := newMockRenderer(64, 32, false, false)
	scene := newMockScene(mb, false)
	scene.transparent.Reset()
	r.Render(newTestCamera(), scene, defaultRenderOptions(false), 0)
	if mb.CountArg("BindShader", "transparent") != 0 || mb.CountArg("UpdateUBO", r.LightingUBO) != 0 {
		t.Error("transparent shader/UBO must not be touched without translucent drawables")
	}
}

func TestRenderSortsLightsByScore(t *testing.T) {
	mb, r := newMockRenderer(64, 32, false, false)
	scene := newMockScene(mb, false)
	scene.points.Reset()
	scene.points.Add(&mockDrawable{backend: mb, name: "dim", score: 0.1})
	scene.points.Add(&mockDrawable{backend: mb, name: "bright", score: 5})
	for i := 0; i < MaxPointLights; i++ {
		scene.points.Add(&mockDrawable{backend: mb, name: "filler", score: 1})
	}
	r.Render(newTestCamera(), scene, defaultRenderOptions(false), 0)

	bright := indexOfCall(mb, "draw", "bright", 0)
	dim := indexOfCall(mb, "draw", "dim", 0)
	if bright < 0 || dim < 0 || bright > dim {
		t.Errorf("brightest light must draw first: bright=%d dim=%d", bright, dim)
	}
	if r.Stats.LightCount != MaxPointLights+3 {
		t.Errorf("LightCount = %d", r.Stats.LightCount)
	}
	// Transparent UBO holds the top MaxPointLights only: the dim light is cut.
	if r.lighting.PointCount != MaxPointLights || r.lighting.Data[7] != 5 {
		t.Errorf("lighting UBO count=%d first intensity=%v", r.lighting.PointCount, r.lighting.Data[7])
	}
}

func TestKawaseOddIterationCopyBack(t *testing.T) {
	mb, r := newMockRenderer(64, 32, false, false)
	opts := defaultRenderOptions(false)
	opts.ShadowBlurIterations = 0
	opts.LightBlurIterations = 0
	opts.EmissiveIterations = 3
	r.Render(newTestCamera(), nil, opts, 0)

	// 3 blur draws + 1 identity copy-back; offsets 0.3, 0.6, 0.9 then -1.
	offsets := 0
	for i := 0; i < len(mb.Log); i++ {
		if mb.Log[i].Name == "SetUniform" && mb.Log[i].Arg == "offset" {
			offsets++
		}
	}
	if offsets != 4 {
		t.Errorf("expected 4 offset uploads (3 + identity copy-back), got %d", offsets)
	}
	if mb.CountArg("BindFramebuffer", r.EmissiveFB) != 2 {
		t.Errorf("odd iterations must end on the source FB via copy-back, got %d binds", mb.CountArg("BindFramebuffer", r.EmissiveFB))
	}
}

func TestPackFrameDataLayout(t *testing.T) {
	out := make([]float32, 72)
	cam := newTestCamera()
	PackFrameData(out, cam, 7.5, 640, 360, true)

	for i := 0; i < 16; i++ {
		if out[i] != float32(32+i) {
			t.Fatalf("ViewProjection at [%d] = %f", i, out[i])
		}
		if out[16+i] != float32(48+i) {
			t.Fatalf("InverseViewProjection at [%d] = %f", 16+i, out[16+i])
		}
		if out[32+i] != float32(i) {
			t.Fatalf("View at [%d] = %f", 32+i, out[32+i])
		}
		if out[48+i] != float32(16+i) {
			t.Fatalf("Projection at [%d] = %f", 48+i, out[48+i])
		}
	}
	if out[64] != 1 || out[65] != 2 || out[66] != 3 {
		t.Error("camera position must be at [64..66]")
	}
	if out[67] != 7.5 {
		t.Error("time must be at [67]")
	}
	if out[68] != 640 || out[69] != 360 {
		t.Error("viewport size must be at [68],[69]")
	}
	if out[70] != 1 {
		t.Error("proceduralDetail flag must be at [70]")
	}
	PackFrameData(out, cam, 0, 1, 1, false)
	if out[70] != 0 {
		t.Error("proceduralDetail flag must clear")
	}
	if FrameDataSize != 72*4 {
		t.Error("FrameDataSize must be 288 bytes")
	}
}

func TestUpdateFrameDataUBOUsesBackendSize(t *testing.T) {
	mb, r := newMockRenderer(64, 32, false, false)
	r.UpdateFrameDataUBO(newTestCamera(), 2, false)
	if mb.CountArg("UpdateUBO", r.FrameDataUBO) != 1 {
		t.Fatal("expected one FrameData UBO upload")
	}
	if frameData[68] != 64 || frameData[69] != 32 {
		t.Errorf("viewport must come from backend size, got %fx%f", frameData[68], frameData[69])
	}
}

func heapUsed() int {
	if process == nil || process.memoryUsage == nil {
		return -1
	}
	return process.memoryUsage().heapUsed.(int)
}

func TestRenderFrameDoesNotAllocate(t *testing.T) {
	if heapUsed() < 0 {
		t.Skip("process.memoryUsage unavailable")
	}
	mb, r := newMockRenderer(64, 32, false, true)
	mb.Recording = false
	scene := newMockScene(mb, true)
	opts := defaultRenderOptions(true)
	cam := newTestCamera()
	mat := NewMaterial(mb, "heap")
	mat.Bind(r.Shaders.Geometry)

	frame := func(n int) {
		for i := 0; i < n; i++ {
			r.Render(cam, scene, opts, float32(i)*0.016)
			mat.Bind(r.Shaders.Geometry)
		}
	}
	frame(200) // warm up

	const trials = 5
	const framesPerTrial = 1000
	deltas := make([]int, trials)
	for tr := 0; tr < trials; tr++ {
		before := heapUsed()
		frame(framesPerTrial)
		deltas[tr] = heapUsed() - before
	}
	for i := 1; i < trials; i++ {
		for j := i; j > 0 && deltas[j] < deltas[j-1]; j-- {
			deltas[j], deltas[j-1] = deltas[j-1], deltas[j]
		}
	}
	median := deltas[trials/2]
	// Renderer itself is allocation-free; ~200 B/frame remains from the mock
	// backend boxing float args passed through `any` interface parameters.
	const budget = 512 * 1024
	if median > budget {
		t.Errorf("Render allocates: median heap delta %d bytes over %d frames (budget %d)", median, framesPerTrial, budget)
	}
}

func TestLightSorterAndLightingData(t *testing.T) {
	cam := &physics.Vec3{}
	if ContributionScore(10, 0, 0, 1, cam) != 0.01 || ContributionScore(0, 0, 0, 3, cam) != 3 {
		t.Errorf("ContributionScore = intensity / d² (d²=0 → 1)")
	}
	s := NewLightSorter(3)
	s.Begin()
	s.Add(0, 0.01)
	s.Add(1, 1)
	s.Add(2, 2)
	s.Sort()
	if s.Count != 3 || s.Entries[0].Index != 2 || s.Entries[1].Index != 1 || s.Entries[2].Index != 0 {
		t.Errorf("unexpected sort order: %v", s.Entries)
	}
	s.Begin()
	s.Add(5, 1)
	if s.Count != 1 || len(s.Entries) != 3 {
		t.Errorf("LightSorter must reuse its buffer across frames, count=%d len=%d", s.Count, len(s.Entries))
	}
	s.Add(6, 1)
	s.Add(7, 1)
	s.Add(8, 1) // exceeds capacity 3
	if s.Count != 4 || len(s.Entries) < 4 || s.Entries[3].Index != 8 {
		t.Errorf("LightSorter must grow beyond capacity, count=%d len=%d", s.Count, len(s.Entries))
	}

	ld := NewLightingData()
	if len(ld.Data) != LightingDataSize {
		t.Fatalf("LightingData size %d", len(ld.Data))
	}
	for i := 0; i < MaxPointLights+1; i++ {
		ok := ld.AddPointLight(float32(i), 0, 0, 1, 1, 1, 1, 1)
		if i < MaxPointLights && !ok {
			t.Errorf("point light %d rejected", i)
		}
		if i == MaxPointLights && ok {
			t.Error("point light overflow must be rejected")
		}
	}
	if ld.Data[8*7] != 7 {
		t.Error("point light 7 position not at float 56")
	}
	mb, r := newMockRenderer(8, 8, false, false)
	ld.Upload(r)
	if mb.CountArg("UpdateUBO", r.LightingUBO) != 1 {
		t.Error("Upload must write the lighting UBO")
	}
	if ld.Data[112] != float32(MaxPointLights) {
		t.Errorf("point count must be at [112], got %f", ld.Data[112])
	}
}
