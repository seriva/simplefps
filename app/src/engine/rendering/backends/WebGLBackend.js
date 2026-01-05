/**
 * WebGLBackend - WebGL2 implementation of the RenderBackend interface
 *
 * This wraps the existing WebGL2 context and provides an API-agnostic interface
 * for the renderer to use. This allows the same rendering code to work with
 * both WebGL2 and WebGPU backends.
 */
import Settings from "../../core/settings.js";
import Console from "../../systems/console.js";
import { css } from "../../utils/reactive.js";
import RenderBackend from "./RenderBackend.js";

// Canvas style
const _canvasStyle = css`
	background: #000;
	position: fixed;
	top: 0;
	left: 0;
	width: 100dvw;
	height: 100dvh;
	display: block;
	z-index: 0;
`;

// Required WebGL extensions
const _REQUIRED_EXTENSIONS = {
	EXT_color_buffer_float: "EXT_color_buffer_float",
};

// Optional WebGL extensions
const _OPTIONAL_EXTENSIONS = {
	anisotropic: [
		"EXT_texture_filter_anisotropic",
		"MOZ_EXT_texture_filter_anisotropic",
		"WEBKIT_EXT_texture_filter_anisotropic",
	],
};

// Blend factor mapping
const _BLEND_FACTORS = {
	zero: 0, // Will be set to gl.ZERO after init
	one: 1,
	"src-alpha": 2,
	"one-minus-src-alpha": 3,
	"dst-color": 4,
};

// Depth function mapping
const _DEPTH_FUNCS = {
	never: 0,
	less: 1,
	equal: 2,
	lequal: 3,
	greater: 4,
	notequal: 5,
	gequal: 6,
	always: 7,
};

class WebGLBackend extends RenderBackend {
	constructor() {
		super();
		this._canvas = null;
		this._gl = null;
		this._afExt = null;
		this._capabilities = {};
		this._currentShader = null;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async init(canvas = null) {
		// Create canvas if not provided
		if (!canvas) {
			this._canvas = document.createElement("canvas");
			this._canvas.id = "context";
			this._canvas.className = _canvasStyle;
			document.body.appendChild(this._canvas);
		} else {
			this._canvas = canvas;
		}

		// Create WebGL2 context
		this._gl = this._canvas.getContext("webgl2", {
			premultipliedAlpha: false,
			antialias: false,
			preserveDrawingBuffer: true,
		});

		if (!this._gl) {
			Console.error("Failed to initialize WebGL 2.0 context");
			return false;
		}

		const gl = this._gl;

		// Check required extensions
		try {
			for (const [key, ext] of Object.entries(_REQUIRED_EXTENSIONS)) {
				const extension = gl.getExtension(ext);
				if (!extension) {
					Console.error(`Required WebGL extension ${ext} is not supported`);
					return false;
				}
				gl[key] = extension;
			}

			// Check optional extensions
			this._afExt = _OPTIONAL_EXTENSIONS.anisotropic.reduce(
				(ext, name) => ext || gl.getExtension(name),
				null,
			);

			// Initialize default WebGL state
			gl.clearColor(0.0, 0.0, 0.0, 1.0);
			gl.clearDepth(1.0);
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LEQUAL);
			gl.enable(gl.CULL_FACE);
			gl.cullFace(gl.BACK);

			// Store capabilities
			this._capabilities = {
				maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
				maxAnisotropy: this._afExt
					? gl.getParameter(this._afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
					: 1,
				renderer: gl.getParameter(gl.RENDERER),
				vendor: gl.getParameter(gl.VENDOR),
				version: gl.getParameter(gl.VERSION),
				glslVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
			};

			// Setup blend factor mapping with actual GL values
			_BLEND_FACTORS.zero = gl.ZERO;
			_BLEND_FACTORS.one = gl.ONE;
			_BLEND_FACTORS["src-alpha"] = gl.SRC_ALPHA;
			_BLEND_FACTORS["one-minus-src-alpha"] = gl.ONE_MINUS_SRC_ALPHA;
			_BLEND_FACTORS["dst-color"] = gl.DST_COLOR;

			// Setup depth function mapping with actual GL values
			_DEPTH_FUNCS.never = gl.NEVER;
			_DEPTH_FUNCS.less = gl.LESS;
			_DEPTH_FUNCS.equal = gl.EQUAL;
			_DEPTH_FUNCS.lequal = gl.LEQUAL;
			_DEPTH_FUNCS.greater = gl.GREATER;
			_DEPTH_FUNCS.notequal = gl.NOTEQUAL;
			_DEPTH_FUNCS.gequal = gl.GEQUAL;
			_DEPTH_FUNCS.always = gl.ALWAYS;

			// Log context information
			Console.log("Initialized WebGL2 backend");
			Console.log(`Renderer: ${this._capabilities.renderer}`);
			Console.log(`Vendor: ${this._capabilities.vendor}`);
			Console.log(`WebGL version: ${this._capabilities.version}`);
			Console.log(`GLSL version: ${this._capabilities.glslVersion}`);
			Console.log(
				`Max anisotropic filtering: ${this._capabilities.maxAnisotropy}`,
			);
		} catch (error) {
			Console.error(`WebGL initialization failed: ${error.message}`);
			return false;
		}

		return true;
	}

	dispose() {
		// WebGL context is automatically cleaned up when canvas is removed
		if (this._canvas?.parentNode) {
			this._canvas.parentNode.removeChild(this._canvas);
		}
		this._gl = null;
		this._canvas = null;
	}

	// =========================================================================
	// Frame Management
	// =========================================================================

	beginFrame() {
		// WebGL doesn't require explicit frame begin
	}

	endFrame() {
		// WebGL doesn't require explicit frame end (auto-presents)
	}

	// =========================================================================
	// Resource Creation
	// =========================================================================

	createTexture(descriptor) {
		const gl = this._gl;
		const texture = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Set default filtering
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_MIN_FILTER,
			descriptor.data ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST,
		);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_MAG_FILTER,
			descriptor.data ? gl.LINEAR : gl.NEAREST,
		);

		// Create storage
		if (descriptor.format && !descriptor.mutable) {
			// Immutable storage
			gl.texStorage2D(
				gl.TEXTURE_2D,
				1,
				descriptor.format,
				descriptor.width,
				descriptor.height,
			);
		} else {
			// Mutable storage (or default 1x1 black if implied)
			const width = descriptor.width || 1;
			const height = descriptor.height || 1;
			const format = descriptor.format || gl.RGBA; // Default to RGBA part
			const internalFormat = descriptor.internalFormat || gl.RGBA;
			const type = descriptor.type || gl.UNSIGNED_BYTE;

			// If data provided, use it, otherwise black 1x1 or empty
			if (descriptor.pdata) {
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					internalFormat,
					width,
					height,
					0,
					format,
					type,
					descriptor.pdata,
				);
			} else {
				// Initialize with black pixel if requested or just allocate
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					internalFormat,
					width,
					height,
					0,
					format,
					type,
					new Uint8Array([0, 0, 0, 255]), // Default 1x1 black
				);
			}
		}

		// Upload sub-data if provided (and not handled above by mutable path)
		if (
			descriptor.pdata &&
			descriptor.ptype &&
			descriptor.pformat &&
			!descriptor.mutable
		) {
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				descriptor.width,
				descriptor.height,
				descriptor.pformat,
				descriptor.ptype,
				descriptor.pdata,
			);
		}

		gl.bindTexture(gl.TEXTURE_2D, null);

		return {
			_glTexture: texture,
			width: descriptor.width,
			height: descriptor.height,
		};
	}

	createBuffer(data, usage) {
		const gl = this._gl;
		const buffer = gl.createBuffer();

		const target =
			usage === "index" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
		gl.bindBuffer(target, buffer);
		gl.bufferData(target, data, gl.STATIC_DRAW);
		gl.bindBuffer(target, null);

		return {
			_glBuffer: buffer,
			usage,
			length: data.length,
			bytesPerElement: data.BYTES_PER_ELEMENT || 4,
		};
	}

	deleteBuffer(buffer) {
		const gl = this._gl;
		gl.deleteBuffer(buffer._glBuffer);
	}

	createVertexState(descriptor) {
		const gl = this._gl;
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);

		for (const attr of descriptor.attributes) {
			let type = gl.FLOAT;
			if (attr.type === "float") type = gl.FLOAT;
			else if (attr.type === "byte") type = gl.BYTE;
			else if (attr.type === "unsigned-byte") type = gl.UNSIGNED_BYTE;
			else if (attr.type === "short") type = gl.SHORT;
			else if (attr.type === "unsigned-short") type = gl.UNSIGNED_SHORT;
			else if (attr.type === "int") type = gl.INT;
			else if (attr.type === "unsigned-int") type = gl.UNSIGNED_INT;
			else if (typeof attr.type === "number") type = attr.type;

			gl.bindBuffer(gl.ARRAY_BUFFER, attr.buffer._glBuffer);
			gl.vertexAttribPointer(
				attr.slot,
				attr.size,
				type,
				attr.normalized || false,
				attr.stride || 0,
				attr.offset || 0,
			);
			gl.enableVertexAttribArray(attr.slot);
		}

		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		return { _glVAO: vao };
	}

	bindVertexState(vertexState) {
		const gl = this._gl;
		gl.bindVertexArray(vertexState ? vertexState._glVAO : null);
	}

	deleteVertexState(vertexState) {
		const gl = this._gl;
		gl.deleteVertexArray(vertexState._glVAO);
	}

	createShaderProgram(vertexSrc, fragmentSrc, _wgslSrc = null) {
		const gl = this._gl;

		// Create and compile vertex shader
		const vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, vertexSrc);
		gl.compileShader(vertexShader);

		if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(vertexShader);
			Console.error(`Error compiling vertex shader: ${error}`);
			gl.deleteShader(vertexShader);
			return null;
		}

		// Create and compile fragment shader
		const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, fragmentSrc);
		gl.compileShader(fragmentShader);

		if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(fragmentShader);
			Console.error(`Error compiling fragment shader: ${error}`);
			gl.deleteShader(vertexShader);
			gl.deleteShader(fragmentShader);
			return null;
		}

		// Create and link program
		const program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const error = gl.getProgramInfoLog(program);
			Console.error(`Error linking program: ${error}`);
			gl.deleteProgram(program);
			gl.deleteShader(vertexShader);
			gl.deleteShader(fragmentShader);
			return null;
		}

		// Cleanup shaders after linking
		gl.detachShader(program, vertexShader);
		gl.detachShader(program, fragmentShader);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);

		// Auto-bind UBOs
		const frameDataIndex = gl.getUniformBlockIndex(program, "FrameData");
		if (frameDataIndex !== gl.INVALID_INDEX) {
			gl.uniformBlockBinding(program, frameDataIndex, 0);
		}

		const materialDataIndex = gl.getUniformBlockIndex(program, "MaterialData");
		if (materialDataIndex !== gl.INVALID_INDEX) {
			gl.uniformBlockBinding(program, materialDataIndex, 1);
		}

		return {
			_glProgram: program,
			_uniformCache: new Map(),
		};
	}

	createUBO(size, bindingPoint) {
		const gl = this._gl;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
		gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);

		gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);

		return { _glBuffer: buffer, size, bindingPoint };
	}

	updateUBO(ubo, data, offset = 0) {
		const gl = this._gl;
		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo._glBuffer);
		gl.bufferSubData(gl.UNIFORM_BUFFER, offset, data);
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);
	}

	bindUniformBuffer(ubo) {
		const gl = this._gl;
		if (ubo) {
			gl.bindBufferBase(gl.UNIFORM_BUFFER, ubo.bindingPoint, ubo._glBuffer);
		}
	}

	// =========================================================================
	// Framebuffer Management
	// =========================================================================

	createFramebuffer(descriptor) {
		const gl = this._gl;
		const framebuffer = gl.createFramebuffer();
		const textures = [];
		let depthTexture = null;

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

		// Create color attachments
		const drawBuffers = [];
		if (descriptor.colorAttachments) {
			for (let i = 0; i < descriptor.colorAttachments.length; i++) {
				const att = descriptor.colorAttachments[i];
				const texHandle = this.createTexture(att);
				textures.push(texHandle);

				gl.framebufferTexture2D(
					gl.FRAMEBUFFER,
					gl.COLOR_ATTACHMENT0 + i,
					gl.TEXTURE_2D,
					texHandle._glTexture,
					0,
				);
				drawBuffers.push(gl.COLOR_ATTACHMENT0 + i);
			}
		}

		// Create depth attachment
		if (descriptor.depthAttachment) {
			depthTexture = this.createTexture(descriptor.depthAttachment);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.DEPTH_ATTACHMENT,
				gl.TEXTURE_2D,
				depthTexture._glTexture,
				0,
			);
		}

		if (drawBuffers.length > 0) {
			gl.drawBuffers(drawBuffers);
		}

		// Check status
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (status !== gl.FRAMEBUFFER_COMPLETE) {
			Console.error(`Framebuffer incomplete: ${status}`);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return {
			_glFramebuffer: framebuffer,
			colorTextures: textures,
			depthTexture,
		};
	}

	bindFramebuffer(framebuffer) {
		const gl = this._gl;
		if (framebuffer) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer._glFramebuffer);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}
	}

	// =========================================================================
	// Resource Binding
	// =========================================================================

	bindTexture(texture, unit) {
		const gl = this._gl;
		// Handle whether unit is passed as index (0) or Enum (gl.TEXTURE0)
		if (unit >= gl.TEXTURE0) {
			gl.activeTexture(unit);
		} else {
			gl.activeTexture(gl.TEXTURE0 + unit);
		}
		gl.bindTexture(gl.TEXTURE_2D, texture._glTexture);
	}

	unbindTexture(unit) {
		const gl = this._gl;
		// Handle whether unit is passed as index (0) or Enum (gl.TEXTURE0)
		if (unit >= gl.TEXTURE0) {
			gl.activeTexture(unit);
		} else {
			gl.activeTexture(gl.TEXTURE0 + unit);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	bindShader(shader) {
		const gl = this._gl;
		gl.useProgram(shader._glProgram);
		this._currentShader = shader;
	}

	unbindShader() {
		const gl = this._gl;
		gl.useProgram(null);
		this._currentShader = null;
	}

	disposeShader(shader) {
		const gl = this._gl;
		if (shader?._glProgram) {
			gl.deleteProgram(shader._glProgram);
		}
	}

	// =========================================================================
	// Texture Management (Extended)
	// =========================================================================

	uploadTextureFromImage(texture, source) {
		const gl = this._gl;
		gl.bindTexture(gl.TEXTURE_2D, texture._glTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.bindTexture(gl.TEXTURE_2D, null);
		// Update handle dimensions
		texture.width = source.width;
		texture.height = source.height;
	}

	generateMipmaps(texture) {
		const gl = this._gl;
		gl.bindTexture(gl.TEXTURE_2D, texture._glTexture);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	setTextureWrapMode(texture, mode) {
		const gl = this._gl;
		let glMode;
		switch (mode) {
			case "repeat":
				glMode = gl.REPEAT;
				break;
			case "clamp-to-edge":
				glMode = gl.CLAMP_TO_EDGE;
				break;
			case "mirrored-repeat":
				glMode = gl.MIRRORED_REPEAT;
				break;
			default:
				glMode = gl.REPEAT;
		}

		gl.bindTexture(gl.TEXTURE_2D, texture._glTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glMode);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	disposeTexture(texture) {
		const gl = this._gl;
		gl.deleteTexture(texture._glTexture);
	}

	setTextureAnisotropy(texture, level) {
		const gl = this._gl;
		const ext = this._afExt;
		if (ext) {
			const maxAniso = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
			const af = Math.min(Math.max(level, 1), maxAniso);
			gl.bindTexture(gl.TEXTURE_2D, texture._glTexture);
			gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, af);
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
	}

	// =========================================================================
	// State Management
	// =========================================================================

	setBlendState(enabled, srcFactor = "one", dstFactor = "zero") {
		const gl = this._gl;
		if (enabled) {
			gl.enable(gl.BLEND);
			gl.blendFunc(_BLEND_FACTORS[srcFactor], _BLEND_FACTORS[dstFactor]);
		} else {
			gl.disable(gl.BLEND);
		}
	}

	setDepthState(testEnabled, writeEnabled, func = "lequal") {
		const gl = this._gl;
		if (testEnabled) {
			gl.enable(gl.DEPTH_TEST);
		} else {
			gl.disable(gl.DEPTH_TEST);
		}
		gl.depthMask(writeEnabled);
		gl.depthFunc(_DEPTH_FUNCS[func]);
	}

	setCullState(enabled, face = "back") {
		const gl = this._gl;
		if (enabled) {
			gl.enable(gl.CULL_FACE);
			gl.cullFace(face === "front" ? gl.FRONT : gl.BACK);
		} else {
			gl.disable(gl.CULL_FACE);
		}
	}

	setViewport(x, y, width, height) {
		this._gl.viewport(x, y, width, height);
	}

	setDepthRange(near, far) {
		this._gl.depthRange(near, far);
	}

	clear(options) {
		const gl = this._gl;
		let bits = 0;

		if (options.color) {
			gl.clearColor(
				options.color[0],
				options.color[1],
				options.color[2],
				options.color[3] ?? 1.0,
			);
			bits |= gl.COLOR_BUFFER_BIT;
		}

		if (options.depth !== undefined) {
			gl.clearDepth(options.depth);
			bits |= gl.DEPTH_BUFFER_BIT;
		}

		if (options.stencil !== undefined) {
			gl.clearStencil(options.stencil);
			bits |= gl.STENCIL_BUFFER_BIT;
		}

		if (bits) {
			gl.clear(bits);
		}
	}

	// =========================================================================
	// Drawing
	// =========================================================================

	drawIndexed(indexBuffer, indexCount, indexOffset = 0, mode = null) {
		const gl = this._gl;
		let drawMode = gl.TRIANGLES;

		if (mode === "lines") {
			drawMode = gl.LINES;
		} else if (mode === "points") {
			drawMode = gl.POINTS;
		} else if (mode === "triangle-strip") {
			drawMode = gl.TRIANGLE_STRIP;
		} else if (typeof mode === "number") {
			// Fallback for raw GL constants until full migration
			drawMode = mode;
		}

		const bytesPerElement = indexBuffer.bytesPerElement || 2;
		const type = bytesPerElement === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer._glBuffer);
		gl.drawElements(drawMode, indexCount, type, indexOffset * bytesPerElement);
	}

	drawFullscreenQuad() {
		const gl = this._gl;
		// Assumes a fullscreen quad is already set up
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	// =========================================================================
	// Uniform Setters
	// =========================================================================

	setUniform(name, type, value) {
		const gl = this._gl;
		if (!this._currentShader) return;

		const shader = this._currentShader;
		let location = shader._uniformCache.get(name);

		if (location === undefined) {
			location = gl.getUniformLocation(shader._glProgram, name);
			shader._uniformCache.set(name, location);
		}

		if (location === null) return;

		switch (type) {
			case "int":
				gl.uniform1i(location, value);
				break;
			case "float":
				gl.uniform1f(location, value);
				break;
			case "vec2":
				gl.uniform2f(location, value[0], value[1]);
				break;
			case "vec3":
				gl.uniform3f(location, value[0], value[1], value[2]);
				break;
			case "vec4":
				gl.uniform4f(location, value[0], value[1], value[2], value[3]);
				break;
			case "mat4":
				gl.uniformMatrix4fv(location, false, value);
				break;
			case "vec3[]":
				gl.uniform3fv(location, value);
				break;
			default:
				Console.warn(`Unknown uniform type: ${type}`);
		}
	}

	// =========================================================================
	// Queries
	// =========================================================================

	getCapabilities() {
		return this._capabilities;
	}

	isWebGPU() {
		return false;
	}

	getCanvas() {
		return this._canvas;
	}

	getWidth() {
		return Math.floor(
			this._canvas.clientWidth *
				(window.devicePixelRatio || 1) *
				Settings.renderScale,
		);
	}

	getHeight() {
		return Math.floor(
			this._canvas.clientHeight *
				(window.devicePixelRatio || 1) *
				Settings.renderScale,
		);
	}

	getAspectRatio() {
		return this.getWidth() / this.getHeight();
	}

	resize() {
		const width = this.getWidth();
		const height = this.getHeight();
		this._canvas.width = width;
		this._canvas.height = height;
		this._gl.viewport(0, 0, width, height);
	}

	// =========================================================================
	// WebGL-specific accessors (for backward compatibility during migration)
	// =========================================================================

	/**
	 * Get the raw WebGL2 context
	 * @returns {WebGL2RenderingContext}
	 */
	getGL() {
		return this._gl;
	}

	/**
	 * Get the anisotropic filtering extension
	 * @returns {Object|null}
	 */
	getAnisotropicExt() {
		return this._afExt;
	}
}

export default WebGLBackend;
