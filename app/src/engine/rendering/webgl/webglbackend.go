package webgl

import (
	"../" // rendering
)

// WebGLTextureHandle wraps a WebGLTexture and its dimensions.
type WebGLTextureHandle struct {
	GLTexture any
	Width     int
	Height    int
}

// WebGLBufferHandle wraps a WebGLBuffer and metadata.
type WebGLBufferHandle struct {
	GLBuffer        any
	Usage           string
	Length          int
	BytesPerElement int
}

// WebGLVertexStateHandle encapsulates a WebGL Vertex Array Object (VAO).
type WebGLVertexStateHandle struct {
	GLVAO            any
	HasIntegerAttrs  bool
	BoundIndexBuffer any
}

// WebGLProgramHandle stores a linked WebGLProgram and uniform location caches.
type WebGLProgramHandle struct {
	GLProgram         any
	UniformCache      map[string]any
	UniformValueCache map[string]any
}

// WebGLUBOHandle stores a WebGL uniform buffer.
type WebGLUBOHandle struct {
	GLBuffer     any
	Size         int
	BindingPoint int
}

// WebGLFramebufferHandle stores a WebGLFramebuffer and attached textures.
type WebGLFramebufferHandle struct {
	GLFramebuffer any
	ColorTextures []any
	DepthTexture  any
	Width         int
	Height        int
}

// WebGLBackend implements rendering.RenderBackend using the WebGL2 browser API.
type WebGLBackend struct {
	Canvas             any
	GL                 any
	AFExt              any
	Capabilities       *rendering.Capabilities
	CurrentShader      any
	CurrentVAO         any
	TextureUnit0       int
	WrapModes          map[string]int
	BlendFactors       map[string]int
	DepthFuncs         map[string]int
	TextureFormats     map[string]int
	FrameId            int
	BlendEnabled       any
	BlendSrc           string
	BlendDst           string
	DepthTest          any
	DepthWrite         any
	DepthFunc          string
	CullEnabled        any
	CullFace           string
	CurrentIndexBuffer any

	RenderScale float32
	DoFSR       bool
}

// NewWebGLBackend creates a new WebGL2 backend instance.
func NewWebGLBackend() *WebGLBackend {
	return &WebGLBackend{
		Capabilities:   &rendering.Capabilities{},
		WrapModes:      make(map[string]int),
		BlendFactors:   make(map[string]int),
		DepthFuncs:     make(map[string]int),
		TextureFormats: make(map[string]int),
		RenderScale:    1.0,
		DoFSR:          false,
	}
}

func (b *WebGLBackend) Name() string {
	return "webgl2"
}

func (b *WebGLBackend) SupportsFormat(format string) bool {
	_, ok := b.TextureFormats[format]
	return ok
}

// Init creates the canvas + WebGL2 context synchronously and reports the
// result through onReady so it matches the async WebGPU contract.
func (b *WebGLBackend) Init(onReady func(ok bool)) {
	ok := b.initSync()
	if !ok && b.Canvas != nil && b.Canvas.parentNode != nil {
		b.Canvas.parentNode.removeChild(b.Canvas)
		b.Canvas = nil
	}
	if onReady != nil {
		onReady(ok)
	}
}

func (b *WebGLBackend) initSync() bool {
	if document == nil || document.createElement == nil {
		return false
	}

	canvas := document.createElement("canvas")
	canvas.id = "context"
	canvas.style.cssText = "background:#000;position:fixed;top:0;left:0;width:100dvw;height:100dvh;display:block;z-index:0;"
	if document.body != nil {
		document.body.appendChild(canvas)
	}
	b.Canvas = canvas

	gl := canvas.getContext("webgl2", map[string]any{
		"premultipliedAlpha":  false,
		"antialias":           false,
		"preserveDrawingBuffer": false,
	})
	if gl == nil {
		if console != nil && console.error != nil {
			console.error("[Backend] Failed to initialize WebGL 2.0 context")
		}
		return false
	}
	b.GL = gl

	// Check required extension: EXT_color_buffer_float
	extColor := gl.getExtension("EXT_color_buffer_float")
	if extColor == nil {
		if console != nil && console.error != nil {
			console.error("[Backend] Required extension EXT_color_buffer_float not supported")
		}
		return false
	}

	// Check optional anisotropic extension
	b.AFExt = gl.getExtension("EXT_texture_filter_anisotropic")
	if b.AFExt == nil {
		b.AFExt = gl.getExtension("MOZ_EXT_texture_filter_anisotropic")
	}
	if b.AFExt == nil {
		b.AFExt = gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
	}

	// Cache GL constants
	b.TextureUnit0 = gl.TEXTURE0

	b.BlendFactors["zero"] = gl.ZERO
	b.BlendFactors["one"] = gl.ONE
	b.BlendFactors["src-alpha"] = gl.SRC_ALPHA
	b.BlendFactors["one-minus-src-alpha"] = gl.ONE_MINUS_SRC_ALPHA
	b.BlendFactors["dst-color"] = gl.DST_COLOR

	b.DepthFuncs["never"] = gl.NEVER
	b.DepthFuncs["less"] = gl.LESS
	b.DepthFuncs["equal"] = gl.EQUAL
	b.DepthFuncs["lequal"] = gl.LEQUAL
	b.DepthFuncs["greater"] = gl.GREATER
	b.DepthFuncs["notequal"] = gl.NOTEQUAL
	b.DepthFuncs["gequal"] = gl.GEQUAL
	b.DepthFuncs["always"] = gl.ALWAYS

	b.WrapModes["repeat"] = gl.REPEAT
	b.WrapModes["clamp-to-edge"] = gl.CLAMP_TO_EDGE
	b.WrapModes["mirrored-repeat"] = gl.MIRRORED_REPEAT

	b.TextureFormats["depth24"] = gl.DEPTH_COMPONENT24
	b.TextureFormats["rgba16f"] = gl.RGBA16F
	b.TextureFormats["rgba8"] = gl.RGBA8
	b.TextureFormats["rg8"] = gl.RG8
	b.TextureFormats["r8"] = gl.R8
	b.TextureFormats["rgba"] = gl.RGBA
	b.TextureFormats["depth"] = gl.DEPTH_COMPONENT
	b.TextureFormats["ubyte"] = gl.UNSIGNED_BYTE
	b.TextureFormats["float"] = gl.FLOAT

	// Default state
	gl.clearColor(0.0, 0.0, 0.0, 1.0)
	gl.clearDepth(1.0)
	gl.enable(gl.DEPTH_TEST)
	gl.depthFunc(gl.LEQUAL)
	gl.enable(gl.CULL_FACE)
	gl.cullFace(gl.BACK)

	// Capabilities
	b.Capabilities.MaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
	if b.AFExt != nil {
		b.Capabilities.AnisotropicSupport = true
		b.Capabilities.MaxAnisotropy = gl.getParameter(b.AFExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
	} else {
		b.Capabilities.AnisotropicSupport = false
		b.Capabilities.MaxAnisotropy = 1
	}

	return true
}

func (b *WebGLBackend) Dispose() {
	if b.Canvas != nil && b.Canvas.parentNode != nil {
		b.Canvas.parentNode.removeChild(b.Canvas)
	}
	b.GL = nil
	b.Canvas = nil
}

func (b *WebGLBackend) BeginFrame() {
	b.FrameId++
}

func (b *WebGLBackend) EndFrame() {
}

func (b *WebGLBackend) CreateTexture(desc *rendering.TextureDescriptor) any {
	gl := b.GL
	if gl == nil || desc == nil {
		return nil
	}
	tex := gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, tex)

	hasData := desc.Data != nil || desc.PData != nil
	minFilter := gl.NEAREST
	if hasData {
		minFilter = gl.LINEAR_MIPMAP_LINEAR
	}
	magFilter := gl.NEAREST
	if hasData {
		magFilter = gl.LINEAR
	}
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)

	width := desc.Width
	if width <= 0 {
		width = 1
	}
	height := desc.Height
	if height <= 0 {
		height = 1
	}

	formatVal := gl.RGBA
	if desc.Format != "" {
		f, ok := b.TextureFormats[desc.Format]
		if !ok {
			if console != nil && console.warn != nil {
				console.warn("[WebGL] unknown texture format: " + desc.Format)
			}
			gl.bindTexture(gl.TEXTURE_2D, nil)
			gl.deleteTexture(tex)
			return nil
		}
		formatVal = f
	}

	if desc.Format != "" && !desc.Mutable {
		levels := 1
		if desc.Mipmaps {
			maxDim := width
			if height > maxDim {
				maxDim = height
			}
			levels = 1
			for maxDim > 1 {
				maxDim >>= 1
				levels++
			}
		}
		gl.texStorage2D(gl.TEXTURE_2D, levels, formatVal, width, height)
	} else {
		dataToUpload := desc.Data
		if dataToUpload == nil && desc.PData != nil {
			dataToUpload = desc.PData
		}
		if dataToUpload != nil {
			gl.texImage2D(gl.TEXTURE_2D, 0, formatVal, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataToUpload)
		} else {
			defaultPixel := []uint8{0, 0, 0, 255}
			gl.texImage2D(gl.TEXTURE_2D, 0, formatVal, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, defaultPixel)
		}
	}

	gl.bindTexture(gl.TEXTURE_2D, nil)

	return &WebGLTextureHandle{
		GLTexture: tex,
		Width:     width,
		Height:    height,
	}
}

func (b *WebGLBackend) DisposeTexture(texture any) {
	if b.GL == nil || texture == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture._glTexture != nil {
		tex = texture._glTexture
	}
	if tex != nil {
		gl.deleteTexture(tex)
	}
}

func (b *WebGLBackend) UploadTextureFromImage(texture any, image any) {
	if b.GL == nil || texture == nil || image == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
		h.Width = image.width
		h.Height = image.height
	} else if texture._glTexture != nil {
		tex = texture._glTexture
		texture.width = image.width
		texture.height = image.height
	}

	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	gl.bindTexture(gl.TEXTURE_2D, nil)
}

func (b *WebGLBackend) GenerateMipmaps(texture any) {
	if b.GL == nil || texture == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture._glTexture != nil {
		tex = texture._glTexture
	}
	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.generateMipmap(gl.TEXTURE_2D)
	gl.bindTexture(gl.TEXTURE_2D, nil)
}

func (b *WebGLBackend) SetTextureWrapMode(texture any, mode string) {
	if b.GL == nil || texture == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture._glTexture != nil {
		tex = texture._glTexture
	}

	glMode := gl.REPEAT
	if m, ok := b.WrapModes[mode]; ok {
		glMode = m
	}
	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glMode)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glMode)
	gl.bindTexture(gl.TEXTURE_2D, nil)
}

func (b *WebGLBackend) SetTextureFilter(texture any, minFilter, magFilter, mipFilter string) {
	if b.GL == nil || texture == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture._glTexture != nil {
		tex = texture._glTexture
	}

	glMin := gl.LINEAR_MIPMAP_LINEAR
	if minFilter == "nearest" {
		if mipFilter == "nearest" {
			glMin = gl.NEAREST_MIPMAP_NEAREST
		} else if mipFilter == "linear" {
			glMin = gl.NEAREST_MIPMAP_LINEAR
		} else {
			glMin = gl.NEAREST
		}
	} else {
		if mipFilter == "nearest" {
			glMin = gl.LINEAR_MIPMAP_NEAREST
		} else if mipFilter == "linear" {
			glMin = gl.LINEAR_MIPMAP_LINEAR
		} else {
			glMin = gl.LINEAR
		}
	}

	glMag := gl.LINEAR
	if magFilter == "nearest" {
		glMag = gl.NEAREST
	}

	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glMin)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glMag)
	gl.bindTexture(gl.TEXTURE_2D, nil)
}

func (b *WebGLBackend) SetTextureAnisotropy(texture any, level int) {
	if b.GL == nil || b.AFExt == nil || texture == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture._glTexture != nil {
		tex = texture._glTexture
	}

	maxAniso := b.Capabilities.MaxAnisotropy
	if maxAniso < 1 {
		maxAniso = 1
	}
	af := level
	if af < 1 {
		af = 1
	} else if af > maxAniso {
		af = maxAniso
	}

	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.texParameterf(gl.TEXTURE_2D, b.AFExt.TEXTURE_MAX_ANISOTROPY_EXT, float32(af))
	gl.bindTexture(gl.TEXTURE_2D, nil)
}

func (b *WebGLBackend) BindTexture(texture any, unit int) {
	if b.GL == nil || texture == nil {
		return
	}
	gl := b.GL
	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture._glTexture != nil {
		tex = texture._glTexture
	}
	gl.activeTexture(b.TextureUnit0 + unit)
	gl.bindTexture(gl.TEXTURE_2D, tex)
}

func (b *WebGLBackend) UnbindTexture(unit int) {
	if b.GL == nil {
		return
	}
	gl := b.GL
	gl.activeTexture(b.TextureUnit0 + unit)
	gl.bindTexture(gl.TEXTURE_2D, nil)
}

func (b *WebGLBackend) CreateBuffer(data any, usage string) any {
	gl := b.GL
	if gl == nil || data == nil {
		return nil
	}
	buf := gl.createBuffer()
	target := gl.ARRAY_BUFFER
	if usage == "index" {
		target = gl.ELEMENT_ARRAY_BUFFER
	}

	gl.bindBuffer(target, buf)
	gl.bufferData(target, data, gl.STATIC_DRAW)
	gl.bindBuffer(target, nil)

	return &WebGLBufferHandle{
		GLBuffer:        buf,
		Usage:           usage,
		Length:          data.length,
		BytesPerElement: 4,
	}
}

func (b *WebGLBackend) UpdateBuffer(buffer any, data any, offset int) {
	if b.GL == nil || buffer == nil || data == nil {
		return
	}
	gl := b.GL
	buf := buffer
	target := gl.ARRAY_BUFFER
	if h, ok := buffer.(*WebGLBufferHandle); ok {
		buf = h.GLBuffer
		if h.Usage == "index" {
			target = gl.ELEMENT_ARRAY_BUFFER
		}
	} else if buffer.usage == "index" {
		target = gl.ELEMENT_ARRAY_BUFFER
		if buffer._glBuffer != nil {
			buf = buffer._glBuffer
		}
	}

	gl.bindBuffer(target, buf)
	gl.bufferSubData(target, offset, data)
	gl.bindBuffer(target, nil)
}

func (b *WebGLBackend) DeleteBuffer(buffer any) {
	if b.GL == nil || buffer == nil {
		return
	}
	gl := b.GL
	buf := buffer
	if h, ok := buffer.(*WebGLBufferHandle); ok {
		buf = h.GLBuffer
	} else if buffer._glBuffer != nil {
		buf = buffer._glBuffer
	}
	gl.deleteBuffer(buf)
}

func (b *WebGLBackend) CreateShaderProgram(vertexOrWgsl string, fragment string) any {
	gl := b.GL
	if gl == nil {
		return nil
	}

	vs := gl.createShader(gl.VERTEX_SHADER)
	gl.shaderSource(vs, vertexOrWgsl)
	gl.compileShader(vs)
	if !gl.getShaderParameter(vs, gl.COMPILE_STATUS) {
		err := gl.getShaderInfoLog(vs)
		if console != nil && console.error != nil {
			console.error("[Shader] Error compiling vertex shader:", err)
		}
		gl.deleteShader(vs)
		return nil
	}

	fs := gl.createShader(gl.FRAGMENT_SHADER)
	gl.shaderSource(fs, fragment)
	gl.compileShader(fs)
	if !gl.getShaderParameter(fs, gl.COMPILE_STATUS) {
		err := gl.getShaderInfoLog(fs)
		if console != nil && console.error != nil {
			console.error("[Shader] Error compiling fragment shader:", err)
		}
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		return nil
	}

	prog := gl.createProgram()
	gl.attachShader(prog, vs)
	gl.attachShader(prog, fs)
	gl.linkProgram(prog)
	if !gl.getProgramParameter(prog, gl.LINK_STATUS) {
		err := gl.getProgramInfoLog(prog)
		if console != nil && console.error != nil {
			console.error("[Shader] Error linking program:", err)
		}
		gl.deleteProgram(prog)
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		return nil
	}

	gl.detachShader(prog, vs)
	gl.detachShader(prog, fs)
	gl.deleteShader(vs)
	gl.deleteShader(fs)

	// Bind standard uniform blocks
	fBlock := gl.getUniformBlockIndex(prog, "FrameData")
	if fBlock != gl.INVALID_INDEX {
		gl.uniformBlockBinding(prog, fBlock, 0)
	}
	mBlock := gl.getUniformBlockIndex(prog, "MaterialData")
	if mBlock != gl.INVALID_INDEX {
		gl.uniformBlockBinding(prog, mBlock, 1)
	}
	lBlock := gl.getUniformBlockIndex(prog, "LightingData")
	if lBlock != gl.INVALID_INDEX {
		gl.uniformBlockBinding(prog, lBlock, 2)
	}

	return &WebGLProgramHandle{
		GLProgram:         prog,
		UniformCache:      make(map[string]any),
		UniformValueCache: make(map[string]any),
	}
}

func (b *WebGLBackend) BindShader(shader any) {
	if b.GL == nil || shader == nil {
		return
	}
	gl := b.GL
	prog := shader
	if h, ok := shader.(*WebGLProgramHandle); ok {
		prog = h.GLProgram
	} else if shader._glProgram != nil {
		prog = shader._glProgram
	}
	gl.useProgram(prog)
	b.CurrentShader = shader
}

func (b *WebGLBackend) UnbindShader() {
	if b.GL == nil {
		return
	}
	b.GL.useProgram(nil)
	b.CurrentShader = nil
}

func (b *WebGLBackend) DisposeShader(shader any) {
	if b.GL == nil || shader == nil {
		return
	}
	gl := b.GL
	prog := shader
	if h, ok := shader.(*WebGLProgramHandle); ok {
		prog = h.GLProgram
	} else if shader._glProgram != nil {
		prog = shader._glProgram
	}
	gl.deleteProgram(prog)
}

func (b *WebGLBackend) CreateUBO(size int, bindingPoint int) any {
	gl := b.GL
	if gl == nil {
		return nil
	}
	buf := gl.createBuffer()
	gl.bindBuffer(gl.UNIFORM_BUFFER, buf)
	gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW)
	gl.bindBuffer(gl.UNIFORM_BUFFER, nil)
	gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buf)

	return &WebGLUBOHandle{
		GLBuffer:     buf,
		Size:         size,
		BindingPoint: bindingPoint,
	}
}

func (b *WebGLBackend) DeleteUBO(ubo any) {
	if b.GL == nil || ubo == nil {
		return
	}
	gl := b.GL
	buf := ubo
	if h, ok := ubo.(*WebGLUBOHandle); ok {
		buf = h.GLBuffer
	} else if ubo._glBuffer != nil {
		buf = ubo._glBuffer
	}
	gl.deleteBuffer(buf)
}

func (b *WebGLBackend) UpdateUBO(ubo any, data any, offset int) {
	if b.GL == nil || ubo == nil || data == nil {
		return
	}
	gl := b.GL
	buf := ubo
	if h, ok := ubo.(*WebGLUBOHandle); ok {
		buf = h.GLBuffer
	} else if ubo._glBuffer != nil {
		buf = ubo._glBuffer
	}
	gl.bindBuffer(gl.UNIFORM_BUFFER, buf)
	gl.bufferSubData(gl.UNIFORM_BUFFER, offset, data)
	gl.bindBuffer(gl.UNIFORM_BUFFER, nil)
}

func (b *WebGLBackend) BindUniformBuffer(ubo any) {
	if b.GL == nil || ubo == nil {
		return
	}
	gl := b.GL
	buf := ubo
	bp := 0
	if h, ok := ubo.(*WebGLUBOHandle); ok {
		buf = h.GLBuffer
		bp = h.BindingPoint
	} else if ubo._glBuffer != nil {
		buf = ubo._glBuffer
		bp = ubo.bindingPoint
	}
	gl.bindBufferBase(gl.UNIFORM_BUFFER, bp, buf)
}

func (b *WebGLBackend) CreateFramebuffer(desc *rendering.FramebufferDescriptor) any {
	gl := b.GL
	if gl == nil || desc == nil {
		return nil
	}
	fb := gl.createFramebuffer()
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb)

	colorTextures := make([]any, 0, len(desc.ColorAttachments))
	drawBuffers := make([]any, 0, len(desc.ColorAttachments))

	for i := 0; i < len(desc.ColorAttachments); i++ {
		att := desc.ColorAttachments[i]
		var texHandle any
		if h, ok := att.(*WebGLTextureHandle); ok {
			texHandle = h
		} else if att._glTexture != nil {
			texHandle = att
		} else if td, ok := att.(*rendering.TextureDescriptor); ok {
			texHandle = b.CreateTexture(td)
		}

		colorTextures = append(colorTextures, texHandle)
		tex := texHandle
		if h, ok := texHandle.(*WebGLTextureHandle); ok {
			tex = h.GLTexture
		} else if texHandle._glTexture != nil {
			tex = texHandle._glTexture
		}

		slot := gl.COLOR_ATTACHMENT0 + i
		gl.framebufferTexture2D(gl.FRAMEBUFFER, slot, gl.TEXTURE_2D, tex, 0)
		drawBuffers = append(drawBuffers, slot)
	}

	var depthTexture any
	if desc.DepthAttachment != nil {
		att := desc.DepthAttachment
		if h, ok := att.(*WebGLTextureHandle); ok {
			depthTexture = h
		} else if att._glTexture != nil {
			depthTexture = att
		} else if td, ok := att.(*rendering.TextureDescriptor); ok {
			depthTexture = b.CreateTexture(td)
		}

		tex := depthTexture
		if h, ok := depthTexture.(*WebGLTextureHandle); ok {
			tex = h.GLTexture
		} else if depthTexture._glTexture != nil {
			tex = depthTexture._glTexture
		}
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0)
	}

	if len(drawBuffers) > 0 {
		gl.drawBuffers(drawBuffers)
	}

	status := gl.checkFramebufferStatus(gl.FRAMEBUFFER)
	if status != gl.FRAMEBUFFER_COMPLETE {
		if console != nil && console.error != nil {
			console.error("[Framebuffer] Incomplete framebuffer status:", status)
		}
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, nil)

	width := desc.Width
	if width <= 0 && b.Canvas != nil {
		width = b.Canvas.width
	}
	height := desc.Height
	if height <= 0 && b.Canvas != nil {
		height = b.Canvas.height
	}

	return &WebGLFramebufferHandle{
		GLFramebuffer: fb,
		ColorTextures: colorTextures,
		DepthTexture:  depthTexture,
		Width:         width,
		Height:        height,
	}
}

func (b *WebGLBackend) DeleteFramebuffer(framebuffer any) {
	if b.GL == nil || framebuffer == nil {
		return
	}
	gl := b.GL
	fb := framebuffer
	if h, ok := framebuffer.(*WebGLFramebufferHandle); ok {
		fb = h.GLFramebuffer
	} else if framebuffer._glFramebuffer != nil {
		fb = framebuffer._glFramebuffer
	}
	gl.deleteFramebuffer(fb)
}

func (b *WebGLBackend) BindFramebuffer(framebuffer any) {
	if b.GL == nil {
		return
	}
	gl := b.GL
	if framebuffer == nil {
		gl.bindFramebuffer(gl.FRAMEBUFFER, nil)
		if b.Canvas != nil {
			gl.viewport(0, 0, b.Canvas.width, b.Canvas.height)
		}
		return
	}

	fb := framebuffer
	width := 0
	height := 0
	if h, ok := framebuffer.(*WebGLFramebufferHandle); ok {
		fb = h.GLFramebuffer
		width = h.Width
		height = h.Height
	} else if framebuffer._glFramebuffer != nil {
		fb = framebuffer._glFramebuffer
		width = framebuffer.width
		height = framebuffer.height
	}
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
	gl.viewport(0, 0, width, height)
}

func (b *WebGLBackend) SetFramebufferAttachment(framebuffer any, attachment int, texture any, level int, layer int) {
	if b.GL == nil || framebuffer == nil {
		return
	}
	gl := b.GL
	fb := framebuffer
	if h, ok := framebuffer.(*WebGLFramebufferHandle); ok {
		fb = h.GLFramebuffer
	} else if framebuffer._glFramebuffer != nil {
		fb = framebuffer._glFramebuffer
	}
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb)

	tex := texture
	if h, ok := texture.(*WebGLTextureHandle); ok {
		tex = h.GLTexture
	} else if texture != nil && texture._glTexture != nil {
		tex = texture._glTexture
	}

	slot := gl.COLOR_ATTACHMENT0 + attachment
	gl.framebufferTexture2D(gl.FRAMEBUFFER, slot, gl.TEXTURE_2D, tex, level)
	gl.bindFramebuffer(gl.FRAMEBUFFER, nil)
}

func (b *WebGLBackend) CreateVertexState(desc *rendering.VertexStateDescriptor) any {
	gl := b.GL
	if gl == nil || desc == nil {
		return nil
	}
	vao := gl.createVertexArray()
	gl.bindVertexArray(vao)

	for i := 0; i < len(desc.Attributes); i++ {
		attr := desc.Attributes[i]
		attrType := gl.FLOAT
		isInteger := false

		if attr.Type == "float" {
			attrType = gl.FLOAT
		} else if attr.Type == "byte" {
			attrType = gl.BYTE
		} else if attr.Type == "unsigned-byte" || attr.Type == "ubyte" {
			attrType = gl.UNSIGNED_BYTE
			isInteger = true
		} else if attr.Type == "short" {
			attrType = gl.SHORT
		} else if attr.Type == "unsigned-short" {
			attrType = gl.UNSIGNED_SHORT
		} else if attr.Type == "int" {
			attrType = gl.INT
			isInteger = true
		} else if attr.Type == "unsigned-int" {
			attrType = gl.UNSIGNED_INT
			isInteger = true
		}

		buf := attr.Buffer
		if h, ok := attr.Buffer.(*WebGLBufferHandle); ok {
			buf = h.GLBuffer
		} else if attr.Buffer != nil && attr.Buffer._glBuffer != nil {
			buf = attr.Buffer._glBuffer
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, buf)

		if isInteger {
			gl.vertexAttribIPointer(attr.Slot, attr.Size, attrType, attr.Stride, attr.Offset)
		} else {
			gl.vertexAttribPointer(attr.Slot, attr.Size, attrType, attr.Normalized, attr.Stride, attr.Offset)
		}
		gl.enableVertexAttribArray(attr.Slot)
		if attr.Divisor > 0 {
			gl.vertexAttribDivisor(attr.Slot, attr.Divisor)
		}
	}

	var boundIndexBuffer any
	if desc.IndexBuffer != nil {
		ib := desc.IndexBuffer
		if h, ok := desc.IndexBuffer.(*WebGLBufferHandle); ok {
			ib = h.GLBuffer
		} else if desc.IndexBuffer._glBuffer != nil {
			ib = desc.IndexBuffer._glBuffer
		}
		boundIndexBuffer = ib
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
	}

	gl.bindVertexArray(nil)
	gl.bindBuffer(gl.ARRAY_BUFFER, nil)

	return &WebGLVertexStateHandle{
		GLVAO:            vao,
		BoundIndexBuffer: boundIndexBuffer,
	}
}

func (b *WebGLBackend) BindVertexState(state any) {
	if b.GL == nil {
		return
	}
	gl := b.GL
	b.CurrentVAO = state
	if state == nil {
		b.CurrentIndexBuffer = nil
		gl.bindVertexArray(nil)
		return
	}

	vao := state
	if h, ok := state.(*WebGLVertexStateHandle); ok {
		vao = h.GLVAO
		b.CurrentIndexBuffer = h.BoundIndexBuffer
	} else if state._glVAO != nil {
		vao = state._glVAO
		b.CurrentIndexBuffer = state._boundIndexBuffer
	}
	gl.bindVertexArray(vao)
}

func (b *WebGLBackend) DeleteVertexState(state any) {
	if b.GL == nil || state == nil {
		return
	}
	gl := b.GL
	vao := state
	if h, ok := state.(*WebGLVertexStateHandle); ok {
		vao = h.GLVAO
	} else if state._glVAO != nil {
		vao = state._glVAO
	}
	gl.deleteVertexArray(vao)
}

func (b *WebGLBackend) SetBlendState(enabled bool, srcFactor, dstFactor string) {
	if b.GL == nil {
		return
	}
	if b.BlendEnabled == enabled && (!enabled || (b.BlendSrc == srcFactor && b.BlendDst == dstFactor)) {
		return
	}
	gl := b.GL
	if enabled {
		if b.BlendEnabled != true {
			gl.enable(gl.BLEND)
		}
		src := gl.ONE
		if s, ok := b.BlendFactors[srcFactor]; ok {
			src = s
		}
		dst := gl.ZERO
		if d, ok := b.BlendFactors[dstFactor]; ok {
			dst = d
		}
		gl.blendFunc(src, dst)
	} else {
		gl.disable(gl.BLEND)
	}
	b.BlendEnabled = enabled
	b.BlendSrc = srcFactor
	b.BlendDst = dstFactor
}

func (b *WebGLBackend) SetDepthState(testEnabled bool, writeEnabled bool, funcName string) {
	if b.GL == nil {
		return
	}
	if b.DepthTest == testEnabled && b.DepthWrite == writeEnabled && b.DepthFunc == funcName {
		return
	}
	gl := b.GL
	if testEnabled != b.DepthTest {
		if testEnabled {
			gl.enable(gl.DEPTH_TEST)
		} else {
			gl.disable(gl.DEPTH_TEST)
		}
	}
	if writeEnabled != b.DepthWrite {
		gl.depthMask(writeEnabled)
	}
	if funcName != b.DepthFunc {
		df := gl.LEQUAL
		if f, ok := b.DepthFuncs[funcName]; ok {
			df = f
		}
		gl.depthFunc(df)
	}
	b.DepthTest = testEnabled
	b.DepthWrite = writeEnabled
	b.DepthFunc = funcName
}

func (b *WebGLBackend) SetCullState(enabled bool, face string) {
	if b.GL == nil {
		return
	}
	if b.CullEnabled == enabled && (!enabled || b.CullFace == face) {
		return
	}
	gl := b.GL
	if enabled {
		if b.CullEnabled != true {
			gl.enable(gl.CULL_FACE)
		}
		cf := gl.BACK
		if face == "front" {
			cf = gl.FRONT
		}
		gl.cullFace(cf)
	} else {
		gl.disable(gl.CULL_FACE)
	}
	b.CullEnabled = enabled
	b.CullFace = face
}

func (b *WebGLBackend) SetPolygonOffset(enabled bool, factor, units float32) {
	if b.GL == nil {
		return
	}
	gl := b.GL
	if enabled {
		gl.enable(gl.POLYGON_OFFSET_FILL)
		gl.polygonOffset(factor, units)
	} else {
		gl.disable(gl.POLYGON_OFFSET_FILL)
	}
}

func (b *WebGLBackend) SetViewport(x, y, width, height int) {
	if b.GL != nil {
		b.GL.viewport(x, y, width, height)
	}
}

func (b *WebGLBackend) SetDepthRange(near, far float32) {
	if b.GL != nil {
		b.GL.depthRange(near, far)
	}
}

func (b *WebGLBackend) Clear(options *rendering.ClearOptions) {
	if b.GL == nil || options == nil {
		return
	}
	gl := b.GL
	bits := 0
	if options.ClearColor && len(options.Color) >= 4 {
		gl.clearColor(options.Color[0], options.Color[1], options.Color[2], options.Color[3])
		bits |= gl.COLOR_BUFFER_BIT
	}
	if options.ClearDepth {
		gl.clearDepth(options.Depth)
		bits |= gl.DEPTH_BUFFER_BIT
	}
	if bits > 0 {
		gl.clear(bits)
	}
}

func (b *WebGLBackend) SetColorMask(r, g, bl, a bool) {
	if b.GL == nil {
		return
	}
	b.GL.colorMask(r, g, bl, a)
}

func (b *WebGLBackend) DrawIndexed(indexBuffer any, indexCount int, indexOffset int, mode string) {
	if b.GL == nil || indexBuffer == nil {
		return
	}
	gl := b.GL
	drawMode := gl.TRIANGLES
	if mode == "lines" {
		drawMode = gl.LINES
	} else if mode == "points" {
		drawMode = gl.POINTS
	} else if mode == "triangle-strip" {
		drawMode = gl.TRIANGLE_STRIP
	}

	bytesPerElement := 4
	indexType := gl.UNSIGNED_INT
	buf := indexBuffer
	if h, ok := indexBuffer.(*WebGLBufferHandle); ok {
		buf = h.GLBuffer
		if h.BytesPerElement == 2 {
			bytesPerElement = 2
			indexType = gl.UNSIGNED_SHORT
		}
	} else if indexBuffer._glBuffer != nil {
		buf = indexBuffer._glBuffer
		if indexBuffer.bytesPerElement == 2 {
			bytesPerElement = 2
			indexType = gl.UNSIGNED_SHORT
		}
	}

	if b.CurrentIndexBuffer != buf {
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf)
		b.CurrentIndexBuffer = buf
	}

	gl.drawElements(drawMode, indexCount, indexType, indexOffset*bytesPerElement)
}

func (b *WebGLBackend) DrawInstanced(indexBuffer any, indexCount int, instanceCount int) {
	if b.GL == nil || indexBuffer == nil || instanceCount <= 0 {
		return
	}
	gl := b.GL
	indexType := gl.UNSIGNED_INT
	buf := indexBuffer
	if h, ok := indexBuffer.(*WebGLBufferHandle); ok {
		buf = h.GLBuffer
		if h.BytesPerElement == 2 {
			indexType = gl.UNSIGNED_SHORT
		}
	} else if indexBuffer._glBuffer != nil {
		buf = indexBuffer._glBuffer
		if indexBuffer.bytesPerElement == 2 {
			indexType = gl.UNSIGNED_SHORT
		}
	}

	if b.CurrentIndexBuffer != buf {
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf)
		b.CurrentIndexBuffer = buf
	}

	gl.drawElementsInstanced(gl.TRIANGLES, indexCount, indexType, 0, instanceCount)
}

func (b *WebGLBackend) SetUniform(name string, typeName string, value any) {
	if b.GL == nil || b.CurrentShader == nil {
		return
	}
	gl := b.GL
	shader := b.CurrentShader
	var prog any
	var uCache map[string]any
	var valCache map[string]any

	if h, ok := shader.(*WebGLProgramHandle); ok {
		prog = h.GLProgram
		uCache = h.UniformCache
		valCache = h.UniformValueCache
	} else if shader._glProgram != nil {
		prog = shader._glProgram
		uCache = shader._uniformCache
		valCache = shader._uniformValueCache
	}

	if prog == nil {
		return
	}

	var location any
	if uCache != nil {
		if loc, ok := uCache[name]; ok {
			location = loc
		} else {
			location = gl.getUniformLocation(prog, name)
			uCache[name] = location
		}
	} else {
		location = gl.getUniformLocation(prog, name)
	}

	if location == nil {
		return
	}

	if typeName == "int" {
		gl.uniform1i(location, value)
	} else if typeName == "float" {
		gl.uniform1f(location, value)
	} else if typeName == "vec2" {
		gl.uniform2f(location, value[0], value[1])
	} else if typeName == "vec3" {
		gl.uniform3f(location, value[0], value[1], value[2])
	} else if typeName == "vec4" {
		gl.uniform4f(location, value[0], value[1], value[2], value[3])
	} else if typeName == "mat4" || typeName == "mat4[]" {
		gl.uniformMatrix4fv(location, false, value)
	} else if typeName == "vec3[]" {
		gl.uniform3fv(location, value)
	} else if typeName == "float[]" {
		gl.uniform1fv(location, value)
	}
}

func (b *WebGLBackend) GetCapabilities() *rendering.Capabilities {
	return b.Capabilities
}

func (b *WebGLBackend) IsWebGPU() bool {
	return false
}

func (b *WebGLBackend) GetCanvas() any {
	return b.Canvas
}

func (b *WebGLBackend) GetNativeWidth() int {
	if b.Canvas == nil {
		return 0
	}
	dpr := 1.0
	if window != nil && window.devicePixelRatio != nil {
		dpr = window.devicePixelRatio
	}
	return int(float64(b.Canvas.clientWidth) * dpr)
}

func (b *WebGLBackend) GetNativeHeight() int {
	if b.Canvas == nil {
		return 0
	}
	dpr := 1.0
	if window != nil && window.devicePixelRatio != nil {
		dpr = window.devicePixelRatio
	}
	return int(float64(b.Canvas.clientHeight) * dpr)
}

func (b *WebGLBackend) GetWidth() int {
	nativeW := b.GetNativeWidth()
	scale := b.RenderScale
	if scale <= 0 {
		scale = 1.0
	}
	return int(float32(nativeW) * scale)
}

func (b *WebGLBackend) GetHeight() int {
	nativeH := b.GetNativeHeight()
	scale := b.RenderScale
	if scale <= 0 {
		scale = 1.0
	}
	return int(float32(nativeH) * scale)
}

func (b *WebGLBackend) GetAspectRatio() float32 {
	h := b.GetHeight()
	if h <= 0 {
		return 1.0
	}
	return float32(b.GetWidth()) / float32(h)
}

func (b *WebGLBackend) Resize() {
	if b.Canvas == nil || b.GL == nil {
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
	b.GL.viewport(0, 0, scaledW, scaledH)
}

func (b *WebGLBackend) ClearBindGroupCaches() {
}

func (b *WebGLBackend) InitShaders(catalog *rendering.ShaderCatalog) {
	if catalog == nil {
		return
	}

	load := func(name string) *rendering.Shader {
		def := GlslShaderSources[name]
		if len(def.Vertex) == 0 {
			return nil
		}
		return rendering.NewShader(def.Vertex, def.Fragment)
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
