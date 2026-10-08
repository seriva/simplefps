package rendering

import (
	"../mathx"
	"js:./interop.d.ts"
)

// CameraView provides viewing transforms and position for rendering.
type CameraView struct {
	Position              mathx.Vec3
	View                  mathx.Mat4
	Projection            mathx.Mat4
	ViewProjection        mathx.Mat4
	InverseViewProjection mathx.Mat4
}

// GBuffer holds the deferred geometry targets.
type GBuffer struct {
	WorldPosition *Texture
	Normal        *Texture
	Color         *Texture
	Emissive      *Texture
}

// FrameDataSize is the std140 size of the FrameData UBO in bytes (72 floats).
const FrameDataSize = 288

// frameData is the persistent staging buffer for the FrameData UBO.
var frameData = make([]float32, 72)

// RenderStats records per-frame geometry and lighting metrics.
type RenderStats struct {
	MeshCount     int
	LightCount    int
	TriangleCount int
	DrawCalls     int
}

// Reset zeroes the metrics; Renderer.Render calls it at the start of a frame.
func (s *RenderStats) Reset() {
	s.MeshCount = 0
	s.LightCount = 0
	s.TriangleCount = 0
	s.DrawCalls = 0
}

// DebugRenderOptions controls overlay visualizations.
type DebugRenderOptions struct {
	ShowBoundingVolumes bool
	ShowWireframes      bool
	ShowLightVolumes    bool
	ShowSkeleton        bool
}

// RenderOptions is the per-frame snapshot of the Settings the passes read.
// The engine fills it once per frame; it is the only path settings take into
// the renderer.
type RenderOptions struct {
	ProceduralDetail     bool
	LightBlurIterations  int
	EmissiveIterations   int
	EmissiveOffset       float32
	EmissiveMult         float32
	Gamma                float32
	DoDirt               bool
	DirtIntensity        float32
	ShadowIntensity      float32
	DoFSR                bool
	FsrSharpness         float32
	// Dirt is the lens-dirt overlay ("system/dirt.webp"); nil binds white.
	Dirt *Texture
}

// Renderer drives the deferred pipeline: it owns the pipelines, bind group
// layouts, render targets, the per-draw ObjectData ring and the pass
// descriptors. Entities draw through Pass/Object* helpers only.
type Renderer struct {
	Backend   *Backend
	Layouts   *Layouts
	Pipelines *Pipelines
	Shapes    *Shapes
	// Stats is reset at the start of every Render call. Pointer rather than
	// value: GoFront clones struct-typed fields on read.
	Stats  *RenderStats
	Debug  *DebugRenderOptions
	Width  int
	Height int
	DoFSR  bool
	// ProceduralDetail mirrors RenderOptions.ProceduralDetail for the current
	// frame so scene passes never read settings directly.
	ProceduralDetail bool

	// Depth is shared by the G-buffer, shadow and transparent passes.
	Depth    *Texture
	GBuffer  GBuffer
	Shadow   *Texture
	Light    *Texture
	Scratch  *Texture
	FsrEasu  *Texture
	FsrWidth int
	FsrHeight int

	ProceduralNoise *Texture
	// DefaultMaterial is bound for index groups without a material.
	DefaultMaterial *Material

	FrameDataUBO GPUBuffer
	frameBG      GPUBindGroup
	Objects      *ObjectRing
	Bones        *BoneRing
	Lighting     *LightingData

	objectBG        GPUBindGroup
	skinnedObjectBG GPUBindGroup
	lightingBG      GPUBindGroup
	emptyBG         GPUBindGroup

	// Pass is the open render pass encoder (nil between passes).
	Pass GPURenderPassEncoder
	// pipeline is the pass's requested pipeline; bound* track encoder state
	// so redundant set* calls are skipped.
	pipeline        *Pipeline
	boundPipeline   GPURenderPipeline
	boundMaterialBG GPUBindGroup
	boundIndex      GPUBuffer
	boundVertex     []GPUBuffer

	passes *passResources

	// Per-frame light ordering.
	pointSorter *LightSorter
	spotSorter  *LightSorter
	identity    mathx.Mat4
	// debugColor is the params0 colour wireframe/skeleton draws use.
	debugColor []float32
}

// NewRenderer creates an uninitialized Renderer tied to the specified backend.
// Call Init before rendering.
func NewRenderer(backend *Backend) *Renderer {
	return &Renderer{
		Backend:     backend,
		Shapes:      &Shapes{},
		Stats:       &RenderStats{},
		Debug:       &DebugRenderOptions{},
		Objects:     newObjectRing(),
		Bones:       newBoneRing(),
		Lighting:    NewLightingData(),
		pointSorter: NewLightSorter(64),
		spotSorter:  NewLightSorter(64),
		identity:    mathx.NewMat4(),
		debugColor:  debugWhite,
		boundVertex: make([]GPUBuffer, 8),
	}
}

// Ready reports whether Init completed against a live device.
func (r *Renderer) Ready() bool {
	return r.Pipelines != nil
}

// Init creates layouts, pipelines, persistent buffers, shapes and the
// render targets for the given viewport.
func (r *Renderer) Init(width, height int, doFSR bool) {
	if r.Backend == nil || !r.Backend.ready {
		return
	}
	b := r.Backend
	r.Width = width
	r.Height = height
	r.DoFSR = doFSR

	r.createLayouts()

	r.FrameDataUBO = b.CreateBuffer("frame-data", FrameDataSize, BufferUsageUniform, nil)
	r.frameBG = b.CreateBindGroup("frame", r.Layouts.Frame, []any{
		bindingEntry(0, bufferBinding(r.FrameDataUBO, FrameDataSize)),
	})

	r.Objects.Buffer = b.CreateBuffer("object-ring", ObjectRingSlots*ObjectStride, BufferUsageUniform, nil)
	r.Bones.Buffer = b.CreateBuffer("bone-ring", BoneRingFloats*4, BufferUsageStorage, nil)
	r.objectBG = b.CreateBindGroup("object", r.Layouts.Object, []any{
		bindingEntry(0, bufferBinding(r.Objects.Buffer, ObjectStride)),
	})
	r.skinnedObjectBG = b.CreateBindGroup("skinned-object", r.Layouts.SkinnedObject, []any{
		bindingEntry(0, bufferBinding(r.Objects.Buffer, ObjectStride)),
		bindingEntry(1, bufferBinding(r.Bones.Buffer, BoneRingFloats*4)),
	})

	r.Lighting.HeaderBuf = b.CreateBuffer("lighting-header", LightingDataFloats*4, BufferUsageUniform, nil)
	r.Lighting.LightsBuf = b.CreateBuffer("lights", MaxSceneLights*LightFloats*4, BufferUsageStorage, nil)
	r.lightingBG = b.CreateBindGroup("lighting", r.Layouts.Lighting, []any{
		bindingEntry(0, bufferBinding(r.Lighting.HeaderBuf, LightingDataFloats*4)),
		bindingEntry(1, bufferBinding(r.Lighting.LightsBuf, MaxSceneLights*LightFloats*4)),
	})
	r.emptyBG = b.CreateBindGroup("empty", r.Layouts.Empty, []any{})

	r.createPipelines()
	r.ProceduralNoise = NewProceduralNoiseTexture(b, DefaultAnisotropy)
	r.DefaultMaterial = NewMaterial(b, "default")
	r.Shapes.Init(b)
	r.AllocateBuffers(doFSR)
}

// AllocateBuffers (re)creates the render targets and pass descriptors at
// the current Width/Height; called from Init and Resize.
func (r *Renderer) AllocateBuffers(doFSR bool) {
	if !r.Ready() || r.Width <= 0 || r.Height <= 0 {
		return
	}
	r.DisposeBuffers()
	r.DoFSR = doFSR
	w := r.Width
	h := r.Height
	b := r.Backend

	r.Depth = NewRenderTarget(b, "depth", w, h, FormatDepth, false)
	r.GBuffer.WorldPosition = NewRenderTarget(b, "gbuffer-position", w, h, FormatRGBA16F, false)
	r.GBuffer.Normal = NewRenderTarget(b, "gbuffer-normal", w, h, FormatRGBA8, false)
	r.GBuffer.Color = NewRenderTarget(b, "gbuffer-color", w, h, FormatRGBA8, false)
	r.GBuffer.Emissive = NewRenderTarget(b, "gbuffer-emissive", w, h, FormatRGBA8, true)
	r.Shadow = NewRenderTarget(b, "shadow", w, h, FormatR8, false)
	r.Light = NewRenderTarget(b, "light", w, h, FormatRGBA8, true)
	r.Scratch = NewRenderTarget(b, "scratch", w, h, FormatRGBA8, true)

	r.FsrEasu = nil
	if doFSR {
		nw := b.GetNativeWidth()
		nh := b.GetNativeHeight()
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}
		r.FsrWidth = nw
		r.FsrHeight = nh
		r.FsrEasu = NewRenderTarget(b, "fsr-easu", nw, nh, FormatRGBA8, false)
	}
	r.buildPassResources()
}

// Resize handles window or render scale changes.
func (r *Renderer) Resize(width, height int, doFSR bool) {
	if r.Width == width && r.Height == height && r.DoFSR == doFSR {
		return
	}
	r.Width = width
	r.Height = height
	if r.Backend != nil {
		r.Backend.Resize()
	}
	r.AllocateBuffers(doFSR)
}

func disposeTex(t *Texture) *Texture {
	if t != nil {
		t.Dispose()
	}
	return nil
}

// DisposeBuffers frees the render targets.
func (r *Renderer) DisposeBuffers() {
	r.Depth = disposeTex(r.Depth)
	r.GBuffer.WorldPosition = disposeTex(r.GBuffer.WorldPosition)
	r.GBuffer.Normal = disposeTex(r.GBuffer.Normal)
	r.GBuffer.Color = disposeTex(r.GBuffer.Color)
	r.GBuffer.Emissive = disposeTex(r.GBuffer.Emissive)
	r.Shadow = disposeTex(r.Shadow)
	r.Light = disposeTex(r.Light)
	r.Scratch = disposeTex(r.Scratch)
	r.FsrEasu = disposeTex(r.FsrEasu)
	r.passes = nil
}

// Dispose shuts down the renderer and deletes all GPU allocations, including
// the shared shapes.
func (r *Renderer) Dispose() {
	r.DisposeBuffers()
	r.Shapes.Dispose()
	if r.Backend == nil {
		return
	}
	b := r.Backend
	r.ProceduralNoise = disposeTex(r.ProceduralNoise)
	if r.DefaultMaterial != nil {
		r.DefaultMaterial.Dispose()
	}
	b.DestroyBuffer(r.FrameDataUBO)
	r.FrameDataUBO = nil
	b.DestroyBuffer(r.Objects.Buffer)
	r.Objects.Buffer = nil
	b.DestroyBuffer(r.Bones.Buffer)
	r.Bones.Buffer = nil
	b.DestroyBuffer(r.Lighting.HeaderBuf)
	b.DestroyBuffer(r.Lighting.LightsBuf)
	r.Lighting.HeaderBuf = nil
	r.Lighting.LightsBuf = nil
	r.Pipelines = nil
}

// UpdateFrameDataUBO uploads view/projection matrices, camera position + time,
// and the viewport vec4 (width, height, proceduralDetail flag, 0).
func (r *Renderer) UpdateFrameDataUBO(camera *CameraView, time float32, proceduralDetail bool) {
	if r.FrameDataUBO == nil || camera == nil {
		return
	}
	PackFrameData(frameData, camera, time, float32(r.Width), float32(r.Height), proceduralDetail)
	r.Backend.WriteBuffer(r.FrameDataUBO, 0, frameData)
}

// PackFrameData writes the FrameData std140 layout into out (len >= 72).
// Index loops instead of copy(out[a:b], …): slicing allocates a view per call.
func PackFrameData(out []float32, camera *CameraView, time float32, width, height float32, proceduralDetail bool) {
	for i := 0; i < 16; i++ {
		out[i] = camera.ViewProjection[i]
		out[16+i] = camera.InverseViewProjection[i]
		out[32+i] = camera.View[i]
		out[48+i] = camera.Projection[i]
	}
	out[64] = camera.Position.X
	out[65] = camera.Position.Y
	out[66] = camera.Position.Z
	out[67] = time
	out[68] = width
	out[69] = height
	if proceduralDetail {
		out[70] = 1.0
	} else {
		out[70] = 0.0
	}
	out[71] = 0.0
}

// ---------------------------------------------------------------------------
// Encoder state helpers used by Mesh/SkinnedMesh and the passes.
// ---------------------------------------------------------------------------

// SetPipeline selects the pipeline subsequent draws use.
func (r *Renderer) SetPipeline(p *Pipeline) {
	r.pipeline = p
}

func (r *Renderer) usePipeline(p *Pipeline) {
	if p == nil || p.GPU == r.boundPipeline {
		return
	}
	r.Pass.setPipeline(p.GPU)
	r.boundPipeline = p.GPU
}

// BindMaterial sets group 1 to mat's bind group when it differs from the
// bound one.
func (r *Renderer) BindMaterial(mat *Material) {
	bg := mat.BindGroup(r)
	if bg == nil || bg == r.boundMaterialBG {
		return
	}
	r.Pass.setBindGroup(GroupMaterial, bg, noOffsets)
	r.boundMaterialBG = bg
}

// BindGroup1 sets an arbitrary group-1 bind group (pass inputs).
func (r *Renderer) BindGroup1(bg GPUBindGroup) {
	if bg == r.boundMaterialBG {
		return
	}
	r.Pass.setBindGroup(GroupMaterial, bg, noOffsets)
	r.boundMaterialBG = bg
}

// bindObject points group 2 at the current ObjectData slot.
func (r *Renderer) bindObject() {
	o := r.Objects
	o.offsets[0] = o.cur * ObjectStride
	r.Pass.setBindGroup(GroupObject, r.pipeline.ObjectBG, o.offsets)
}

func (r *Renderer) setVertexBuffer(slot int, buf GPUBuffer) {
	if buf == nil || r.boundVertex[slot] == buf {
		return
	}
	r.Pass.setVertexBuffer(slot, buf)
	r.boundVertex[slot] = buf
}

func (r *Renderer) setIndexBuffer(buf GPUBuffer) {
	if buf == r.boundIndex {
		return
	}
	r.Pass.setIndexBuffer(buf, "uint32")
	r.boundIndex = buf
}

// beginPass opens a render pass, binds the frame data and resets the
// redundancy trackers.
func (r *Renderer) beginPass(desc map[string]any) {
	r.Pass = r.Backend.Encoder.beginRenderPass(desc)
	r.Pass.setBindGroup(GroupFrame, r.frameBG, noOffsets)
	r.boundPipeline = nil
	r.boundMaterialBG = nil
	r.boundIndex = nil
	for i := 0; i < len(r.boundVertex); i++ {
		r.boundVertex[i] = nil
	}
}

func (r *Renderer) endPass() {
	if r.Pass != nil {
		r.Pass.end()
		r.Pass = nil
	}
}

// viewport sets the full w×h viewport with the given depth range.
func (r *Renderer) viewport(w, h int, minDepth, maxDepth float64) {
	r.Pass.setViewport(0, 0, float64(w), float64(h), minDepth, maxDepth)
}

// DrawFullscreen draws a 3-vertex fullscreen triangle with the pass
// pipeline and the current ObjectData slot.
func (r *Renderer) DrawFullscreen() {
	r.usePipeline(r.pipeline)
	r.bindObject()
	r.Pass.draw(3, 1, 0, 0)
	r.Stats.DrawCalls++
}

// CaptureSnapshot renders one frame and returns the canvas as a JPEG data URL
// ("" when unavailable).
func (r *Renderer) CaptureSnapshot(cam *CameraView, scene SceneSource, opts *RenderOptions) string {
	if r.Backend == nil {
		return ""
	}
	t := float32(0)
	if performance != nil && performance.now != nil {
		ts := performance.now()
		t = float32(ts.(float64) * 0.001)
	}
	r.Render(cam, scene, opts, t)
	canvas := r.Backend.GetCanvas()
	if canvas == nil || canvas.toDataURL == nil {
		return ""
	}
	result := ""
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				result = ""
			}
		}()
		result = canvas.toDataURL("image/jpeg", 0.8).(string)
	}()
	return result
}
