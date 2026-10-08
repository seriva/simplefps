package rendering

import (
	"js:./interop.d.ts"
)

// Capabilities reports adapter limits the renderer cares about.
type Capabilities struct {
	MaxTextureSize int
	MaxAnisotropy  int
}

// Backend owns the WebGPU device, the swapchain canvas and the shared
// default resources. Render passes and pipelines live in Renderer; Backend
// is the thin device layer every resource is created through.
type Backend struct {
	Canvas       any
	Adapter      any
	Device       GPUDevice
	Context      GPUCanvasContext
	Format       string
	Capabilities *Capabilities

	// Encoder is the frame's command encoder (nil outside BeginFrame/EndFrame).
	Encoder        GPUCommandEncoder
	CurrentTexture GPUTexture
	SwapchainView  GPUTextureView

	RenderScale float32
	DoFSR       bool

	// DefaultTextureView is a 1x1 white texture bound where a material has
	// no texture; DefaultSampler is linear/repeat, ClampSampler linear/clamp.
	DefaultTextureView GPUTextureView
	DefaultSampler     GPUSampler
	ClampSampler       GPUSampler

	mipmapModule    GPUShaderModule
	mipmapPipelines map[string]GPURenderPipeline
	// mipmapBG* are reused by GenerateMipmaps for the per-level bind group.
	mipmapEntries []any
	ready         bool
}

// NewBackend creates an uninitialized backend; call Init (browser) or
// InitWithDevice (tests) before creating resources.
func NewBackend() *Backend {
	return &Backend{
		Format:          "bgra8unorm",
		Capabilities:    &Capabilities{MaxTextureSize: 8192, MaxAnisotropy: 16},
		RenderScale:     1.0,
		mipmapPipelines: make(map[string]GPURenderPipeline),
		mipmapEntries:   []any{bindingEntry(0, nil), bindingEntry(1, nil)},
	}
}

// Name identifies the graphics API.
func (b *Backend) Name() string { return "webgpu" }

// Ready reports whether a device is attached.
func (b *Backend) Ready() bool { return b.ready }

// Init creates the canvas and asynchronously requests adapter + device.
// onReady(true) fires once device resources exist; onReady(false) when
// WebGPU is unavailable or acquisition fails.
func (b *Backend) Init(onReady func(ok bool)) {
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
			var ctx any
			if canvas.getContext != nil {
				ctx = canvas.getContext("webgpu")
			}
			if ctx == nil {
				fail()
				return
			}
			format := "bgra8unorm"
			if navigator.gpu.getPreferredCanvasFormat != nil {
				format = navigator.gpu.getPreferredCanvasFormat().(string)
			}
			b.Format = format
			b.InitWithDevice(device, ctx)
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

// InitWithDevice attaches an already-acquired device and canvas context
// (any WebGPU-shaped object; tests pass a fake) and creates the default
// resources.
func (b *Backend) InitWithDevice(device any, context any) {
	b.Device = device
	b.Context = context
	b.configureContext()

	whiteData := []uint8{255, 255, 255, 255}
	tex := b.Device.createTexture(map[string]any{
		"label":  "default-white",
		"size":   map[string]any{"width": 1, "height": 1, "depthOrArrayLayers": 1},
		"format": FormatRGBA8,
		"usage":  TextureUsageTextureBinding | TextureUsageCopyDst,
	})
	b.Device.queue.writeTexture(
		map[string]any{"texture": tex},
		whiteData,
		map[string]any{"bytesPerRow": 4, "rowsPerImage": 1},
		map[string]any{"width": 1, "height": 1},
	)
	var white GPUTexture = tex
	b.DefaultTextureView = white.createView(nil)

	b.DefaultSampler = b.CreateSampler("repeat", "linear", "linear", "linear", 1)
	b.ClampSampler = b.CreateSampler("clamp-to-edge", "linear", "linear", "linear", 1)
	b.mipmapModule = b.CreateShaderModule("mipmap-blit", mipmapBlitWGSL)
	b.ready = true
}

func (b *Backend) configureContext() {
	if b.Context == nil || b.Device == nil {
		return
	}
	b.Context.configure(map[string]any{
		"device":    b.Device,
		"format":    b.Format,
		"alphaMode": "opaque",
		"usage":     TextureUsageRenderAttachment | TextureUsageCopySrc,
	})
}

// Dispose destroys the device and removes the canvas.
func (b *Backend) Dispose() {
	if b.Device != nil && b.Device.destroy != nil {
		b.Device.destroy()
	}
	b.Device = nil
	if b.Canvas != nil && b.Canvas.parentNode != nil {
		b.Canvas.parentNode.removeChild(b.Canvas)
	}
	b.Canvas = nil
	b.Context = nil
	b.Adapter = nil
	b.ready = false
}

// BeginFrame acquires the swapchain texture and opens the command encoder.
func (b *Backend) BeginFrame() {
	if !b.ready {
		return
	}
	if b.Context != nil {
		b.CurrentTexture = b.Context.getCurrentTexture()
		b.SwapchainView = b.CurrentTexture.createView(nil)
	}
	b.Encoder = b.Device.createCommandEncoder()
}

// EndFrame submits the frame's command buffer.
func (b *Backend) EndFrame() {
	if b.Encoder == nil {
		return
	}
	cmd := b.Encoder.finish(nil)
	b.Device.queue.submit([]any{cmd})
	b.Encoder = nil
	b.CurrentTexture = nil
	b.SwapchainView = nil
}

// ---------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------

// CreateBuffer allocates byteLength bytes (4-byte aligned) with usage and
// optionally uploads data (a typed array) at offset 0.
func (b *Backend) CreateBuffer(label string, byteLength int, usage int, data any) GPUBuffer {
	if byteLength < 4 {
		byteLength = 4
	}
	var buf GPUBuffer = b.Device.createBuffer(map[string]any{
		"label": label,
		"size":  align4(byteLength),
		"usage": usage | BufferUsageCopyDst,
	})
	if data != nil {
		b.Device.queue.writeBuffer(buf, 0, data)
	}
	return buf
}

// CreateFloatBuffer uploads data into a new buffer with usage.
func (b *Backend) CreateFloatBuffer(label string, data []float32, usage int) GPUBuffer {
	return b.CreateBuffer(label, len(data)*4, usage, data)
}

// CreateIndexBuffer uploads 32-bit indices.
func (b *Backend) CreateIndexBuffer(label string, data []uint32) GPUBuffer {
	return b.CreateBuffer(label, len(data)*4, BufferUsageIndex, data)
}

// CreateByteBuffer uploads bytes into a new buffer with usage.
func (b *Backend) CreateByteBuffer(label string, data []uint8, usage int) GPUBuffer {
	return b.CreateBuffer(label, len(data), usage, data)
}

// WriteBuffer schedules a full upload of data at byte offset.
func (b *Backend) WriteBuffer(buf GPUBuffer, offset int, data any) {
	if buf == nil || data == nil {
		return
	}
	b.Device.queue.writeBuffer(buf, offset, data)
}

// WriteBufferRange uploads count elements of data starting at element 0.
func (b *Backend) WriteBufferRange(buf GPUBuffer, offset int, data any, count int) {
	b.WriteBufferSlice(buf, offset, data, 0, count)
}

// WriteBufferSlice uploads data[dataOffset:dataOffset+count] (elements) to
// byte offset. The predeclared GPUQueue.writeBuffer is declared with three
// parameters, so the five-argument form goes through an untyped reference.
func (b *Backend) WriteBufferSlice(buf GPUBuffer, offset int, data any, dataOffset, count int) {
	if buf == nil || data == nil || count <= 0 {
		return
	}
	var queue any = b.Device.queue
	queue.writeBuffer(buf, offset, data, dataOffset, count)
}

// DestroyBuffer releases buf (nil-safe).
func (b *Backend) DestroyBuffer(buf GPUBuffer) {
	if buf != nil {
		buf.destroy()
	}
}

// ---------------------------------------------------------------------------
// Shader modules, layouts, bind groups
// ---------------------------------------------------------------------------

// CreateShaderModule compiles WGSL.
func (b *Backend) CreateShaderModule(label, code string) GPUShaderModule {
	return b.Device.createShaderModule(map[string]any{"label": label, "code": code})
}

// CreateBindGroupLayout wraps device.createBindGroupLayout.
func (b *Backend) CreateBindGroupLayout(label string, entries []any) GPUBindGroupLayout {
	return b.Device.createBindGroupLayout(map[string]any{"label": label, "entries": entries})
}

// CreatePipelineLayout wraps device.createPipelineLayout.
func (b *Backend) CreatePipelineLayout(label string, layouts []any) GPUPipelineLayout {
	return b.Device.createPipelineLayout(map[string]any{"label": label, "bindGroupLayouts": layouts})
}

// CreateBindGroup wraps device.createBindGroup.
func (b *Backend) CreateBindGroup(label string, layout GPUBindGroupLayout, entries []any) GPUBindGroup {
	return b.Device.createBindGroup(map[string]any{"label": label, "layout": layout, "entries": entries})
}

// ---------------------------------------------------------------------------
// Textures and samplers
// ---------------------------------------------------------------------------

// CreateSampler creates a filtering sampler.
func (b *Backend) CreateSampler(wrap, minFilter, magFilter, mipFilter string, anisotropy int) GPUSampler {
	if anisotropy < 1 {
		anisotropy = 1
	}
	if anisotropy > b.Capabilities.MaxAnisotropy {
		anisotropy = b.Capabilities.MaxAnisotropy
	}
	return b.Device.createSampler(map[string]any{
		"magFilter":     magFilter,
		"minFilter":     minFilter,
		"mipmapFilter":  mipFilter,
		"addressModeU":  wrap,
		"addressModeV":  wrap,
		"maxAnisotropy": anisotropy,
	})
}

// CreateGPUTexture allocates a 2D texture.
func (b *Backend) CreateGPUTexture(label string, w, h, mipLevels int, format string, usage int) GPUTexture {
	return b.Device.createTexture(map[string]any{
		"label":         label,
		"size":          map[string]any{"width": w, "height": h, "depthOrArrayLayers": 1},
		"mipLevelCount": mipLevels,
		"format":        format,
		"usage":         usage,
	})
}

// WriteTexture uploads tightly packed RGBA8 pixels into mip 0.
func (b *Backend) WriteTexture(tex GPUTexture, w, h int, data []uint8) {
	if tex == nil || data == nil {
		return
	}
	b.Device.queue.writeTexture(
		map[string]any{"texture": tex},
		data,
		map[string]any{"bytesPerRow": w * 4, "rowsPerImage": h},
		map[string]any{"width": w, "height": h},
	)
}

// CopyImageToTexture copies a decoded image/bitmap into mip 0.
func (b *Backend) CopyImageToTexture(tex GPUTexture, image any, w, h int) {
	if tex == nil || image == nil {
		return
	}
	b.Device.queue.copyExternalImageToTexture(
		map[string]any{"source": image},
		map[string]any{"texture": tex},
		map[string]any{"width": w, "height": h},
	)
}

func (b *Backend) mipmapPipeline(format string) GPURenderPipeline {
	if p, ok := b.mipmapPipelines[format]; ok {
		return p
	}
	var pipeline GPURenderPipeline = b.Device.createRenderPipeline(map[string]any{
		"label":  "mipmap-" + format,
		"layout": "auto",
		"vertex": map[string]any{"module": b.mipmapModule, "entryPoint": "vs_main"},
		"fragment": map[string]any{
			"module":     b.mipmapModule,
			"entryPoint": "fs_main",
			"targets":    []any{map[string]any{"format": format}},
		},
		"primitive": map[string]any{"topology": "triangle-strip"},
	})
	b.mipmapPipelines[format] = pipeline
	return pipeline
}

// GenerateMipmaps renders each mip level from the previous one on its own
// command encoder (safe to call outside a frame).
func (b *Backend) GenerateMipmaps(tex GPUTexture, format string, mipLevels int) {
	if !b.ready || tex == nil || mipLevels <= 1 {
		return
	}
	pipeline := b.mipmapPipeline(format)
	var encoder GPUCommandEncoder = b.Device.createCommandEncoder()
	var pipe any = pipeline
	var layout GPUBindGroupLayout = pipe.getBindGroupLayout(0)

	srcView := tex.createView(map[string]any{"baseMipLevel": 0, "mipLevelCount": 1})
	for i := 1; i < mipLevels; i++ {
		dstView := tex.createView(map[string]any{"baseMipLevel": i, "mipLevelCount": 1})
		pass := encoder.beginRenderPass(map[string]any{
			"colorAttachments": []any{
				map[string]any{"view": dstView, "loadOp": "clear", "storeOp": "store"},
			},
		})
		pass.setPipeline(pipeline)
		b.mipmapEntries[0] = bindingEntry(0, b.DefaultSampler)
		b.mipmapEntries[1] = bindingEntry(1, srcView)
		pass.setBindGroup(0, b.CreateBindGroup("mipmap", layout, b.mipmapEntries), noOffsets)
		pass.draw(4, 1, 0, 0)
		pass.end()
		srcView = dstView
	}
	b.Device.queue.submit([]any{encoder.finish(nil)})
}

// noOffsets is the empty dynamic-offset list for static bind groups.
var noOffsets = []int{}

// ---------------------------------------------------------------------------
// Canvas / sizing
// ---------------------------------------------------------------------------

// GetCanvas returns the swapchain canvas element.
func (b *Backend) GetCanvas() any { return b.Canvas }

func devicePixelRatio() float64 {
	if window != nil && window.devicePixelRatio != nil {
		return window.devicePixelRatio
	}
	return 1.0
}

// GetNativeWidth is the canvas CSS width in device pixels.
func (b *Backend) GetNativeWidth() int {
	if b.Canvas == nil {
		return 0
	}
	return int(float64(b.Canvas.clientWidth) * devicePixelRatio())
}

// GetNativeHeight is the canvas CSS height in device pixels.
func (b *Backend) GetNativeHeight() int {
	if b.Canvas == nil {
		return 0
	}
	return int(float64(b.Canvas.clientHeight) * devicePixelRatio())
}

func (b *Backend) scale() float32 {
	if b.RenderScale <= 0 {
		return 1.0
	}
	return b.RenderScale
}

// GetWidth is the internal render width (native × RenderScale).
func (b *Backend) GetWidth() int {
	return int(float32(b.GetNativeWidth()) * b.scale())
}

// GetHeight is the internal render height (native × RenderScale).
func (b *Backend) GetHeight() int {
	return int(float32(b.GetNativeHeight()) * b.scale())
}

// GetAspectRatio is width/height of the render target.
func (b *Backend) GetAspectRatio() float32 {
	h := b.GetHeight()
	if h <= 0 {
		return 1.0
	}
	return float32(b.GetWidth()) / float32(h)
}

// SwapchainWidth is the backing size of the canvas (native when FSR
// upscales, otherwise the scaled render size).
func (b *Backend) SwapchainWidth() int {
	if b.DoFSR {
		return b.GetNativeWidth()
	}
	return b.GetWidth()
}

// SwapchainHeight mirrors SwapchainWidth.
func (b *Backend) SwapchainHeight() int {
	if b.DoFSR {
		return b.GetNativeHeight()
	}
	return b.GetHeight()
}

// Resize sizes the canvas backing store and reconfigures the swapchain.
func (b *Backend) Resize() {
	if b.Canvas == nil {
		return
	}
	b.Canvas.width = b.SwapchainWidth()
	b.Canvas.height = b.SwapchainHeight()
	b.configureContext()
}
