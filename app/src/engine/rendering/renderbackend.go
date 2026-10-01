package rendering

import (
	"js:./interop.d.ts"
)

// TextureDescriptor defines parameters for GPU texture allocation.
//
// Format uses the canonical names shared by both backends and the legacy JS
// renderer: "depth24", "rgba16f", "rgba8", "r8", "rg8", "rgba".
// Data is an opaque browser image source (HTMLImageElement, ImageBitmap, ...);
// PData is raw RGBA8 pixel data.
type TextureDescriptor struct {
	Width   int
	Height  int
	Format  string
	Mutable bool
	Mipmaps bool
	Data    any
	PData   []uint8
}

// FramebufferDescriptor defines render targets and attachment configurations.
type FramebufferDescriptor struct {
	ColorAttachments []any
	DepthAttachment  any
	Width            int
	Height           int
}

// VertexAttribute defines a single vertex buffer layout attribute.
type VertexAttribute struct {
	Buffer     any
	Slot       int
	Size       int
	Type       string // "float", "ubyte", etc.
	AsInteger  bool
	Stride     int
	Offset     int
	Normalized bool
	// Divisor > 0 marks a per-instance attribute (advances once per instance).
	Divisor int
}

// VertexStateDescriptor defines vertex attribute configurations and optional index buffer.
type VertexStateDescriptor struct {
	Attributes  []VertexAttribute
	IndexBuffer any
}

// ClearOptions specifies color and depth clear settings.
type ClearOptions struct {
	Color      []float32
	Depth      float32
	ClearColor bool
	ClearDepth bool
}

// Capabilities provides GPU limits and feature support flags.
type Capabilities struct {
	MaxTextureSize      int
	MaxColorAttachments int
	AnisotropicSupport  bool
	MaxAnisotropy       int
}

// RenderBackend is the abstract GPU rendering interface implemented by WebGL2 and WebGPU backends.
type RenderBackend interface {
	Name() string
	// Init acquires the GPU context. onReady is invoked exactly once with
	// ok=false when the backend is unavailable; WebGPU calls it asynchronously.
	Init(onReady func(ok bool))
	Dispose()

	BeginFrame()
	EndFrame()

	InitShaders(catalog *ShaderCatalog)

	// Resources
	SupportsFormat(format string) bool
	CreateTexture(desc *TextureDescriptor) any
	DisposeTexture(texture any)
	UploadTextureFromImage(texture any, image any)
	GenerateMipmaps(texture any)
	SetTextureWrapMode(texture any, mode string)
	SetTextureFilter(texture any, minFilter, magFilter, mipFilter string)
	SetTextureAnisotropy(texture any, level int)
	BindTexture(texture any, unit int)
	UnbindTexture(unit int)

	CreateBuffer(data any, usage string) any // usage: "vertex", "index", "uniform"
	UpdateBuffer(buffer any, data any, offset int)
	DeleteBuffer(buffer any)

	CreateShaderProgram(vertexOrWgsl string, fragment string) any
	BindShader(shader any)
	UnbindShader()
	DisposeShader(shader any)

	CreateUBO(size int, bindingPoint int) any
	DeleteUBO(ubo any)
	UpdateUBO(ubo any, data any, offset int)
	BindUniformBuffer(ubo any)

	CreateFramebuffer(desc *FramebufferDescriptor) any
	DeleteFramebuffer(framebuffer any)
	BindFramebuffer(framebuffer any)
	SetFramebufferAttachment(framebuffer any, attachment int, texture any, level int, layer int)

	CreateVertexState(desc *VertexStateDescriptor) any
	BindVertexState(state any)
	DeleteVertexState(state any)

	// State Management
	SetBlendState(enabled bool, srcFactor, dstFactor string)
	SetDepthState(testEnabled bool, writeEnabled bool, funcName string)
	SetCullState(enabled bool, face string)
	SetPolygonOffset(enabled bool, factor, units float32)
	SetColorMask(r, g, b, a bool)
	SetViewport(x, y, width, height int)
	SetDepthRange(near, far float32)
	Clear(options *ClearOptions)

	// Drawing
	DrawIndexed(indexBuffer any, indexCount int, indexOffset int, mode string)
	// DrawInstanced draws indexCount indices instanceCount times as triangles.
	DrawInstanced(indexBuffer any, indexCount int, instanceCount int)

	// Uniforms
	SetUniform(name string, typeName string, value any)

	// Queries & Canvas
	GetCapabilities() *Capabilities
	IsWebGPU() bool
	// GetCanvas returns the HTMLCanvasElement the backend renders into.
	GetCanvas() any
	GetWidth() int
	GetHeight() int
	GetNativeWidth() int
	GetNativeHeight() int
	GetAspectRatio() float32
	Resize()
	ClearBindGroupCaches()
}

