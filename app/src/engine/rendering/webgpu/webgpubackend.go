package webgpu

import (
	"strconv"

	"../" // rendering
	"js:./interop.d.ts"
)

// textureFormats maps canonical engine formats to WebGPU texture formats.
var textureFormats = map[string]string{
	"depth24": "depth24plus",
	"depth":   "depth24plus",
	"rgba16f": "rgba16float",
	"rgba8":   "rgba8unorm",
	"rgba":    "rgba8unorm",
	"rg8":     "rg8unorm",
	"r8":      "r8unorm",
}

// WebGPUTextureHandle wraps a GPUTexture and its default view and sampler.
type WebGPUTextureHandle struct {
	GPUTexture    any
	TextureView   any
	GPUSampler    any
	DepthOnlyView any
	Width         int
	Height        int
	Format        string
	WrapMode      string
	MinFilter     string
	MagFilter     string
	MipFilter     string
	Anisotropy    int
	ID            int
	SamplerID     int
	MipLevelCount int
}

// WebGPUBufferHandle wraps a GPUBuffer with metadata.
type WebGPUBufferHandle struct {
	GPUBuffer       any
	Usage           string
	Length          int
	BytesPerElement int
	ID              int
}

// WebGPUVertexStateHandle stores vertex buffer layouts and index buffer.
type WebGPUVertexStateHandle struct {
	Buffers     []any
	Layout      []any
	IndexBuffer any
}

// WebGPUShaderHandle stores a compiled GPUShaderModule.
type WebGPUShaderHandle struct {
	GPUShaderModule any
	UniformCache    map[string]any
	UsesGroup0      any
}

// WebGPUUBOHandle stores a uniform buffer handle and binding point.
type WebGPUUBOHandle struct {
	GPUBuffer    any
	Size         int
	BindingPoint int
	ID           int
}

// WebGPUFramebufferHandle represents offscreen or default render targets.
type WebGPUFramebufferHandle struct {
	ColorTextures []any
	DepthTexture  any
	Width         int
	Height        int
}

// uniformBufferPool recycles GPU uniform buffers of one aligned size per frame.
type uniformBufferPool struct {
	Index   int
	Buffers []any
}

// packStructBuffers mirrors _packStructBuffers in webgpubackend.js: one
// pre-allocated Float32Array per WGSL uniform struct, reused every draw.
var packStructBuffers = map[string][]float32{
	"pointLight":          make([]float32, 8),
	"directionalLight":    make([]float32, 8),
	"spotLight":           make([]float32, 12),
	"postProcessParams":   make([]float32, 8),
	"shadowParams":        make([]float32, 24),
	"skinnedShadowParams": make([]float32, 20),
	"blurParams":          make([]float32, 8),
	"easuParams":          make([]float32, 16),
	"rcasParams":          make([]float32, 8),
	"billboardParams":     make([]float32, 24),
	"objectData":          make([]float32, 20),
}

var defaultProbeColor = []float32{1, 1, 1}

// WebGPUBackend implements rendering.RenderBackend using the WebGPU browser API.
type WebGPUBackend struct {
	Canvas       any
	Adapter      any
	Device       any
	Context      any
	Format       string
	Capabilities *rendering.Capabilities

	CommandEncoder any
	CurrentPass    any
	CurrentTexture any
	Viewport       any

	DepthState struct {
		Test  bool
		Write bool
		Func  string
	}
	BlendState struct {
		Enabled   bool
		SrcFactor string
		DstFactor string
	}
	CullState struct {
		Enabled bool
		Face    string
	}
	ClearColor struct {
		R float32
		G float32
		B float32
		A float32
	}
	ColorMask struct {
		R bool
		G bool
		B bool
		A bool
	}
	DepthBias struct {
		Enabled             bool
		DepthBias           int
		DepthBiasSlopeScale float32
		DepthBiasClamp      float32
	}
	DepthRange struct {
		Min float32
		Max float32
	}

	CurrentShader      any
	CurrentVertexState any
	CurrentPassFormats any
	ActiveFramebuffer  any

	DefaultTextureView any
	DefaultSampler     any
	DummyUBO           any

	BoundTextures map[int]any
	BoundUBOs     map[int]any
	Uniforms      map[string]any

	PipelineCache        map[string]any
	MipmapPipelines      map[string]any
	PipelineLayoutCache  map[string]any
	BindGroupLayoutCache map[string]any

	// Per-draw caches (see webgpubackend.js "Optimization" blocks).
	PersistentBindGroupCache map[string]any
	FrameBindGroupCache      map[string]any
	UniformBufferPools       map[int]*uniformBufferPool
	PassPipeline             any
	PassBindGroups           [3]any
	PassVertexBuffers        []any
	PassIndexBuffer          any
	tempEntries              []any
	tempDynOffsets           []any
	swapchainView            any

	RenderScale float32
	DoFSR       bool

	ResourceIdCounter       int
	DynamicObjectOffset     int
	DynamicObjectBuffer     any
	DynamicObjectBufferSize int
}

// NewWebGPUBackend creates a new WebGPU backend instance.
func NewWebGPUBackend() *WebGPUBackend {
	b := &WebGPUBackend{
		Capabilities:            &rendering.Capabilities{},
		Format:                  "bgra8unorm",
		BoundTextures:           make(map[int]any),
		BoundUBOs:               make(map[int]any),
		Uniforms:                make(map[string]any),
		PipelineCache:           make(map[string]any),
		MipmapPipelines:         make(map[string]any),
		PipelineLayoutCache:     make(map[string]any),
		BindGroupLayoutCache:    make(map[string]any),
		PersistentBindGroupCache: make(map[string]any),
		FrameBindGroupCache:     make(map[string]any),
		UniformBufferPools:      make(map[int]*uniformBufferPool),
		PassVertexBuffers:       make([]any, 8),
		tempEntries:             make([]any, 0, 16),
		tempDynOffsets:          make([]any, 1),
		RenderScale:             1.0,
		DoFSR:                   false,
		ResourceIdCounter:       1,
		DynamicObjectBufferSize: 32768 * 256,
	}
	b.DepthState.Test = true
	b.DepthState.Write = true
	b.DepthState.Func = "less-equal"
	b.BlendState.Enabled = false
	b.BlendState.SrcFactor = "one"
	b.BlendState.DstFactor = "zero"
	b.CullState.Enabled = true
	b.CullState.Face = "back"
	b.ClearColor.R = 0
	b.ClearColor.G = 0
	b.ClearColor.B = 0
	b.ClearColor.A = 1
	b.ColorMask.R = true
	b.ColorMask.G = true
	b.ColorMask.B = true
	b.ColorMask.A = true
	b.DepthRange.Min = 0.0
	b.DepthRange.Max = 1.0
	return b
}

func (b *WebGPUBackend) Name() string {
	return "webgpu"
}

func (b *WebGPUBackend) IsWebGPU() bool {
	return true
}

func (b *WebGPUBackend) SupportsFormat(format string) bool {
	_, ok := textureFormats[format]
	return ok
}

// Init sets up the canvas and asynchronously requests adapter + device.
// onReady(true) fires once device resources exist; onReady(false) if
// WebGPU is unavailable or adapter/device acquisition fails.
func (b *WebGPUBackend) Init(onReady func(ok bool)) {
	fail := func() {
		if b.Canvas != nil && b.Canvas.parentNode != nil {
			b.Canvas.parentNode.removeChild(b.Canvas)
			b.Canvas = nil
		}
		if onReady != nil {
			onReady(false)
		}
	}

	if navigator == nil || navigator.gpu == nil {
		if console != nil && console.warn != nil {
			console.warn("[WebGPU] navigator.gpu not supported in this environment")
		}
		fail()
		return
	}

	if document == nil || document.createElement == nil {
		fail()
		return
	}

	canvas := document.createElement("canvas")
	canvas.id = "context"
	canvas.style.cssText = "background:#000;position:fixed;top:0;left:0;width:100dvw;height:100dvh;display:block;z-index:0;"
	if document.body != nil {
		document.body.appendChild(canvas)
	}
	b.Canvas = canvas

	b.Capabilities.MaxTextureSize = 8192
	b.Capabilities.MaxAnisotropy = 16
	b.Capabilities.AnisotropicSupport = true

	// Async request adapter and device
	if navigator.gpu.requestAdapter == nil {
		fail()
		return
	}
	p := navigator.gpu.requestAdapter(map[string]any{"powerPreference": "high-performance"})
	if p == nil || p.then == nil {
		fail()
		return
	}
	p.then(func(adapter any) {
		if adapter == nil || adapter.requestDevice == nil {
			fail()
			return
		}
		b.Adapter = adapter
		adapter.requestDevice().then(func(device any) {
			if device == nil {
				fail()
				return
			}
			b.Device = device
			b.initDeviceResources()
			if onReady != nil {
				onReady(true)
			}
		}, func(err any) {
			if console != nil && console.warn != nil {
				console.warn("[WebGPU] requestDevice failed", err)
			}
			fail()
		})
	}, func(err any) {
		if console != nil && console.warn != nil {
			console.warn("[WebGPU] requestAdapter failed", err)
		}
		fail()
	})
}

func (b *WebGPUBackend) initDeviceResources() {
	if b.Device == nil {
		return
	}

	// Configure canvas context
	if b.Canvas != nil && b.Canvas.getContext != nil {
		b.Context = b.Canvas.getContext("webgpu")
		if b.Context != nil && b.Context.configure != nil {
			format := "bgra8unorm"
			if navigator != nil && navigator.gpu != nil && navigator.gpu.getPreferredCanvasFormat != nil {
				format = navigator.gpu.getPreferredCanvasFormat().(string)
			}
			b.Format = format
			b.Context.configure(map[string]any{
				"device":    b.Device,
				"format":    format,
				"alphaMode": "opaque",
				"usage":     GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
			})
		}
	}

	// Create default 1x1 white texture
	whiteData := []uint8{255, 255, 255, 255}
	if b.Device.createTexture != nil {
		tex := b.Device.createTexture(map[string]any{
			"size": map[string]any{
				"width":              1,
				"height":             1,
				"depthOrArrayLayers": 1,
			},
			"format": "rgba8unorm",
			"usage":  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		})
		if b.Device.queue != nil && b.Device.queue.writeTexture != nil {
			b.Device.queue.writeTexture(
				map[string]any{"texture": tex},
				whiteData,
				map[string]any{"bytesPerRow": 4, "rowsPerImage": 1},
				map[string]any{"width": 1, "height": 1},
			)
		}
		if tex != nil && tex.createView != nil {
			b.DefaultTextureView = tex.createView()
		}
	}

	// Create dynamic object buffer
	if b.Device.createBuffer != nil {
		b.DynamicObjectBuffer = b.Device.createBuffer(map[string]any{
			"size":  b.DynamicObjectBufferSize,
			"usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})

		// Create dummy UBO
		b.DummyUBO = b.Device.createBuffer(map[string]any{
			"size":  65536,
			"usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			"label": "DummyUBO",
		})
	}

	// Create default sampler
	if b.Device.createSampler != nil {
		b.DefaultSampler = b.Device.createSampler(map[string]any{
			"magFilter":    "linear",
			"minFilter":    "linear",
			"mipmapFilter": "linear",
			"addressModeU": "repeat",
			"addressModeV": "repeat",
		})
	}
}

func (b *WebGPUBackend) Dispose() {
	if b.Device != nil && b.Device.destroy != nil {
		b.Device.destroy()
		b.Device = nil
	}
	if b.DummyUBO != nil && b.DummyUBO.destroy != nil {
		b.DummyUBO.destroy()
		b.DummyUBO = nil
	}
	if b.DynamicObjectBuffer != nil && b.DynamicObjectBuffer.destroy != nil {
		b.DynamicObjectBuffer.destroy()
		b.DynamicObjectBuffer = nil
	}
	if b.Canvas != nil && b.Canvas.parentNode != nil {
		b.Canvas.parentNode.removeChild(b.Canvas)
	}
	b.Canvas = nil
	b.Context = nil
	b.Adapter = nil
}

func (b *WebGPUBackend) BeginFrame() {
	if b.Context != nil && b.Context.getCurrentTexture != nil {
		b.CurrentTexture = b.Context.getCurrentTexture()
	}
	if b.Device != nil && b.Device.createCommandEncoder != nil {
		b.CommandEncoder = b.Device.createCommandEncoder()
	}
	b.DynamicObjectOffset = 0
	for _, pool := range b.UniformBufferPools {
		pool.Index = 0
	}
	for k := range b.FrameBindGroupCache {
		delete(b.FrameBindGroupCache, k)
	}
	b.swapchainView = nil
}

func (b *WebGPUBackend) EndFrame() {
	if b.CurrentPass != nil && b.CurrentPass.end != nil {
		b.CurrentPass.end()
		b.CurrentPass = nil
	}
	if b.CommandEncoder != nil && b.Device != nil && b.Device.queue != nil {
		cmdBuf := b.CommandEncoder.finish()
		b.Device.queue.submit([]any{cmdBuf})
		b.CommandEncoder = nil
	}
	b.CurrentTexture = nil
}

func (b *WebGPUBackend) CreateTexture(desc *rendering.TextureDescriptor) any {
	if b.Device == nil || desc == nil {
		return nil
	}
	w := desc.Width
	if w <= 0 {
		w = 1
	}
	h := desc.Height
	if h <= 0 {
		h = 1
	}
	format := "rgba8unorm"
	if desc.Format != "" {
		mapped, ok := textureFormats[desc.Format]
		if !ok {
			if console != nil && console.warn != nil {
				console.warn("[WebGPU] unknown texture format: " + desc.Format)
			}
			return nil
		}
		format = mapped
	}
	isDepth := format == "depth24plus"
	levels := 1
	if desc.Mipmaps && !isDepth {
		levels = mipLevelCountFor(w, h)
	}

	usage := GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
	if isDepth {
		usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
	}

	gpuTex := b.Device.createTexture(map[string]any{
		"size": map[string]any{
			"width":              w,
			"height":             h,
			"depthOrArrayLayers": 1,
		},
		"mipLevelCount": levels,
		"format":        format,
		"usage":         usage,
	})

	var view any
	if gpuTex != nil && gpuTex.createView != nil {
		view = gpuTex.createView()
	}

	// Upload initial data if provided
	data := desc.Data
	if data == nil && desc.PData != nil {
		data = desc.PData
	}
	if data != nil && !isDepth && b.Device.queue != nil && b.Device.queue.writeTexture != nil {
		b.Device.queue.writeTexture(
			map[string]any{"texture": gpuTex},
			data,
			map[string]any{"bytesPerRow": w * 4, "rowsPerImage": h},
			map[string]any{"width": w, "height": h},
		)
	}

	var sampler any
	if b.Device.createSampler != nil {
		sampler = b.Device.createSampler(map[string]any{
			"magFilter":    "linear",
			"minFilter":    "linear",
			"mipmapFilter": "linear",
			"addressModeU": "repeat",
			"addressModeV": "repeat",
		})
	}

	b.ResourceIdCounter++
	texID := b.ResourceIdCounter
	b.ResourceIdCounter++
	samplerID := b.ResourceIdCounter

	return &WebGPUTextureHandle{
		GPUTexture:    gpuTex,
		TextureView:   view,
		GPUSampler:    sampler,
		Width:         w,
		Height:        h,
		Format:        format,
		MipLevelCount: levels,
		ID:            texID,
		SamplerID:     samplerID,
		WrapMode:      "repeat",
		MinFilter:     "linear",
		MagFilter:     "linear",
		MipFilter:     "linear",
		Anisotropy:    1,
	}
}

func (b *WebGPUBackend) DisposeTexture(texture any) {
	if texture == nil {
		return
	}
	tex := texture
	if h, ok := texture.(*WebGPUTextureHandle); ok {
		tex = h.GPUTexture
	} else if texture._gpuTexture != nil {
		tex = texture._gpuTexture
	}
	if tex != nil && tex.destroy != nil {
		tex.destroy()
	}
}

// mipLevelCountFor returns the full mip chain length for a w x h texture.
func mipLevelCountFor(w, h int) int {
	maxDim := w
	if h > maxDim {
		maxDim = h
	}
	levels := 1
	for maxDim > 1 {
		maxDim >>= 1
		levels++
	}
	return levels
}

// UploadTextureFromImage copies a decoded image into the texture, recreating
// the GPU texture (with a full mip chain) when the size differs from the
// placeholder allocated by CreateTexture.
func (b *WebGPUBackend) UploadTextureFromImage(texture any, image any) {
	if b.Device == nil || texture == nil || image == nil {
		return
	}
	h, ok := texture.(*WebGPUTextureHandle)
	if !ok {
		return
	}
	w := image.width.(int)
	ht := image.height.(int)
	if w <= 0 || ht <= 0 {
		return
	}
	levels := mipLevelCountFor(w, ht)

	if h.GPUTexture == nil || h.Width != w || h.Height != ht || h.MipLevelCount != levels {
		if h.GPUTexture != nil && h.GPUTexture.destroy != nil {
			h.GPUTexture.destroy()
		}
		format := h.Format
		if format == "" {
			format = "rgba8unorm"
		}
		h.GPUTexture = b.Device.createTexture(map[string]any{
			"size":          map[string]any{"width": w, "height": ht, "depthOrArrayLayers": 1},
			"mipLevelCount": levels,
			"format":        format,
			"usage":         GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		})
		h.TextureView = h.GPUTexture.createView()
		h.Width = w
		h.Height = ht
		h.Format = format
		h.MipLevelCount = levels
		// New view: bump the ID so cached bind groups are not reused.
		b.ResourceIdCounter++
		h.ID = b.ResourceIdCounter
	}

	if b.Device.queue != nil && b.Device.queue.copyExternalImageToTexture != nil {
		b.Device.queue.copyExternalImageToTexture(
			map[string]any{"source": image},
			map[string]any{"texture": h.GPUTexture},
			map[string]any{"width": w, "height": ht},
		)
	}
}

const mipmapBlitWGSL = `
struct VSOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
	var pos = array<vec2<f32>, 4>(
		vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0)
	);
	var uv = array<vec2<f32>, 4>(
		vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0)
	);
	var out: VSOutput;
	out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
	out.uv = uv[vertexIndex];
	return out;
}

@group(0) @binding(0) var imgSampler: sampler;
@group(0) @binding(1) var img: texture_2d<f32>;

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
	return textureSample(img, imgSampler, in.uv);
}
`

// mipmapPipeline returns the cached blit pipeline used to downsample mip levels.
func (b *WebGPUBackend) mipmapPipeline(format string) any {
	if p, ok := b.MipmapPipelines[format]; ok {
		return p
	}
	module := b.Device.createShaderModule(map[string]any{"label": "mipmap-blit", "code": mipmapBlitWGSL})
	pipeline := b.Device.createRenderPipeline(map[string]any{
		"label":  "mipmap-pipeline-" + format,
		"layout": "auto",
		"vertex": map[string]any{"module": module, "entryPoint": "vs_main"},
		"fragment": map[string]any{
			"module":     module,
			"entryPoint": "fs_main",
			"targets":    []any{map[string]any{"format": format}},
		},
		"primitive": map[string]any{"topology": "triangle-strip"},
	})
	b.MipmapPipelines[format] = pipeline
	return pipeline
}

// GenerateMipmaps renders each mip level from the previous one. Uses the
// frame's command encoder when inside a frame (and no pass is open),
// otherwise submits immediately.
func (b *WebGPUBackend) GenerateMipmaps(texture any) {
	h, ok := texture.(*WebGPUTextureHandle)
	if !ok || b.Device == nil || h.GPUTexture == nil || h.MipLevelCount <= 1 {
		return
	}
	format := h.Format
	if format == "" {
		format = "rgba8unorm"
	}
	pipeline := b.mipmapPipeline(format)

	encoder := b.CommandEncoder
	submitImmediate := false
	if encoder == nil || b.CurrentPass != nil {
		encoder = b.Device.createCommandEncoder()
		submitImmediate = true
	}

	srcView := h.GPUTexture.createView(map[string]any{"baseMipLevel": 0, "mipLevelCount": 1})
	for i := 1; i < h.MipLevelCount; i++ {
		dstView := h.GPUTexture.createView(map[string]any{"baseMipLevel": i, "mipLevelCount": 1})
		pass := encoder.beginRenderPass(map[string]any{
			"colorAttachments": []any{
				map[string]any{"view": dstView, "loadOp": "clear", "storeOp": "store"},
			},
		})
		pass.setPipeline(pipeline)
		pass.setBindGroup(0, b.Device.createBindGroup(map[string]any{
			"layout": pipeline.getBindGroupLayout(0),
			"entries": []any{
				map[string]any{"binding": 0, "resource": b.DefaultSampler},
				map[string]any{"binding": 1, "resource": srcView},
			},
		}))
		pass.draw(4)
		pass.end()
		srcView = dstView
	}

	if submitImmediate {
		b.Device.queue.submit([]any{encoder.finish()})
	}
}

func (b *WebGPUBackend) SetTextureWrapMode(texture any, mode string) {
	if texture == nil {
		return
	}
	addressMode := "repeat"
	if mode == "clamp-to-edge" {
		addressMode = "clamp-to-edge"
	} else if mode == "mirrored-repeat" {
		addressMode = "mirror-repeat"
	}

	h, ok := texture.(*WebGPUTextureHandle)
	if !ok {
		return
	}
	h.WrapMode = addressMode
	minF := h.MinFilter
	if minF == "" {
		minF = "linear"
	}
	magF := h.MagFilter
	if magF == "" {
		magF = "linear"
	}
	mipF := h.MipFilter
	if mipF == "" {
		mipF = "linear"
	}
	aniso := h.Anisotropy
	if aniso <= 0 {
		aniso = 1
	}

	b.ResourceIdCounter++
	h.SamplerID = b.ResourceIdCounter
	if b.Device != nil && b.Device.createSampler != nil {
		h.GPUSampler = b.Device.createSampler(map[string]any{
			"magFilter":     magF,
			"minFilter":     minF,
			"mipmapFilter":  mipF,
			"addressModeU":  addressMode,
			"addressModeV":  addressMode,
			"maxAnisotropy": aniso,
		})
	}
}

func (b *WebGPUBackend) SetTextureFilter(texture any, minFilter, magFilter, mipFilter string) {
	if texture == nil {
		return
	}
	min := "linear"
	if minFilter == "nearest" {
		min = "nearest"
	}
	mag := "linear"
	if magFilter == "nearest" {
		mag = "nearest"
	}
	mip := "linear"
	if mipFilter == "nearest" {
		mip = "nearest"
	}

	h, ok := texture.(*WebGPUTextureHandle)
	if !ok {
		return
	}
	h.MinFilter = min
	h.MagFilter = mag
	h.MipFilter = mip
	wrap := h.WrapMode
	if wrap == "" {
		wrap = "repeat"
	}
	aniso := h.Anisotropy
	if aniso <= 0 {
		aniso = 1
	}

	b.ResourceIdCounter++
	h.SamplerID = b.ResourceIdCounter
	if b.Device != nil && b.Device.createSampler != nil {
		h.GPUSampler = b.Device.createSampler(map[string]any{
			"magFilter":     mag,
			"minFilter":     min,
			"mipmapFilter":  mip,
			"addressModeU":  wrap,
			"addressModeV":  wrap,
			"maxAnisotropy": aniso,
		})
	}
}

func (b *WebGPUBackend) SetTextureAnisotropy(texture any, level int) {
	if texture == nil {
		return
	}
	maxAniso := 16
	if b.Capabilities != nil && b.Capabilities.MaxAnisotropy > 0 {
		maxAniso = b.Capabilities.MaxAnisotropy
	}
	aniso := level
	if aniso < 1 {
		aniso = 1
	}
	if aniso > maxAniso {
		aniso = maxAniso
	}

	h, ok := texture.(*WebGPUTextureHandle)
	if !ok {
		return
	}
	h.Anisotropy = aniso
	minF := h.MinFilter
	if minF == "" {
		minF = "linear"
	}
	magF := h.MagFilter
	if magF == "" {
		magF = "linear"
	}
	mipF := h.MipFilter
	if mipF == "" {
		mipF = "linear"
	}
	wrap := h.WrapMode
	if wrap == "" {
		wrap = "repeat"
	}

	b.ResourceIdCounter++
	h.SamplerID = b.ResourceIdCounter
	if b.Device != nil && b.Device.createSampler != nil {
		h.GPUSampler = b.Device.createSampler(map[string]any{
			"magFilter":     magF,
			"minFilter":     minF,
			"mipmapFilter":  mipF,
			"addressModeU":  wrap,
			"addressModeV":  wrap,
			"maxAnisotropy": aniso,
		})
	}
}

func (b *WebGPUBackend) BindTexture(texture any, unit int) {
	b.BoundTextures[unit] = texture
}

func (b *WebGPUBackend) UnbindTexture(unit int) {
	delete(b.BoundTextures, unit)
}

func (b *WebGPUBackend) CreateBuffer(data any, usage string) any {
	if b.Device == nil {
		return nil
	}
	gpuUsage := GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	if usage == "index" {
		gpuUsage = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
	} else if usage == "uniform" {
		gpuUsage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	}

	size := 4
	if data != nil && data.byteLength != nil {
		size = data.byteLength
	}

	alignedSize := (size + 3) &^ 3

	buf := b.Device.createBuffer(map[string]any{
		"size":  alignedSize,
		"usage": gpuUsage,
	})

	if data != nil && b.Device.queue != nil && b.Device.queue.writeBuffer != nil {
		b.Device.queue.writeBuffer(buf, 0, data)
	}

	b.ResourceIdCounter++
	return &WebGPUBufferHandle{
		GPUBuffer:       buf,
		Usage:           usage,
		Length:          alignedSize,
		BytesPerElement: 4,
		ID:              b.ResourceIdCounter,
	}
}

func (b *WebGPUBackend) UpdateBuffer(buffer any, data any, offset int) {
	if b.Device == nil || buffer == nil || data == nil {
		return
	}
	buf := buffer
	if h, ok := buffer.(*WebGPUBufferHandle); ok {
		buf = h.GPUBuffer
	} else if buffer._gpuBuffer != nil {
		buf = buffer._gpuBuffer
	}
	if b.Device.queue != nil && b.Device.queue.writeBuffer != nil {
		b.Device.queue.writeBuffer(buf, offset, data)
	}
}

func (b *WebGPUBackend) DeleteBuffer(buffer any) {
	if buffer == nil {
		return
	}
	buf := buffer
	if h, ok := buffer.(*WebGPUBufferHandle); ok {
		buf = h.GPUBuffer
	} else if buffer._gpuBuffer != nil {
		buf = buffer._gpuBuffer
	}
	if buf != nil && buf.destroy != nil {
		buf.destroy()
	}
}

// wgslLabelFor finds the catalog name whose WGSL source matches code; the label
// keys pipeline layouts and binding lookups in drawIndexedInternal.
func wgslLabelFor(code string) string {
	for name, def := range WgslShaderSources {
		if def.Code == code {
			return name
		}
	}
	return "unknown"
}

func (b *WebGPUBackend) CreateShaderProgram(vertexOrWgsl string, fragment string) any {
	if b.Device == nil {
		return nil
	}
	shaderModule := b.Device.createShaderModule(map[string]any{
		"label": wgslLabelFor(vertexOrWgsl),
		"code":  vertexOrWgsl,
	})
	return &WebGPUShaderHandle{
		GPUShaderModule: shaderModule,
		UniformCache:    make(map[string]any),
	}
}

func (b *WebGPUBackend) BindShader(shader any) {
	b.CurrentShader = shader
}

func (b *WebGPUBackend) UnbindShader() {
	b.CurrentShader = nil
}

func (b *WebGPUBackend) DisposeShader(shader any) {
	if shader == nil {
		return
	}
	sh, ok := shader.(*WebGPUShaderHandle)
	if ok {
		sh.GPUShaderModule = nil
		sh.UniformCache = make(map[string]any)
	}
}

func (b *WebGPUBackend) CreateUBO(size int, bindingPoint int) any {
	if b.Device == nil {
		return nil
	}
	alignedSize := (size + 15) &^ 15
	buf := b.Device.createBuffer(map[string]any{
		"size":  alignedSize,
		"usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	})
	b.ResourceIdCounter++
	return &WebGPUUBOHandle{
		GPUBuffer:    buf,
		Size:         alignedSize,
		BindingPoint: bindingPoint,
		ID:           b.ResourceIdCounter,
	}
}

func (b *WebGPUBackend) DeleteUBO(ubo any) {
	if ubo == nil {
		return
	}
	buf := ubo
	if h, ok := ubo.(*WebGPUUBOHandle); ok {
		buf = h.GPUBuffer
	} else if ubo._gpuBuffer != nil {
		buf = ubo._gpuBuffer
	}
	if buf != nil && buf.destroy != nil {
		buf.destroy()
	}
}

func (b *WebGPUBackend) UpdateUBO(ubo any, data any, offset int) {
	if b.Device == nil || ubo == nil || data == nil {
		return
	}
	buf := ubo
	if h, ok := ubo.(*WebGPUUBOHandle); ok {
		buf = h.GPUBuffer
	} else if ubo._gpuBuffer != nil {
		buf = ubo._gpuBuffer
	}
	if b.Device.queue != nil && b.Device.queue.writeBuffer != nil {
		b.Device.queue.writeBuffer(buf, offset, data)
	}
}

func (b *WebGPUBackend) BindUniformBuffer(ubo any) {
	if ubo == nil {
		return
	}
	bp := 0
	if h, ok := ubo.(*WebGPUUBOHandle); ok {
		bp = h.BindingPoint
	} else if ubo.bindingPoint != nil {
		bp = ubo.bindingPoint
	}
	b.BoundUBOs[bp] = ubo
}

func (b *WebGPUBackend) CreateFramebuffer(desc *rendering.FramebufferDescriptor) any {
	if desc == nil {
		return nil
	}
	colorTextures := make([]any, 0)
	for i := 0; i < len(desc.ColorAttachments); i++ {
		att := desc.ColorAttachments[i]
		var texHandle any
		if h, ok := att.(*WebGPUTextureHandle); ok {
			texHandle = h
		} else if td, ok := att.(*rendering.TextureDescriptor); ok {
			texHandle = b.CreateTexture(td)
		} else {
			texHandle = att
		}
		colorTextures = append(colorTextures, texHandle)
	}

	var depthTexture any
	if desc.DepthAttachment != nil {
		att := desc.DepthAttachment
		if h, ok := att.(*WebGPUTextureHandle); ok {
			depthTexture = h
		} else if td, ok := att.(*rendering.TextureDescriptor); ok {
			depthTexture = b.CreateTexture(td)
		} else {
			depthTexture = att
		}
	}

	width := 1024
	if desc.Width > 0 {
		width = desc.Width
	}
	height := 768
	if desc.Height > 0 {
		height = desc.Height
	}

	if len(desc.ColorAttachments) > 0 {
		if h, ok := desc.ColorAttachments[0].(*WebGPUTextureHandle); ok {
			if h.Width > 0 {
				width = h.Width
			}
			if h.Height > 0 {
				height = h.Height
			}
		}
	}

	return &WebGPUFramebufferHandle{
		ColorTextures: colorTextures,
		DepthTexture:  depthTexture,
		Width:         width,
		Height:        height,
	}
}

func (b *WebGPUBackend) DeleteFramebuffer(framebuffer any) {
}

func (b *WebGPUBackend) BindFramebuffer(framebuffer any) {
	if b.CurrentPass != nil && b.CurrentPass.end != nil {
		b.CurrentPass.end()
		b.CurrentPass = nil
	}
	b.ActiveFramebuffer = framebuffer
}

func (b *WebGPUBackend) SetFramebufferAttachment(framebuffer any, attachment int, texture any, level int, layer int) {
	if h, ok := framebuffer.(*WebGPUFramebufferHandle); ok {
		if attachment < len(h.ColorTextures) {
			h.ColorTextures[attachment] = texture
		}
	}
}

func (b *WebGPUBackend) CreateVertexState(desc *rendering.VertexStateDescriptor) any {
	if desc == nil {
		return nil
	}
	buffers := make([]any, 0)
	layout := make([]any, 0)

	for i := 0; i < len(desc.Attributes); i++ {
		attr := desc.Attributes[i]
		buffers = append(buffers, attr.Buffer)
		format := "float32x3"
		stride := attr.Size * 4
		if attr.Type == "ubyte" && attr.AsInteger {
			if attr.Size == 2 {
				format = "uint8x2"
			} else {
				format = "uint8x4"
			}
			stride = attr.Size
		} else if attr.Size == 2 {
			format = "float32x2"
		} else if attr.Size == 4 {
			format = "float32x4"
		}
		if attr.Stride > 0 {
			stride = attr.Stride
		}
		stepMode := "vertex"
		if attr.Divisor > 0 {
			stepMode = "instance"
		}

		layout = append(layout, map[string]any{
			"arrayStride": stride,
			"stepMode":    stepMode,
			"attributes": []any{
				map[string]any{
					"shaderLocation": attr.Slot,
					"offset":         attr.Offset,
					"format":         format,
				},
			},
		})
	}

	return &WebGPUVertexStateHandle{
		Buffers:     buffers,
		Layout:      layout,
		IndexBuffer: desc.IndexBuffer,
	}
}

func (b *WebGPUBackend) BindVertexState(state any) {
	b.CurrentVertexState = state
}

func (b *WebGPUBackend) DeleteVertexState(state any) {
}

func (b *WebGPUBackend) SetBlendState(enabled bool, srcFactor, dstFactor string) {
	b.BlendState.Enabled = enabled
	b.BlendState.SrcFactor = srcFactor
	b.BlendState.DstFactor = dstFactor
}

// depthCompareFuncs maps GL-style depth function names to GPUCompareFunction.
var depthCompareFuncs = map[string]string{
	"never":    "never",
	"less":     "less",
	"equal":    "equal",
	"lequal":   "less-equal",
	"greater":  "greater",
	"notequal": "not-equal",
	"gequal":   "greater-equal",
	"always":   "always",
}

func (b *WebGPUBackend) SetDepthState(testEnabled bool, writeEnabled bool, funcName string) {
	b.DepthState.Test = testEnabled
	b.DepthState.Write = writeEnabled
	if mapped, ok := depthCompareFuncs[funcName]; ok {
		funcName = mapped
	}
	b.DepthState.Func = funcName
}

func (b *WebGPUBackend) SetCullState(enabled bool, face string) {
	b.CullState.Enabled = enabled
	b.CullState.Face = face
}

func (b *WebGPUBackend) SetPolygonOffset(enabled bool, factor, units float32) {
	b.DepthBias.Enabled = enabled
	if enabled {
		b.DepthBias.DepthBias = int(units)
		b.DepthBias.DepthBiasSlopeScale = factor
	} else {
		b.DepthBias.DepthBias = 0
		b.DepthBias.DepthBiasSlopeScale = 0
	}
	b.DepthBias.DepthBiasClamp = 0
}

func (b *WebGPUBackend) SetViewport(x, y, width, height int) {
	b.Viewport = map[string]int{
		"x": x,
		"y": y,
		"w": width,
		"h": height,
	}
	if b.CurrentPass != nil && b.CurrentPass.setViewport != nil {
		min := b.DepthRange.Min
		max := b.DepthRange.Max
		if max <= 0 && min <= 0 {
			max = 1.0
		}
		b.CurrentPass.setViewport(float32(x), float32(y), float32(width), float32(height), min, max)
	}
}

func (b *WebGPUBackend) SetDepthRange(near, far float32) {
	b.DepthRange.Min = near
	b.DepthRange.Max = far
	if b.CurrentPass != nil && b.CurrentPass.setViewport != nil && b.Viewport != nil {
		vp, ok := b.Viewport.(map[string]int)
		if ok {
			b.CurrentPass.setViewport(float32(vp["x"]), float32(vp["y"]), float32(vp["w"]), float32(vp["h"]), near, far)
		}
	}
}

func (b *WebGPUBackend) beginPass(colorLoadOp, depthLoadOp string) {
	if b.CurrentPass != nil && b.CurrentPass.end != nil {
		b.CurrentPass.end()
		b.CurrentPass = nil
	}
	if b.Device == nil || b.CommandEncoder == nil {
		return
	}

	colorAttachments := make([]any, 0)
	var depthAttachment any
	var targetFormats []string
	var depthFormat string

	clearVal := map[string]float32{
		"r": b.ClearColor.R,
		"g": b.ClearColor.G,
		"b": b.ClearColor.B,
		"a": b.ClearColor.A,
	}

	if b.ActiveFramebuffer != nil {
		fb, ok := b.ActiveFramebuffer.(*WebGPUFramebufferHandle)
		if ok {
			for i := 0; i < len(fb.ColorTextures); i++ {
				tex := fb.ColorTextures[i]
				if tex == nil {
					continue
				}
				var view any
				fmt := "rgba8unorm"
				if h, ok := tex.(*WebGPUTextureHandle); ok {
					view = h.TextureView
					fmt = h.Format
				} else if tex.TextureView != nil {
					view = tex.TextureView
				}
				if view != nil {
					colorAttachments = append(colorAttachments, map[string]any{
						"view":       view,
						"clearValue": clearVal,
						"loadOp":     colorLoadOp,
						"storeOp":    "store",
					})
					targetFormats = append(targetFormats, fmt)
				}
			}
			if fb.DepthTexture != nil {
				var view any
				fmt := "depth24plus"
				if h, ok := fb.DepthTexture.(*WebGPUTextureHandle); ok {
					view = h.TextureView
					fmt = h.Format
				} else if fb.DepthTexture.TextureView != nil {
					view = fb.DepthTexture.TextureView
				}
				if view != nil {
					depthAttachment = map[string]any{
						"view":            view,
						"depthClearValue": 1.0,
						"depthLoadOp":     depthLoadOp,
						"depthStoreOp":    "store",
					}
					depthFormat = fmt
				}
			}
		}
	} else {
		// Render to swapchain
		if b.CurrentTexture == nil && b.Context != nil && b.Context.getCurrentTexture != nil {
			b.CurrentTexture = b.Context.getCurrentTexture()
		}
		if b.CurrentTexture != nil && b.CurrentTexture.createView != nil {
			if b.swapchainView == nil {
				b.swapchainView = b.CurrentTexture.createView()
			}
			colorAttachments = append(colorAttachments, map[string]any{
				"view":       b.swapchainView,
				"clearValue": clearVal,
				"loadOp":     colorLoadOp,
				"storeOp":    "store",
			})
			targetFormats = append(targetFormats, b.Format)
		}
	}

	b.CurrentPassFormats = map[string]any{
		"targets": targetFormats,
		"depth":   depthFormat,
	}

	descriptor := map[string]any{
		"colorAttachments": colorAttachments,
	}
	if depthAttachment != nil {
		descriptor["depthStencilAttachment"] = depthAttachment
	}

	b.CurrentPass = b.CommandEncoder.beginRenderPass(descriptor)
	b.resetPassCache()

	// Set viewport
	if b.CurrentPass != nil && b.CurrentPass.setViewport != nil {
		min := b.DepthRange.Min
		max := b.DepthRange.Max
		if max <= 0 && min <= 0 {
			max = 1.0
		}
		if b.Viewport != nil {
			vp, ok := b.Viewport.(map[string]int)
			if ok {
				b.CurrentPass.setViewport(float32(vp["x"]), float32(vp["y"]), float32(vp["w"]), float32(vp["h"]), min, max)
			}
		} else {
			w := b.GetWidth()
			h := b.GetHeight()
			if w <= 0 {
				w = 800
			}
			if h <= 0 {
				h = 600
			}
			b.CurrentPass.setViewport(0.0, 0.0, float32(w), float32(h), min, max)
		}
	}
}

func (b *WebGPUBackend) Clear(options *rendering.ClearOptions) {
	if b.CurrentPass != nil && b.CurrentPass.end != nil {
		b.CurrentPass.end()
		b.CurrentPass = nil
	}

	colorLoadOp := "load"
	depthLoadOp := "load"

	if options != nil {
		if options.ClearColor && len(options.Color) >= 4 {
			b.ClearColor.R = options.Color[0]
			b.ClearColor.G = options.Color[1]
			b.ClearColor.B = options.Color[2]
			b.ClearColor.A = options.Color[3]
			colorLoadOp = "clear"
		}
		if options.ClearDepth {
			depthLoadOp = "clear"
		}
	}

	b.beginPass(colorLoadOp, depthLoadOp)
}

func (b *WebGPUBackend) uniformSlice(key string) []float32 {
	val := b.Uniforms[key]
	if val == nil {
		return nil
	}
	if s, ok := val.([]float32); ok {
		return s
	}
	return nil
}

func (b *WebGPUBackend) uniformFloat(key string) (float32, bool) {
	val := b.Uniforms[key]
	if val == nil {
		return 0, false
	}
	if f, ok := val.(float32); ok {
		return f, true
	}
	if f, ok := val.(float64); ok {
		return float32(f), true
	}
	if i, ok := val.(int); ok {
		return float32(i), true
	}
	return 0, false
}

func fillSlice(dst []float32, start int, src []float32) {
	if src != nil {
		copy(dst[start:], src)
	}
}

// packStruct fills the pre-allocated buffer for a WGSL uniform struct from
// the scalar/vector uniforms set via SetUniform. Returns nil for unknown names.
func (b *WebGPUBackend) packStruct(name string) []float32 {
	buf := packStructBuffers[name]
	if buf == nil {
		return nil
	}
	for i := range buf {
		buf[i] = 0
	}

	switch name {
	case "pointLight":
		fillSlice(buf, 0, b.uniformSlice("pointLight.posRange"))
		fillSlice(buf, 4, b.uniformSlice("pointLight.colorIntensity"))
	case "directionalLight":
		fillSlice(buf, 0, b.uniformSlice("directionalLight.direction"))
		fillSlice(buf, 4, b.uniformSlice("directionalLight.color"))
	case "spotLight":
		fillSlice(buf, 0, b.uniformSlice("spotLight.posRange"))
		fillSlice(buf, 4, b.uniformSlice("spotLight.colorIntensity"))
		fillSlice(buf, 8, b.uniformSlice("spotLight.dirCutoff"))
	case "postProcessParams":
		if g, ok := b.uniformFloat("gamma"); ok {
			buf[0] = g
		}
		if em, ok := b.uniformFloat("emissiveMult"); ok {
			buf[1] = em
		}
		if di, ok := b.uniformFloat("dirtIntensity"); ok {
			buf[2] = di
		}
		if si, ok := b.uniformFloat("shadowIntensity"); ok {
			buf[3] = si
		}
		amb := b.uniformSlice("ambient")
		if amb == nil {
			amb = b.uniformSlice("uAmbient")
		}
		if amb == nil {
			amb = b.uniformSlice("params.ambient")
		}
		fillSlice(buf, 4, amb)
	case "shadowParams":
		fillSlice(buf, 0, b.uniformSlice("lightVP"))
		fillSlice(buf, 16, b.uniformSlice("ambient"))
		if bias, ok := b.uniformFloat("bias"); ok {
			buf[20] = bias
		}
	case "skinnedShadowParams":
		fillSlice(buf, 0, b.uniformSlice("matWorld"))
		probe := b.uniformSlice("uProbeColor")
		if probe == nil {
			probe = defaultProbeColor
		}
		fillSlice(buf, 16, probe)
	case "blurParams":
		if off, ok := b.uniformFloat("offset"); ok {
			buf[0] = off
		}
	case "easuParams":
		fillSlice(buf, 0, b.uniformSlice("con0"))
	case "rcasParams":
		if sh, ok := b.uniformFloat("sharpness"); ok {
			buf[0] = sh
		}
	case "billboardParams":
		fillSlice(buf, 0, b.uniformSlice("matWorld"))
		fillSlice(buf, 16, b.uniformSlice("uFrameOffset"))
		fillSlice(buf, 18, b.uniformSlice("uFrameScale"))
		if op, ok := b.uniformFloat("uOpacity"); ok {
			buf[20] = op
		}
	case "objectData":
		fillSlice(buf, 0, b.uniformSlice("matWorld"))
		probe := b.uniformSlice("uProbeColor")
		if probe == nil {
			probe = b.uniformSlice("ambient")
		}
		if probe == nil {
			probe = b.uniformSlice("debugColor")
		}
		if probe == nil {
			probe = defaultProbeColor
		}
		fillSlice(buf, 16, probe)
		if sh, ok := b.uniformFloat("shadowHeight"); ok {
			buf[19] = sh
		}
	}
	return buf
}

// getPooledUniformBuffer returns a per-frame recycled GPUBuffer of the given
// size (16-byte aligned), creating one only when the pool is exhausted.
func (b *WebGPUBackend) getPooledUniformBuffer(size int) any {
	aligned := (size + 15) &^ 15
	pool := b.UniformBufferPools[aligned]
	if pool == nil {
		pool = &uniformBufferPool{Buffers: make([]any, 0, 8)}
		b.UniformBufferPools[aligned] = pool
	}
	if pool.Index < len(pool.Buffers) {
		buf := pool.Buffers[pool.Index]
		pool.Index++
		return buf
	}
	if b.Device == nil || b.Device.createBuffer == nil {
		return nil
	}
	buf := b.Device.createBuffer(map[string]any{
		"size":  aligned,
		"usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	})
	b.ResourceIdCounter++
	buf._id = b.ResourceIdCounter
	pool.Buffers = append(pool.Buffers, buf)
	pool.Index++
	return buf
}

func (b *WebGPUBackend) resetPassCache() {
	b.PassPipeline = nil
	b.PassBindGroups[0] = nil
	b.PassBindGroups[1] = nil
	b.PassBindGroups[2] = nil
	for i := range b.PassVertexBuffers {
		b.PassVertexBuffers[i] = nil
	}
	b.PassIndexBuffer = nil
}

func (b *WebGPUBackend) colorWriteMask() int {
	mask := 0
	if b.ColorMask.R {
		mask |= GPUColorWrite.RED
	}
	if b.ColorMask.G {
		mask |= GPUColorWrite.GREEN
	}
	if b.ColorMask.B {
		mask |= GPUColorWrite.BLUE
	}
	if b.ColorMask.A {
		mask |= GPUColorWrite.ALPHA
	}
	return mask
}

func gpuBufferOf(v any) any {
	if v == nil {
		return nil
	}
	if h, ok := v.(*WebGPUBufferHandle); ok {
		return h.GPUBuffer
	}
	if h, ok := v.(*WebGPUUBOHandle); ok {
		return h.GPUBuffer
	}
	if v.GPUBuffer != nil {
		return v.GPUBuffer
	}
	return v
}

func resourceIdOf(v any) string {
	if v == nil {
		return "none"
	}
	if h, ok := v.(*WebGPUBufferHandle); ok {
		return strconv.Itoa(h.ID)
	}
	if h, ok := v.(*WebGPUUBOHandle); ok {
		return strconv.Itoa(h.ID)
	}
	if v._id != nil {
		return strconv.Itoa(v._id.(int))
	}
	return "x"
}

func (b *WebGPUBackend) getBindGroupLayout(shaderName string, groupIndex int) any {
	key := shaderName + "_" + strconv.Itoa(groupIndex)
	if l, ok := b.BindGroupLayoutCache[key]; ok {
		return l
	}

	shaderDef, exists := WgslShaderSources[shaderName]
	if !exists || shaderDef.Bindings == nil {
		return nil
	}
	groupKey := "group" + strconv.Itoa(groupIndex)
	bindingsList, hasGroup := shaderDef.Bindings[groupKey]
	if !hasGroup {
		return nil
	}

	entries := make([]any, 0)
	visibility := GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
	for _, bind := range bindingsList {
		entry := map[string]any{
			"binding":    bind.Binding,
			"visibility": visibility,
		}
		if bind.Type == "ubo" || bind.Type == "uniform" {
			entry["buffer"] = map[string]any{
				"type":             "uniform",
				"hasDynamicOffset": bind.Name == "objectData",
			}
		} else if bind.Type == "sampler" {
			entry["sampler"] = map[string]any{
				"type": "filtering",
			}
		} else if bind.Type == "texture" {
			entry["texture"] = map[string]any{
				"sampleType": "float",
			}
		} else if bind.Type == "depth-texture" {
			entry["texture"] = map[string]any{
				"sampleType": "depth",
			}
		}
		entries = append(entries, entry)
	}

	if b.Device == nil || b.Device.createBindGroupLayout == nil {
		return nil
	}
	layout := b.Device.createBindGroupLayout(map[string]any{
		"entries": entries,
	})
	b.BindGroupLayoutCache[key] = layout
	return layout
}

func (b *WebGPUBackend) getPipelineLayout(shaderName string) any {
	if l, ok := b.PipelineLayoutCache[shaderName]; ok {
		return l
	}
	bgls := make([]any, 0)
	for i := 0; i <= 2; i++ {
		bgl := b.getBindGroupLayout(shaderName, i)
		if bgl != nil {
			bgls = append(bgls, bgl)
		}
	}
	if len(bgls) == 0 {
		return "auto"
	}
	if b.Device == nil || b.Device.createPipelineLayout == nil {
		return nil
	}
	layout := b.Device.createPipelineLayout(map[string]any{
		"bindGroupLayouts": bgls,
	})
	b.PipelineLayoutCache[shaderName] = layout
	return layout
}

func (b *WebGPUBackend) DrawIndexed(indexBuffer any, indexCount int, indexOffset int, mode string) {
	b.drawIndexedInternal(indexBuffer, indexCount, indexOffset, mode, 1)
}

func (b *WebGPUBackend) DrawInstanced(indexBuffer any, indexCount int, instanceCount int) {
	if instanceCount <= 0 {
		return
	}
	b.drawIndexedInternal(indexBuffer, indexCount, 0, "triangles", instanceCount)
}

func (b *WebGPUBackend) drawIndexedInternal(indexBuffer any, indexCount int, indexOffset int, mode string, instanceCount int) {
	if b.Device == nil || b.CurrentVertexState == nil || b.CurrentShader == nil {
		return
	}

	if b.CurrentPass == nil {
		b.beginPass("load", "load")
	}
	pass := b.CurrentPass
	if pass == nil {
		return
	}

	topology := "triangle-list"
	if mode == "lines" {
		topology = "line-list"
	} else if mode == "points" {
		topology = "point-list"
	} else if mode == "triangle-strip" {
		topology = "triangle-strip"
	}

	cullMode := "none"
	if b.CullState.Enabled {
		cullMode = b.CullState.Face
		if cullMode == "" {
			cullMode = "back"
		}
	}

	var shaderModule any
	shaderLabel := "shader"
	if sh, ok := b.CurrentShader.(*WebGPUShaderHandle); ok {
		shaderModule = sh.GPUShaderModule
		if shaderModule != nil && shaderModule.label != nil {
			shaderLabel = shaderModule.label.(string)
		}
	} else if b.CurrentShader.GPUShaderModule != nil {
		shaderModule = b.CurrentShader.GPUShaderModule
		if shaderModule.label != nil {
			shaderLabel = shaderModule.label.(string)
		}
	}

	blendKey := "off"
	if b.BlendState.Enabled {
		blendKey = b.BlendState.SrcFactor + "_" + b.BlendState.DstFactor
	}
	depthKey := "0"
	if b.DepthState.Test {
		depthKey = "1"
	}
	if b.DepthState.Write {
		depthKey += "_1_"
	} else {
		depthKey += "_0_"
	}
	depthKey += b.DepthState.Func

	var targetFormats []string
	depthFmt := ""
	passKey := ""
	if b.CurrentPassFormats != nil {
		if fmts, ok := b.CurrentPassFormats.(map[string]any); ok {
			if tgts, ok := fmts["targets"].([]string); ok {
				targetFormats = tgts
				for _, f := range tgts {
					passKey += f + ","
				}
			}
			if df, ok := fmts["depth"].(string); ok {
				depthFmt = df
				passKey += df
			}
		}
	}

	pipeKey := shaderLabel + "|" + topology + "|" + cullMode + "|" + blendKey + "|" + depthKey + "|" + strconv.Itoa(b.colorWriteMask()) + "|" + strconv.Itoa(b.DepthBias.DepthBias) + "|" + passKey

	pipeline := b.PipelineCache[pipeKey]
	if pipeline == nil {
		targets := make([]any, 0, len(targetFormats))
		writeMask := b.colorWriteMask()
		for _, fmt := range targetFormats {
			target := map[string]any{
				"format":    fmt,
				"writeMask": writeMask,
			}
			if b.BlendState.Enabled {
				target["blend"] = map[string]any{
					"color": map[string]any{
						"srcFactor": b.BlendState.SrcFactor,
						"dstFactor": b.BlendState.DstFactor,
						"operation": "add",
					},
					"alpha": map[string]any{
						"srcFactor": b.BlendState.SrcFactor,
						"dstFactor": b.BlendState.DstFactor,
						"operation": "add",
					},
				}
			}
			targets = append(targets, target)
		}
		if len(targets) == 0 {
			targets = append(targets, map[string]any{
				"format":    b.Format,
				"writeMask": writeMask,
			})
		}

		pipeLayout := b.getPipelineLayout(shaderLabel)
		if pipeLayout == nil {
			pipeLayout = "auto"
		}

		var vtxLayout []any
		if vs, ok := b.CurrentVertexState.(*WebGPUVertexStateHandle); ok {
			vtxLayout = vs.Layout
		} else if b.CurrentVertexState.Layout != nil {
			vtxLayout = b.CurrentVertexState.Layout
		}

		pipeDesc := map[string]any{
			"label":  "Pipeline_" + pipeKey,
			"layout": pipeLayout,
			"vertex": map[string]any{
				"module":     shaderModule,
				"entryPoint": "vs_main",
				"buffers":    vtxLayout,
			},
			"fragment": map[string]any{
				"module":     shaderModule,
				"entryPoint": "fs_main",
				"targets":    targets,
			},
			"primitive": map[string]any{
				"topology": topology,
				"cullMode": cullMode,
			},
		}

		if depthFmt != "" {
			cmp := "always"
			if b.DepthState.Test {
				cmp = b.DepthState.Func
			}
			pipeDesc["depthStencil"] = map[string]any{
				"format":              depthFmt,
				"depthWriteEnabled":   b.DepthState.Write,
				"depthCompare":        cmp,
				"depthBias":           b.DepthBias.DepthBias,
				"depthBiasSlopeScale": b.DepthBias.DepthBiasSlopeScale,
				"depthBiasClamp":      b.DepthBias.DepthBiasClamp,
			}
		}

		if b.Device != nil && b.Device.createRenderPipeline != nil {
			pipeline = b.Device.createRenderPipeline(pipeDesc)
			b.PipelineCache[pipeKey] = pipeline
		}
	}

	if pipeline == nil {
		return
	}
	if b.PassPipeline != pipeline {
		if pass.setPipeline != nil {
			pass.setPipeline(pipeline)
		}
		b.PassPipeline = pipeline
		b.PassBindGroups[0] = nil
		b.PassBindGroups[1] = nil
		b.PassBindGroups[2] = nil
	}

	// Bind Vertex Buffers (skip redundant binds)
	if vs, ok := b.CurrentVertexState.(*WebGPUVertexStateHandle); ok {
		for i, buf := range vs.Buffers {
			gpuBuf := gpuBufferOf(buf)
			if gpuBuf == nil || pass.setVertexBuffer == nil {
				continue
			}
			if i < len(b.PassVertexBuffers) && b.PassVertexBuffers[i] == gpuBuf {
				continue
			}
			pass.setVertexBuffer(i, gpuBuf)
			if i < len(b.PassVertexBuffers) {
				b.PassVertexBuffers[i] = gpuBuf
			}
		}
	}

	// Bind Index Buffer
	if indexBuffer != nil {
		format := "uint32"
		if h, ok := indexBuffer.(*WebGPUBufferHandle); ok && h.BytesPerElement == 2 {
			format = "uint16"
		}
		buf := gpuBufferOf(indexBuffer)
		if buf != nil && pass.setIndexBuffer != nil && b.PassIndexBuffer != buf {
			pass.setIndexBuffer(buf, format)
			b.PassIndexBuffer = buf
		}
	}

	// Bind Groups
	shaderDef, hasDef := WgslShaderSources[shaderLabel]
	if hasDef && shaderDef.Bindings != nil {
		// Group 0: FrameData UBO (persistent per pipeline + UBO id)
		if ubo0, ok := b.BoundUBOs[0]; ok && ubo0 != nil {
			gpuBuf := gpuBufferOf(ubo0)
			if gpuBuf != nil && pipeline.getBindGroupLayout != nil {
				bg0Key := "bg0_" + pipeKey + "_" + resourceIdOf(ubo0)
				bg0 := b.PersistentBindGroupCache[bg0Key]
				if bg0 == nil {
					bg0 = b.Device.createBindGroup(map[string]any{
						"label":  "BG0_" + pipeKey,
						"layout": pipeline.getBindGroupLayout(0),
						"entries": []any{
							map[string]any{
								"binding":  0,
								"resource": map[string]any{"buffer": gpuBuf},
							},
						},
					})
					if bg0 != nil {
						b.PersistentBindGroupCache[bg0Key] = bg0
					}
				}
				if bg0 != nil && pass.setBindGroup != nil && b.PassBindGroups[0] != bg0 {
					pass.setBindGroup(0, bg0)
					b.PassBindGroups[0] = bg0
				}
			}
		}

		// Group 1
		if g1Bindings, hasG1 := shaderDef.Bindings["group1"]; hasG1 && pipeline.getBindGroupLayout != nil {
			b.tempEntries = b.tempEntries[:0]
			bgKey := ""
			dynOffset := -1
			hasTransient := false
			for _, bind := range g1Bindings {
				if bind.Type == "ubo" {
					gpuBuf := gpuBufferOf(b.BoundUBOs[bind.Id])
					if gpuBuf == nil {
						gpuBuf = b.DummyUBO
						bgKey += strconv.Itoa(bind.Binding) + ":u:dummy|"
					} else {
						bgKey += strconv.Itoa(bind.Binding) + ":u:" + resourceIdOf(b.BoundUBOs[bind.Id]) + "|"
					}
					if gpuBuf != nil {
						b.tempEntries = append(b.tempEntries, map[string]any{
							"binding":  bind.Binding,
							"resource": map[string]any{"buffer": gpuBuf},
						})
					}
				} else if bind.Type == "uniform" {
					packed := b.packStruct(bind.Name)
					if packed != nil && len(packed) > 0 {
						byteLen := len(packed) * 4
						if bind.Name == "objectData" && b.DynamicObjectBuffer != nil {
							if b.Device.queue != nil && b.Device.queue.writeBuffer != nil {
								b.Device.queue.writeBuffer(b.DynamicObjectBuffer, b.DynamicObjectOffset, packed)
							}
							b.tempEntries = append(b.tempEntries, map[string]any{
								"binding": bind.Binding,
								"resource": map[string]any{
									"buffer": b.DynamicObjectBuffer,
									"offset": 0,
									"size":   byteLen,
								},
							})
							bgKey += strconv.Itoa(bind.Binding) + ":dyn|"
							dynOffset = b.DynamicObjectOffset
							b.DynamicObjectOffset += (byteLen + 255) &^ 255
							if b.DynamicObjectOffset >= b.DynamicObjectBufferSize {
								b.DynamicObjectOffset = 0
							}
						} else {
							buf := b.getPooledUniformBuffer(byteLen)
							if buf != nil {
								if b.Device.queue != nil && b.Device.queue.writeBuffer != nil {
									b.Device.queue.writeBuffer(buf, 0, packed)
								}
								b.tempEntries = append(b.tempEntries, map[string]any{
									"binding":  bind.Binding,
									"resource": map[string]any{"buffer": buf},
								})
								bgKey += strconv.Itoa(bind.Binding) + ":p:" + resourceIdOf(buf) + "|"
								hasTransient = true
							}
						}
					} else if b.DummyUBO != nil {
						b.tempEntries = append(b.tempEntries, map[string]any{
							"binding":  bind.Binding,
							"resource": map[string]any{"buffer": b.DummyUBO},
						})
						bgKey += strconv.Itoa(bind.Binding) + ":u:dummy|"
					}
				} else if bind.Type == "sampler" {
					sampler, id := b.samplerFor(bind.Unit)
					if sampler != nil {
						b.tempEntries = append(b.tempEntries, map[string]any{
							"binding":  bind.Binding,
							"resource": sampler,
						})
						bgKey += strconv.Itoa(bind.Binding) + ":s:" + strconv.Itoa(id) + "|"
					}
				} else if bind.Type == "texture" || bind.Type == "depth-texture" {
					view, id := b.textureViewFor(bind.Unit, bind.Type == "depth-texture")
					if view != nil {
						b.tempEntries = append(b.tempEntries, map[string]any{
							"binding":  bind.Binding,
							"resource": view,
						})
						bgKey += strconv.Itoa(bind.Binding) + ":t:" + strconv.Itoa(id) + "|"
					}
				}
			}
			if len(b.tempEntries) > 0 {
				cacheKey := "bg1_" + pipeKey + "_" + bgKey
				var bg1 any
				if hasTransient {
					bg1 = b.FrameBindGroupCache[cacheKey]
				} else {
					bg1 = b.PersistentBindGroupCache[cacheKey]
				}
				if bg1 == nil {
					bg1 = b.Device.createBindGroup(map[string]any{
						"label":   "BG1_" + pipeKey,
						"layout":  pipeline.getBindGroupLayout(1),
						"entries": b.tempEntries,
					})
					if bg1 != nil {
						if hasTransient {
							b.FrameBindGroupCache[cacheKey] = bg1
						} else {
							b.PersistentBindGroupCache[cacheKey] = bg1
						}
					}
				}
				if bg1 != nil && pass.setBindGroup != nil && (b.PassBindGroups[1] != bg1 || dynOffset != -1) {
					if dynOffset != -1 {
						b.tempDynOffsets[0] = dynOffset
						pass.setBindGroup(1, bg1, b.tempDynOffsets)
					} else {
						pass.setBindGroup(1, bg1)
					}
					b.PassBindGroups[1] = bg1
				}
			}
		}

		// Group 2 (textures only, persistent)
		if g2Bindings, hasG2 := shaderDef.Bindings["group2"]; hasG2 && pipeline.getBindGroupLayout != nil {
			b.tempEntries = b.tempEntries[:0]
			bgKey := ""
			for _, bind := range g2Bindings {
				if bind.Type == "sampler" {
					sampler, id := b.samplerFor(bind.Unit)
					if sampler != nil {
						b.tempEntries = append(b.tempEntries, map[string]any{
							"binding":  bind.Binding,
							"resource": sampler,
						})
						bgKey += strconv.Itoa(bind.Binding) + ":s:" + strconv.Itoa(id) + "|"
					}
				} else if bind.Type == "texture" || bind.Type == "depth-texture" {
					view, id := b.textureViewFor(bind.Unit, bind.Type == "depth-texture")
					if view != nil {
						b.tempEntries = append(b.tempEntries, map[string]any{
							"binding":  bind.Binding,
							"resource": view,
						})
						bgKey += strconv.Itoa(bind.Binding) + ":t:" + strconv.Itoa(id) + "|"
					}
				}
			}
			if len(b.tempEntries) > 0 {
				cacheKey := "bg2_" + pipeKey + "_" + bgKey
				bg2 := b.PersistentBindGroupCache[cacheKey]
				if bg2 == nil {
					bg2 = b.Device.createBindGroup(map[string]any{
						"label":   "BG2_" + pipeKey,
						"layout":  pipeline.getBindGroupLayout(2),
						"entries": b.tempEntries,
					})
					if bg2 != nil {
						b.PersistentBindGroupCache[cacheKey] = bg2
					}
				}
				if bg2 != nil && pass.setBindGroup != nil && b.PassBindGroups[2] != bg2 {
					pass.setBindGroup(2, bg2)
					b.PassBindGroups[2] = bg2
				}
			}
		}
	}

	if pass.drawIndexed != nil {
		pass.drawIndexed(indexCount, instanceCount, indexOffset, 0, 0)
	}
}

// samplerFor returns the sampler bound at unit (or the default) and its id.
func (b *WebGPUBackend) samplerFor(unit int) (any, int) {
	if tex := b.BoundTextures[unit]; tex != nil {
		if h, ok := tex.(*WebGPUTextureHandle); ok && h.GPUSampler != nil {
			return h.GPUSampler, h.SamplerID
		}
	}
	return b.DefaultSampler, 0
}

// textureViewFor returns the texture view bound at unit (or the default) and its id.
func (b *WebGPUBackend) textureViewFor(unit int, depthOnly bool) (any, int) {
	if tex := b.BoundTextures[unit]; tex != nil {
		if h, ok := tex.(*WebGPUTextureHandle); ok {
			if depthOnly {
				if h.DepthOnlyView == nil && h.GPUTexture != nil && h.GPUTexture.createView != nil {
					h.DepthOnlyView = h.GPUTexture.createView(map[string]any{"aspect": "depth-only"})
				}
				if h.DepthOnlyView != nil {
					return h.DepthOnlyView, -h.ID
				}
			}
			if h.TextureView != nil {
				return h.TextureView, h.ID
			}
		}
	}
	return b.DefaultTextureView, 0
}

func (b *WebGPUBackend) SetUniform(name string, typeName string, value any) {
	b.Uniforms[name] = value
}

func (b *WebGPUBackend) SetColorMask(r, g, bl, a bool) {
	b.ColorMask.R = r
	b.ColorMask.G = g
	b.ColorMask.B = bl
	b.ColorMask.A = a
}

func (b *WebGPUBackend) GetCapabilities() *rendering.Capabilities {
	return b.Capabilities
}

func (b *WebGPUBackend) GetCanvas() any {
	return b.Canvas
}

func (b *WebGPUBackend) GetNativeWidth() int {
	if b.Canvas == nil {
		return 0
	}
	dpr := 1.0
	if window != nil && window.devicePixelRatio != nil {
		dpr = window.devicePixelRatio
	}
	return int(float64(b.Canvas.clientWidth) * dpr)
}

func (b *WebGPUBackend) GetNativeHeight() int {
	if b.Canvas == nil {
		return 0
	}
	dpr := 1.0
	if window != nil && window.devicePixelRatio != nil {
		dpr = window.devicePixelRatio
	}
	return int(float64(b.Canvas.clientHeight) * dpr)
}

func (b *WebGPUBackend) GetWidth() int {
	nativeW := b.GetNativeWidth()
	scale := b.RenderScale
	if scale <= 0 {
		scale = 1.0
	}
	return int(float32(nativeW) * scale)
}

func (b *WebGPUBackend) GetHeight() int {
	nativeH := b.GetNativeHeight()
	scale := b.RenderScale
	if scale <= 0 {
		scale = 1.0
	}
	return int(float32(nativeH) * scale)
}

func (b *WebGPUBackend) GetAspectRatio() float32 {
	h := b.GetHeight()
	if h <= 0 {
		return 1.0
	}
	return float32(b.GetWidth()) / float32(h)
}

func (b *WebGPUBackend) Resize() {
	if b.Canvas == nil {
		return
	}
	nativeW := b.GetNativeWidth()
	nativeH := b.GetNativeHeight()
	scaledW := b.GetWidth()
	scaledH := b.GetHeight()

	if b.DoFSR {
		b.Canvas.width = nativeW
		b.Canvas.height = nativeH
	} else {
		b.Canvas.width = scaledW
		b.Canvas.height = scaledH
	}

	if b.Context != nil && b.Device != nil && b.Context.configure != nil {
		b.Context.configure(map[string]any{
			"device":    b.Device,
			"format":    b.Format,
			"alphaMode": "opaque",
			"usage":     GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
		})
	}
}

func (b *WebGPUBackend) ClearBindGroupCaches() {
	b.BoundTextures = make(map[int]any)
	b.BoundUBOs = make(map[int]any)
}

func (b *WebGPUBackend) InitShaders(catalog *rendering.ShaderCatalog) {
	if catalog == nil {
		return
	}

	load := func(name string) *rendering.Shader {
		def := WgslShaderSources[name]
		if len(def.Code) == 0 {
			return nil
		}
		return rendering.NewShader(def.Code, "")
	}

	catalog.Geometry = load("geometry")
	catalog.SkinnedGeometry = load("skinnedGeometry")
	catalog.EntityShadows = load("entityShadows")
	catalog.SkinnedEntityShadows = load("skinnedEntityShadows")
	catalog.DirectionalLight = load("directionalLight")
	catalog.PointLight = load("pointLight")
	catalog.SpotLight = load("spotLight")
	catalog.KawaseBlur = load("kawaseBlur")
	catalog.PostProcessing = load("postProcessing")
	catalog.FsrEasu = load("fsrEasu")
	catalog.FsrRcas = load("fsrRcas")
	catalog.Transparent = load("transparent")
	catalog.Debug = load("debug")
	catalog.SkinnedDebug = load("skinnedDebug")
	catalog.Billboard = load("billboard")
	catalog.InstancedBillboard = load("instancedBillboard")
}
