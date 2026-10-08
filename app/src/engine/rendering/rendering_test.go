package rendering

import (
	"testing"

	"../mathx"
	"./fakegpu"
	"js:./interop.d.ts"
)

// newTestBackend attaches a fake device to a Backend sized w×h.
func newTestBackend(w, h int) (*fakegpu.Device, *Backend) {
	dev := fakegpu.NewDevice()
	b := NewBackend()
	b.Canvas = map[string]any{"clientWidth": w, "clientHeight": h, "width": w, "height": h}
	var d any = dev
	var ctx any = fakegpu.NewContext(dev, w, h)
	b.InitWithDevice(d, ctx)
	return dev, b
}

// newTestRenderer builds an initialised renderer on a fake device.
func newTestRenderer(w, h int, doFSR bool) (*fakegpu.Device, *Renderer) {
	dev, b := newTestBackend(w, h)
	b.DoFSR = doFSR
	r := NewRenderer(b)
	r.Init(w, h, doFSR)
	return dev, r
}

func newTestCamera() *CameraView {
	cam := &CameraView{
		View:                  mathx.NewMat4(),
		Projection:            mathx.NewMat4(),
		ViewProjection:        mathx.NewMat4(),
		InverseViewProjection: mathx.NewMat4(),
		Position:              mathx.Vec3{X: 1, Y: 2, Z: 3},
	}
	for i := 0; i < 16; i++ {
		cam.View[i] = float32(i)
		cam.Projection[i] = float32(16 + i)
		cam.ViewProjection[i] = float32(32 + i)
		cam.InverseViewProjection[i] = float32(48 + i)
	}
	return cam
}

func defaultRenderOptions(doFSR bool) *RenderOptions {
	return &RenderOptions{
		ProceduralDetail:     true,
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

// quadMesh is a unit quad with every attribute so all pipelines can bind it.
func quadMesh(b *Backend) *Mesh {
	verts := []float32{-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0}
	uvs := []float32{0, 0, 1, 0, 1, 1, 0, 1}
	normals := []float32{0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1}
	return NewMesh(b, verts, uvs, normals, nil, []IndexGroup{{Material: "default", Array: []uint32{0, 1, 2, 0, 2, 3}}})
}

// testDrawable is a minimal Drawable drawing a mesh at a world position.
type testDrawable struct {
	mesh      *Mesh
	material  *Material
	world     mathx.Mat4
	bounds    *mathx.BoundingBox
	shadow    bool
	pos       mathx.Vec3
	intensity float32
	drawn     int
	simulated int
}

func newTestDrawable(b *Backend) *testDrawable {
	m := quadMesh(b)
	return &testDrawable{
		mesh:   m,
		world:  mathx.NewMat4(),
		bounds: m.BoundingBox,
		shadow: true,
	}
}

func (d *testDrawable) Draw(r *Renderer, mode MaterialMode) {
	d.drawn++
	r.NextObject()
	r.ObjectWorld(d.world)
	r.ObjectParams(0, d.pos.X, d.pos.Y, d.pos.Z, d.intensity)
	if d.material != nil {
		r.BindMaterial(d.material)
	}
	d.mesh.Draw(r, d.material != nil, mode)
}

func (d *testDrawable) DrawShadow(r *Renderer) {
	r.NextObject()
	r.ObjectWorld(d.world)
	d.mesh.Draw(r, false, ModeAll)
}

func (d *testDrawable) DrawWireframe(r *Renderer) {
	r.NextObject()
	r.ObjectWorld(d.world)
	r.ObjectParamsVec(0, r.DebugColor())
	d.mesh.DrawWireframe(r)
}

func (d *testDrawable) DrawSkeleton(r *Renderer) {}
func (d *testDrawable) Simulate(r *Renderer, pass GPUComputePassEncoder) {
	d.simulated++
}
func (d *testDrawable) Bounds() *mathx.BoundingBox { return d.bounds }
func (d *testDrawable) TriangleCount() int          { return d.mesh.TriangleCount }
func (d *testDrawable) CastsShadow() bool           { return d.shadow }
func (d *testDrawable) LightScore(camPos *mathx.Vec3) float32 {
	return ContributionScore(d.pos.X, d.pos.Y, d.pos.Z, d.intensity, camPos)
}
func (d *testDrawable) AddToLighting(data *LightingData) bool {
	return data.AddPointLight(d.pos.X, d.pos.Y, d.pos.Z, 1, 1, 1, 1, d.intensity)
}

// testScene is a SceneSource with directly fillable lists.
type testScene struct {
	ambient     mathx.Vec3
	skyboxes    *DrawList
	meshes      *DrawList
	fps         *DrawList
	skinned     *DrawList
	directional *DrawList
	points      *LightList
	spots       *LightList
	billboards  *DrawList
	emitters    *DrawList
	transparent *DrawList
}

func newTestScene() *testScene {
	return &testScene{
		ambient:     mathx.Vec3{X: 0.1, Y: 0.2, Z: 0.3},
		skyboxes:    NewDrawList(4),
		meshes:      NewDrawList(4),
		fps:         NewDrawList(4),
		skinned:     NewDrawList(4),
		directional: NewDrawList(4),
		points:      NewLightList(4),
		spots:       NewLightList(4),
		billboards:  NewDrawList(4),
		emitters:    NewDrawList(4),
		transparent: NewDrawList(4),
	}
}

func (s *testScene) Ambient(out *mathx.Vec3)  { out.X = s.ambient.X; out.Y = s.ambient.Y; out.Z = s.ambient.Z }
func (s *testScene) Skyboxes() *DrawList         { return s.skyboxes }
func (s *testScene) Meshes() *DrawList           { return s.meshes }
func (s *testScene) FPSMeshes() *DrawList        { return s.fps }
func (s *testScene) SkinnedMeshes() *DrawList    { return s.skinned }
func (s *testScene) DirectionalLights() *DrawList { return s.directional }
func (s *testScene) PointLights() *LightList     { return s.points }
func (s *testScene) SpotLights() *LightList      { return s.spots }
func (s *testScene) Billboards() *DrawList       { return s.billboards }
func (s *testScene) ParticleEmitters() *DrawList { return s.emitters }
func (s *testScene) Transparent() *DrawList      { return s.transparent }

func heapUsed() int {
	if process == nil || process.memoryUsage == nil {
		return -1
	}
	return process.memoryUsage().heapUsed.(int)
}

// near compares a Float32Array-backed value with a Go float32 literal
// (which GoFront keeps at double precision).
func near(a, b float32) bool {
	d := a - b
	return d < 1e-5 && d > -1e-5
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

func TestBackendInitWithDeviceCreatesDefaults(t *testing.T) {
	dev, b := newTestBackend(64, 32)
	if !b.Ready() {
		t.Fatal("backend must be ready after InitWithDevice")
	}
	if b.DefaultTextureView == nil || b.DefaultSampler == nil || b.ClampSampler == nil {
		t.Error("default texture view and samplers must exist")
	}
	if dev.TextureWrites != 1 {
		t.Errorf("default white texture must be written once, got %d", dev.TextureWrites)
	}
	if b.GetWidth() != 64 || b.GetHeight() != 32 {
		t.Errorf("size = %dx%d", b.GetWidth(), b.GetHeight())
	}
	b.RenderScale = 0.5
	if b.GetWidth() != 32 || b.SwapchainWidth() != 32 {
		t.Errorf("render scale must shrink width: %d / %d", b.GetWidth(), b.SwapchainWidth())
	}
	b.DoFSR = true
	if b.SwapchainWidth() != 64 {
		t.Error("FSR swapchain must stay native size")
	}
	b.Dispose()
	if !dev.Destroyed || b.Ready() {
		t.Error("Dispose must destroy the device")
	}
}

func TestBackendBufferHelpers(t *testing.T) {
	dev, b := newTestBackend(8, 8)
	buf := b.CreateFloatBuffer("floats", []float32{1, 2, 3}, BufferUsageVertex)
	if len(dev.Buffers) != 1 || dev.Buffers[0].Size() != 12 || dev.Buffers[0].Label() != "floats" {
		t.Fatalf("CreateFloatBuffer: %v", dev.Buffers)
	}
	if dev.BufferWrites != 1 {
		t.Error("initial data must be written")
	}
	b.CreateBuffer("tiny", 1, BufferUsageUniform, nil)
	if dev.Buffers[1].Size() != 4 {
		t.Error("buffer sizes must be 4-byte aligned, min 4")
	}
	b.WriteBufferRange(buf, 0, []float32{1, 2, 3, 4}, 2)
	if dev.LastWriteCount != 2 {
		t.Errorf("WriteBufferRange must pass element count, got %d", dev.LastWriteCount)
	}
	b.WriteBufferRange(buf, 0, []float32{1}, 0)
	b.WriteBuffer(nil, 0, []float32{1})
	if dev.BufferWrites != 2 {
		t.Error("zero-count and nil writes must be skipped")
	}
	b.DestroyBuffer(buf)
	if !dev.Buffers[0].Destroyed() {
		t.Error("DestroyBuffer must destroy")
	}
}

func TestBackendFrameLifecycle(t *testing.T) {
	dev, b := newTestBackend(8, 8)
	b.BeginFrame()
	if b.Encoder == nil || b.SwapchainView == nil {
		t.Fatal("BeginFrame must open an encoder and acquire the swapchain view")
	}
	b.EndFrame()
	if dev.Submits != 1 || b.Encoder != nil || b.SwapchainView != nil {
		t.Error("EndFrame must submit and clear frame state")
	}
	b.EndFrame()
	if dev.Submits != 1 {
		t.Error("EndFrame without BeginFrame must be a no-op")
	}
}

func TestBackendGenerateMipmaps(t *testing.T) {
	dev, b := newTestBackend(8, 8)
	tex := b.CreateGPUTexture("mip", 8, 8, 4, FormatRGBA8, TextureUsageTextureBinding|TextureUsageRenderAttachment)
	b.GenerateMipmaps(tex, FormatRGBA8, 4)
	if dev.Submits != 1 {
		t.Error("mipmap generation must submit its own command buffer")
	}
	if n := dev.CountDraws("mipmap-" + FormatRGBA8); n != 3 {
		t.Errorf("4 mip levels need 3 blit draws, got %d", n)
	}
	dev.ResetFrame()
	b.GenerateMipmaps(tex, FormatRGBA8, 1)
	if dev.Submits != 0 {
		t.Error("single-level textures need no mipmaps")
	}
	if len(dev.Pipelines) != 1 {
		t.Error("mipmap pipeline must be cached per format")
	}
}

func TestMipLevelCount(t *testing.T) {
	if mipLevelCountFor(1, 1) != 1 || mipLevelCountFor(256, 16) != 9 || mipLevelCountFor(300, 2) != 9 {
		t.Error("mipLevelCountFor = floor(log2(max)) + 1")
	}
}

// ---------------------------------------------------------------------------
// Texture
// ---------------------------------------------------------------------------

func TestTextureCreationAndSamplerState(t *testing.T) {
	dev, b := newTestBackend(8, 8)
	data := make([]uint8, 4*4*4)
	tex := NewTexture(b, &TextureDescriptor{Width: 4, Height: 4, Format: FormatRGBA8, Mipmaps: true, Data: data})
	if tex == nil || tex.GPU == nil || tex.View == nil || tex.Sampler == nil {
		t.Fatal("texture must allocate GPU resources")
	}
	if tex.MipLevels != 3 {
		t.Errorf("4x4 mipmapped texture has 3 levels, got %d", tex.MipLevels)
	}
	if dev.TextureWrites != 2 { // default white + this one
		t.Errorf("data must be uploaded, writes=%d", dev.TextureWrites)
	}
	v := tex.Version
	tex.SetWrapMode("clamp-to-edge")
	tex.SetFilter("nearest", "nearest", "nearest")
	tex.SetAnisotropy(4)
	if tex.Version <= v {
		t.Error("sampler changes must bump Version so bind groups rebuild")
	}
	if NewTexture(nil, &TextureDescriptor{Width: 1, Height: 1}).GPU != nil {
		t.Error("nil backend must yield a GPU-less shell")
	}
	rt := NewRenderTarget(b, "rt", 8, 8, FormatRGBA16F, true)
	if rt == nil || rt.Format != FormatRGBA16F || rt.Width != 8 {
		t.Error("render target must record its format and size")
	}
	before := dev.LiveTextures()
	tex.Dispose()
	rt.Dispose()
	if dev.LiveTextures() != before-2 {
		t.Error("Dispose must destroy GPU textures")
	}
}

// ---------------------------------------------------------------------------
// Mesh / Material
// ---------------------------------------------------------------------------

func TestMeshCreationAndBoundingBox(t *testing.T) {
	verts := []float32{-1, -1, -1, 1, 1, 1}
	indices := []IndexGroup{{Material: "default", Array: []uint32{0, 1, 0}}}
	mesh := NewMesh(nil, verts, nil, nil, nil, indices)
	if mesh.BoundingBox == nil {
		t.Fatal("Expected bounding box to be computed")
	}
	if mesh.BoundingBox.Min.X != -1.0 || mesh.BoundingBox.Max.X != 1.0 {
		t.Errorf("Unexpected bounding box bounds: Min=%v Max=%v", mesh.BoundingBox.Min, mesh.BoundingBox.Max)
	}
	if mesh.TriangleCount != 1 {
		t.Errorf("Expected triangle count 1, got %d", mesh.TriangleCount)
	}
}

func TestMeshGPUBuffersFillMissingAttributes(t *testing.T) {
	dev, b := newTestBackend(8, 8)
	verts := []float32{-1, -1, -1, 1, 1, 1}
	mesh := NewMesh(b, verts, nil, nil, nil, []IndexGroup{{Material: "default", Array: []uint32{0, 1, 0}}})
	if mesh.VertexBuffer == nil || mesh.UVBuffer == nil || mesh.NormalBuffer == nil || mesh.LightmapUVBuffer == nil {
		t.Fatal("all four vertex streams must exist even without source data")
	}
	if mesh.Indices[0].IndexBuffer == nil {
		t.Fatal("index buffer must be created")
	}
	before := dev.LiveBuffers()
	mesh.Dispose()
	if dev.LiveBuffers() != before-5 {
		t.Errorf("Dispose must free 4 vertex + 1 index buffers, live=%d before=%d", dev.LiveBuffers(), before)
	}
}

func TestSkinnedMeshCreation(t *testing.T) {
	verts := []float32{0, 0, 0, 1, 1, 1}
	indices := []IndexGroup{{Material: "skin", Array: []uint32{0, 1, 0}}}
	joints := []uint8{0, 0, 0, 0, 1, 0, 0, 0}
	weights := []float32{1, 0, 0, 0, 1, 0, 0, 0}
	sm := NewSkinnedMesh(nil, verts, nil, nil, indices, joints, weights)
	if sm == nil {
		t.Fatal("Expected SkinnedMesh instance")
	}
	if len(sm.GPUJointIndices) != 8 || len(sm.GPUJointWeights) != 8 {
		t.Errorf("Unexpected joint buffer lengths: indices=%d weights=%d", len(sm.GPUJointIndices), len(sm.GPUJointWeights))
	}
	if sm.HasSkinning() {
		t.Error("without a backend there are no joint buffers")
	}
	_, b := newTestBackend(8, 8)
	if !NewSkinnedMesh(b, verts, nil, nil, indices, joints, weights).HasSkinning() {
		t.Error("joint buffers must exist on a live backend")
	}
}

func TestMaterialDataByteLayout(t *testing.T) {
	m := NewMaterial(nil, "layout")
	m.GeomType = 2
	m.EmissiveTexture = &Texture{}
	m.LightmapTexture = &Texture{}
	m.ReflectionStrength = 1.0
	m.Opacity = 0.5

	ints := PackMaterialData(m)
	if len(ints) != 8 {
		t.Fatalf("MaterialData must be 8 x 4 bytes, got %d", len(ints))
	}
	bytes := Reflect.construct(globalThis.Uint8Array, []any{ints.buffer}).([]uint8)
	if len(bytes) != MaterialDataSize {
		t.Fatalf("MaterialData must be %d bytes, got %d", MaterialDataSize, len(bytes))
	}
	expectInt := func(offset int, v int) {
		got := int(bytes[offset]) | int(bytes[offset+1])<<8 | int(bytes[offset+2])<<16 | int(bytes[offset+3])<<24
		if got != v {
			t.Errorf("int32 at byte %d = %d, want %d", offset, got, v)
		}
	}
	expectInt(0, 2)
	expectInt(4, 1)
	expectInt(8, 0)
	expectInt(12, 1)
	if bytes[16] != 0 || bytes[17] != 0 || bytes[18] != 0x80 || bytes[19] != 0x3f {
		t.Errorf("reflectionStrength bytes = %v", bytes[16:20])
	}
	if bytes[20] != 0 || bytes[21] != 0 || bytes[22] != 0x00 || bytes[23] != 0x3f {
		t.Errorf("opacity bytes = %v", bytes[20:24])
	}
	m2 := NewMaterial(nil, "other")
	var buf1 any = ints.buffer
	var buf2 any = PackMaterialData(m2).buffer
	if buf1 != buf2 {
		t.Error("PackMaterialData must reuse the package-level buffer")
	}
}

func TestMaterialBindGroupCachesAndRebuilds(t *testing.T) {
	dev, r := newTestRenderer(8, 8, false)
	b := r.Backend
	m := NewMaterial(b, "bind")
	writes := dev.BufferWrites
	groups := len(dev.BindGroups)

	bg := m.BindGroup(r)
	if bg == nil {
		t.Fatal("BindGroup must create a bind group")
	}
	if dev.BufferWrites != writes+1 {
		t.Errorf("first BindGroup must upload the material UBO once, got %d writes", dev.BufferWrites-writes)
	}
	if m.BindGroup(r) != bg || dev.BufferWrites != writes+1 || len(dev.BindGroups) != groups+1 {
		t.Error("unchanged material must reuse bind group and skip uploads")
	}

	m.Opacity = 0.25
	m.Invalidate()
	m.BindGroup(r)
	if dev.BufferWrites != writes+2 {
		t.Error("Invalidate must re-upload the UBO")
	}

	tex := CreateSolidColorTexture(b, 255, 0, 0, 255)
	m.AlbedoTexture = tex
	m.Invalidate()
	bg2 := m.BindGroup(r)
	if bg2 == bg {
		t.Error("texture change must rebuild the bind group")
	}
	tex.SetWrapMode("clamp-to-edge")
	if m.BindGroup(r) == bg2 {
		t.Error("texture sampler version bump must rebuild the bind group")
	}
	m.Dispose()
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

func TestRendererInitCreatesAllResources(t *testing.T) {
	dev, r := newTestRenderer(64, 32, true)
	if !r.Ready() {
		t.Fatal("renderer must be ready after Init")
	}
	p := r.Pipelines
	pipes := []*Pipeline{p.Geometry, p.Skybox, p.SkinnedGeometry, p.EntityShadows, p.SkinnedEntityShadows,
		p.DirectionalLight, p.PointLight, p.SpotLight, p.Transparent, p.Billboard, p.InstancedBillboard,
		p.PostProcessSwapchain, p.PostProcessScratch, p.FsrEasu, p.FsrRcas, p.Debug, p.SkinnedDebug}
	for i, pp := range pipes {
		if pp == nil || pp.GPU == nil {
			t.Errorf("render pipeline %d missing", i)
		}
	}
	if p.Geometry.CullOff == nil || p.Geometry.CullOff.GPU == nil {
		t.Error("geometry pipeline needs a cull-off twin for double-sided materials")
	}
	if p.KawaseBlur == nil || p.ParticleUpdate == nil {
		t.Error("compute pipelines missing")
	}
	targets := map[string]*Texture{
		"Depth": r.Depth, "WorldPosition": r.GBuffer.WorldPosition, "Normal": r.GBuffer.Normal,
		"Color": r.GBuffer.Color, "Emissive": r.GBuffer.Emissive, "Shadow": r.Shadow,
		"Light": r.Light, "Scratch": r.Scratch, "EASU": r.FsrEasu, "Noise": r.ProceduralNoise,
	}
	for name, tex := range targets {
		if tex == nil || tex.View == nil {
			t.Errorf("%s target did not allocate", name)
		}
	}
	if r.Depth.Format != FormatDepth || r.GBuffer.WorldPosition.Format != FormatRGBA16F || r.Shadow.Format != FormatR8 {
		t.Error("render target formats")
	}
	if r.Shapes.SkyBox == nil || r.Shapes.BoundingBoxMesh == nil || r.Shapes.BillboardQuad == nil ||
		r.Shapes.PointLightVolume == nil || r.Shapes.SpotlightVolume == nil {
		t.Error("shapes must be initialised")
	}
	if r.DefaultMaterial == nil || r.FrameDataUBO == nil || r.Objects.Buffer == nil || r.Bones.Buffer == nil {
		t.Error("persistent buffers missing")
	}
	live := dev.LiveTextures()
	r.Dispose()
	if r.Ready() {
		t.Error("Dispose must mark the renderer not ready")
	}
	if dev.LiveTextures() >= live {
		t.Error("Dispose must free render targets")
	}
}

func TestAllocateBuffersSkipsFSRWhenDisabled(t *testing.T) {
	_, r := newTestRenderer(64, 32, false)
	if r.FsrEasu != nil {
		t.Error("FSR target must not allocate when disabled")
	}
	r.Resize(64, 32, true)
	if r.FsrEasu == nil {
		t.Error("enabling FSR on resize must allocate the EASU target")
	}
	r.Resize(32, 16, true)
	if r.Width != 32 || r.Depth.Width != 32 {
		t.Error("Resize must reallocate targets at the new size")
	}
}

func TestRendererWithNilBackend(t *testing.T) {
	r := NewRenderer(nil)
	r.Init(8, 8, false)
	if r.Ready() {
		t.Error("nil backend must not initialise")
	}
	r.Render(newTestCamera(), newTestScene(), defaultRenderOptions(false), 0)
	r.Dispose()
}

func TestRenderRequiresInputs(t *testing.T) {
	dev, r := newTestRenderer(8, 8, false)
	dev.ResetFrame()
	r.Render(nil, newTestScene(), defaultRenderOptions(false), 0)
	r.Render(newTestCamera(), nil, defaultRenderOptions(false), 0)
	r.Render(newTestCamera(), newTestScene(), nil, 0)
	if dev.Submits != 0 {
		t.Error("Render with missing inputs must not submit")
	}
}

func TestPackFrameDataLayout(t *testing.T) {
	out := make([]float32, 72)
	cam := newTestCamera()
	PackFrameData(out, cam, 7.5, 640, 360, true)
	for i := 0; i < 16; i++ {
		if out[i] != float32(32+i) || out[16+i] != float32(48+i) || out[32+i] != float32(i) || out[48+i] != float32(16+i) {
			t.Fatalf("matrix layout wrong at %d", i)
		}
	}
	if out[64] != 1 || out[65] != 2 || out[66] != 3 || out[67] != 7.5 || out[68] != 640 || out[69] != 360 || out[70] != 1 {
		t.Error("frame data tail layout")
	}
	PackFrameData(out, cam, 0, 1, 1, false)
	if out[70] != 0 {
		t.Error("proceduralDetail flag must clear")
	}
	if FrameDataSize != 72*4 {
		t.Error("FrameDataSize must be 288 bytes")
	}
}

func TestObjectRingSlotsAndFlush(t *testing.T) {
	dev, r := newTestRenderer(8, 8, false)
	r.Objects.reset()
	r.NextObject()
	r.ObjectParams(0, 1, 2, 3, 4)
	r.NextObject()
	m := mathx.NewMat4()
	m[12] = 9
	r.ObjectWorld(m)
	r.ObjectProbe(5, 6, 7, 8)
	r.ObjectParams(2, 0.5, 0, 0, 0)
	if r.Objects.Count != 2 || r.Objects.Slot() != 1 {
		t.Fatalf("ring count=%d slot=%d", r.Objects.Count, r.Objects.Slot())
	}
	if r.ObjectValue(0, objParams0) != 1 || r.ObjectValue(0, objParams0+3) != 4 {
		t.Error("params0 of slot 0")
	}
	if r.ObjectValue(1, 12) != 9 || r.ObjectValue(1, objProbe+3) != 8 || r.ObjectValue(1, objParams2) != 0.5 {
		t.Error("slot 1 values")
	}
	if r.ObjectValue(1, objParams0) != 0 {
		t.Error("NextObject must zero params")
	}
	bones := make([]float32, 32)
	bones[0] = 1
	if !r.ObjectBones(bones) || r.Bones.Count != 2 || r.ObjectValue(1, objMisc) != 0 {
		t.Error("first bone upload starts at matrix 0")
	}
	if !r.ObjectBones(bones) || r.ObjectValue(1, objMisc) != 2 {
		t.Error("second upload must start at matrix 2")
	}
	dev.ResetFrame()
	r.flushRings()
	if dev.BufferWrites != 2 {
		t.Errorf("flush must write object ring and bone ring, got %d writes", dev.BufferWrites)
	}
	if dev.LastWrittenBuffer != "bone-ring" || dev.LastWriteCount != 64 {
		t.Errorf("bone upload count = %d (%s)", dev.LastWriteCount, dev.LastWrittenBuffer)
	}

	r.Objects.reset()
	for i := 0; i < ObjectRingSlots+5; i++ {
		r.NextObject()
	}
	if r.Objects.Count != ObjectRingSlots || r.Objects.Slot() != ObjectRingSlots-1 {
		t.Error("overflow must clamp to the last slot")
	}
}

func TestRenderPassOrderAndPipelines(t *testing.T) {
	dev, r := newTestRenderer(64, 32, true)
	s := newTestScene()
	b := r.Backend
	s.skyboxes.Add(newTestDrawable(b))
	s.meshes.Add(newTestDrawable(b))
	s.fps.Add(newTestDrawable(b))
	s.directional.Add(newTestDrawable(b))
	s.points.Add(newTestDrawable(b))
	s.spots.Add(newTestDrawable(b))
	tr := newTestDrawable(b)
	tr.material = NewMaterial(b, "glass")
	tr.material.Translucent = true
	tr.mesh.MaterialLookup["default"] = tr.material
	s.transparent.Add(tr)
	s.billboards.Add(newTestDrawable(b))
	em := newTestDrawable(b)
	s.emitters.Add(em)
	r.Debug.ShowBoundingVolumes = true

	dev.ResetFrame()
	r.Render(newTestCamera(), s, defaultRenderOptions(true), 1)

	order := []string{"gbuffer", "shadow", "fps-geometry", "lighting", "transparent", "postprocess-scratch", "fsr-easu", "fsr-rcas", "debug"}
	last := -1
	for _, label := range order {
		idx := dev.PassIndex(label)
		if idx < 0 {
			t.Errorf("pass %q not recorded", label)
			continue
		}
		if idx < last {
			t.Errorf("pass %q out of order", label)
		}
		last = idx
	}
	computePasses := 0
	for _, p := range dev.Passes {
		if p.Compute {
			computePasses++
		}
	}
	// light blur, particle simulate, emissive blur
	if computePasses != 3 {
		t.Errorf("expected 3 compute passes, got %d", computePasses)
	}
	if em.simulated != 1 {
		t.Error("emitters must be simulated once per frame")
	}
	for _, pipe := range []string{"skybox", "geometry", "entity-shadows", "directional-light", "point-light", "spot-light",
		"transparent", "billboard", "instanced-billboard", "postprocess-scratch", "fsr-easu", "fsr-rcas", "debug"} {
		if dev.CountDraws(pipe) == 0 {
			t.Errorf("pipeline %q never drew", pipe)
		}
	}
	if dev.CountDraws("geometry") != 3 {
		t.Errorf("mesh + fps (gbuffer) + fps (near) = 3 geometry draws, got %d", dev.CountDraws("geometry"))
	}
	if dev.CountDispatches("kawase-blur") != 2+4 {
		t.Errorf("light blur (1+copy-back) + emissive blur (3+copy-back) dispatches, got %d", dev.CountDispatches("kawase-blur"))
	}
	if dev.Submits != 1 {
		t.Errorf("one submit per frame, got %d", dev.Submits)
	}
	if r.Stats.MeshCount != 1 || r.Stats.LightCount != 2 || r.Stats.TriangleCount != 2 || r.Stats.DrawCalls == 0 {
		t.Errorf("stats %+v", *r.Stats)
	}
	if dev.PassIndex("postprocess") >= 0 {
		t.Error("with FSR the post pass must target scratch, not the swapchain")
	}
}

func TestRenderWithoutFSRTargetsSwapchain(t *testing.T) {
	dev, r := newTestRenderer(64, 32, false)
	s := newTestScene()
	dev.ResetFrame()
	r.Render(newTestCamera(), s, defaultRenderOptions(false), 1)
	if dev.PassIndex("postprocess") < 0 || dev.PassIndex("fsr-easu") >= 0 {
		t.Error("without FSR post-processing writes the swapchain directly")
	}
	if dev.PassIndex("fps-geometry") >= 0 || dev.PassIndex("transparent") >= 0 || dev.PassIndex("debug") >= 0 {
		t.Error("empty fps/transparent/debug passes must be skipped")
	}
	if dev.CountDraws("postprocess-swapchain") != 1 {
		t.Error("post process is one fullscreen draw")
	}
}

func TestRenderPostProcessParamsAndAmbient(t *testing.T) {
	dev, r := newTestRenderer(8, 8, false)
	s := newTestScene()
	opts := defaultRenderOptions(false)
	dev.ResetFrame()
	r.Render(newTestCamera(), s, opts, 1)
	i := dev.FirstDraw("postprocess-swapchain")
	if i < 0 {
		t.Fatal("no post draw")
	}
	slot := dev.Draws[i].ObjectOffset / ObjectStride
	if !near(r.ObjectValue(slot, objParams0), opts.Gamma) || !near(r.ObjectValue(slot, objParams0+1), opts.EmissiveMult) ||
		!near(r.ObjectValue(slot, objParams0+2), opts.DirtIntensity) || !near(r.ObjectValue(slot, objParams0+3), opts.ShadowIntensity) {
		t.Error("post params0 = gamma, emissiveMult, dirt, shadowIntensity")
	}
	amb := r.Ambient()
	if !near(amb[0], 0.1) || !near(amb[1], 0.2) || !near(amb[2], 0.3) || !near(r.ObjectValue(slot, objParams1), 0.1) {
		t.Error("ambient must be sampled from the scene and passed to post")
	}
	opts.DoDirt = false
	r.Render(newTestCamera(), s, opts, 1)
	if r.ObjectValue(slot, objParams0+2) != 0 {
		t.Error("DoDirt=false must zero dirt intensity")
	}
}

func TestRenderSortsLightsByScore(t *testing.T) {
	dev, r := newTestRenderer(8, 8, false)
	s := newTestScene()
	b := r.Backend
	far := newTestDrawable(b)
	far.pos = mathx.Vec3{X: 100, Y: 2, Z: 3}
	far.intensity = 1
	near := newTestDrawable(b)
	near.pos = mathx.Vec3{X: 1, Y: 2, Z: 3}
	near.intensity = 1
	s.points.Add(far)
	s.points.Add(near)
	s.transparent.Add(newTestDrawable(b))
	dev.ResetFrame()
	r.Render(newTestCamera(), s, defaultRenderOptions(false), 0)
	i := dev.FirstDraw("point-light")
	if i < 0 || dev.Draws[i+1].Pipeline != "point-light" {
		t.Fatal("expected two point light draws")
	}
	if r.ObjectValue(dev.Draws[i].ObjectOffset/ObjectStride, objParams0) != 1 {
		t.Error("nearest light must be drawn first")
	}
	if r.Lighting.PointCount != 2 || r.Lighting.Data[0] != 1 || r.Lighting.Data[LightFloats] != 100 {
		t.Error("transparent lighting must be packed in sorted order")
	}
}

func TestDebugPassColors(t *testing.T) {
	dev, r := newTestRenderer(8, 8, false)
	s := newTestScene()
	m := newTestDrawable(r.Backend)
	s.meshes.Add(m)
	s.points.Add(newTestDrawable(r.Backend))
	r.Debug.ShowWireframes = true
	r.Debug.ShowLightVolumes = true
	dev.ResetFrame()
	r.Render(newTestCamera(), s, defaultRenderOptions(false), 0)
	n := dev.CountDraws("debug")
	if n != 2 {
		t.Fatalf("expected mesh wireframe + light volume debug draws, got %d", n)
	}
	i := dev.FirstDraw("debug")
	s0 := dev.Draws[i].ObjectOffset / ObjectStride
	s1 := dev.Draws[i+1].ObjectOffset / ObjectStride
	if r.ObjectValue(s0, objParams0) != 1 || r.ObjectValue(s0, objParams0+2) != 1 {
		t.Error("wireframes are white")
	}
	if r.ObjectValue(s1, objParams0) != 1 || r.ObjectValue(s1, objParams0+2) != 0 {
		t.Error("light volumes are yellow")
	}
}

func TestLightSorterAndLightingData(t *testing.T) {
	cam := &mathx.Vec3{}
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
	s.Add(6, 1)
	s.Add(7, 1)
	s.Add(8, 1)
	if s.Count != 4 || len(s.Entries) < 4 || s.Entries[3].Index != 8 {
		t.Errorf("LightSorter must grow beyond capacity, count=%d len=%d", s.Count, len(s.Entries))
	}

	ld := NewLightingData()
	if len(ld.Data) != MaxSceneLights*LightFloats {
		t.Fatalf("LightingData size %d", len(ld.Data))
	}
	for i := 0; i < MaxSceneLights+1; i++ {
		ok := ld.AddPointLight(float32(i), 0, 0, 1, 1, 1, 1, 1)
		if i < MaxSceneLights && !ok {
			t.Errorf("point light %d rejected", i)
		}
		if i == MaxSceneLights && ok {
			t.Error("point light overflow must be rejected")
		}
	}
	if ld.Data[LightFloats*7] != 7 {
		t.Error("point light 7 position not at its record")
	}
	ld.Reset()
	ld.AddSpotLight(0, 0, 0, 1, 1, 1, 1, 1, 0, -1, 0, 0.5)
	if ld.AddPointLight(0, 0, 0, 1, 1, 1, 1, 1) {
		t.Error("points must precede spots")
	}
	dev, r := newTestRenderer(8, 8, false)
	dev.ResetFrame()
	ld.HeaderBuf = r.Lighting.HeaderBuf
	ld.LightsBuf = r.Lighting.LightsBuf
	ld.Upload(r, []float32{0.5, 0.5, 0.5, 1})
	if dev.BufferWrites != 2 || ld.Header[5] != 1 || ld.Header[4] != 0 || ld.Header[0] != 0.5 {
		t.Errorf("Upload must write header (ambient, counts) and lights: writes=%d header=%v", dev.BufferWrites, ld.Header)
	}
}

func TestRenderFrameDoesNotAllocate(t *testing.T) {
	if heapUsed() < 0 {
		t.Skip("process.memoryUsage unavailable")
	}
	// jsdom inflates the heap counter with unrelated churn (see the physics
	// guard); the budget is only meaningful in the headless harness.
	if document != nil {
		t.Skip("heap measurement is only stable without --dom")
	}
	dev, r := newTestRenderer(64, 32, true)
	s := newTestScene()
	b := r.Backend
	mat := NewMaterial(b, "heap")
	s.skyboxes.Add(newTestDrawable(b))
	md := newTestDrawable(b)
	md.material = mat
	s.meshes.Add(md)
	s.fps.Add(newTestDrawable(b))
	s.directional.Add(newTestDrawable(b))
	s.points.Add(newTestDrawable(b))
	s.spots.Add(newTestDrawable(b))
	s.transparent.Add(newTestDrawable(b))
	s.billboards.Add(newTestDrawable(b))
	opts := defaultRenderOptions(true)
	cam := newTestCamera()

	frame := func(n int) {
		for i := 0; i < n; i++ {
			dev.ResetFrame()
			r.Render(cam, s, opts, float32(i)*0.016)
		}
	}
	frame(200)

	const trials = 5
	const framesPerTrial = 500
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
	// The fake device records every draw/pass (slice appends) which is the
	// bulk of what remains; the renderer's own per-frame work is steady-state.
	const budget = 2 * 1024 * 1024
	if median > budget {
		t.Errorf("Render allocates: median heap delta %d bytes over %d frames (budget %d)", median, framesPerTrial, budget)
	}
}
