import Settings from "../../core/settings.js";
import Console from "../../systems/console.js";
import { css } from "../../utils/reactive.js";
import RenderBackend from "./renderbackend.js";

// Canvas style (same as WebGL)
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

// Texture format mapping (WebGPU formats)
const _TEXTURE_FORMATS = {
	// Internal formats -> WebGPU equivalents
	depth24: "depth24plus",
	rgba16f: "rgba16float",
	rgba8: "rgba8unorm",
	rgba: "rgba8unorm",

	// For depth textures
	depth: "depth24plus",
};

// Blend factor mapping
const _BLEND_FACTORS = {
	zero: "zero",
	one: "one",
	"src-alpha": "src-alpha",
	"one-minus-src-alpha": "one-minus-src-alpha",
	"dst-color": "dst",
};

// Depth function mapping
const _DEPTH_FUNCS = {
	never: "never",
	less: "less",
	equal: "equal",
	lequal: "less-equal",
	greater: "greater",
	notequal: "not-equal",
	gequal: "greater-equal",
	always: "always",
};

class WebGPUBackend extends RenderBackend {
	constructor() {
		super();
		this._canvas = null;
		this._adapter = null;
		this._device = null;
		this._context = null;
		this._format = null;
		this._capabilities = {};

		// Per-frame state
		this._commandEncoder = null;
		this._currentPass = null;
		this._currentTexture = null;

		// Render state (for pipeline creation)
		this._depthState = {
			test: true,
			write: true,
			func: "less-equal",
		};
		this._blendState = {
			enabled: false,
			srcFactor: "one",
			dstFactor: "zero",
		};
		this._cullState = {
			enabled: true,
			face: "back",
		};

		// Current shader for uniform setting
		this._currentShader = null;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async init(canvas = null) {
		if (!navigator.gpu) {
			Console.error("WebGPU is not supported in this browser");
			return false;
		}

		// Create canvas if not provided
		if (!canvas) {
			this._canvas = document.createElement("canvas");
			this._canvas.id = "context";
			this._canvas.className = _canvasStyle;
			document.body.appendChild(this._canvas);
		} else {
			this._canvas = canvas;
		}

		try {
			// Request adapter
			this._adapter = await navigator.gpu.requestAdapter({
				powerPreference: "high-performance",
			});

			if (!this._adapter) {
				Console.error("Failed to get WebGPU adapter");
				return false;
			}

			// Request device
			this._device = await this._adapter.requestDevice({
				requiredFeatures: [],
				requiredLimits: {},
			});

			if (!this._device) {
				Console.error("Failed to get WebGPU device");
				return false;
			}

			// Handle device loss
			this._device.lost.then((info) => {
				Console.error(`WebGPU device lost: ${info.reason} - ${info.message}`);
			});

			// Configure canvas context
			this._context = this._canvas.getContext("webgpu");
			if (!this._context) {
				Console.error("Failed to get WebGPU context");
				return false;
			}

			this._format = navigator.gpu.getPreferredCanvasFormat();

			this._context.configure({
				device: this._device,
				format: this._format,
				alphaMode: "opaque",
			});

			// Store capabilities
			const limits = this._device.limits;
			this._capabilities = {
				maxTextureSize: limits.maxTextureDimension2D,
				maxAnisotropy: 16, // WebGPU supports up to 16
				renderer: "WebGPU",
				vendor: this._adapter.info?.vendor || "Unknown",
				version: "WebGPU 1.0",
			};

			// Log context information
			Console.log("Initialized WebGPU backend");
			Console.log(`Adapter: ${this._adapter.info?.description || "Unknown"}`);
			Console.log(`Preferred format: ${this._format}`);
			Console.log(`Max texture size: ${this._capabilities.maxTextureSize}`);
		} catch (error) {
			Console.error(`WebGPU initialization failed: ${error.message}`);
			return false;
		}

		return true;
	}

	dispose() {
		if (this._device) {
			this._device.destroy();
			this._device = null;
		}
		if (this._canvas?.parentNode) {
			this._canvas.parentNode.removeChild(this._canvas);
		}
		this._canvas = null;
		this._context = null;
		this._adapter = null;
	}

	// =========================================================================
	// Frame Management
	// =========================================================================

	beginFrame() {
		// Get the current texture to render to
		this._currentTexture = this._context.getCurrentTexture();

		// Create command encoder for this frame
		this._commandEncoder = this._device.createCommandEncoder();
	}

	endFrame() {
		// End any active render pass
		if (this._currentPass) {
			this._currentPass.end();
			this._currentPass = null;
		}

		// Submit all commands
		if (this._commandEncoder) {
			this._device.queue.submit([this._commandEncoder.finish()]);
			this._commandEncoder = null;
		}

		this._currentTexture = null;
	}

	// =========================================================================
	// Resource Creation
	// =========================================================================

	createTexture(descriptor) {
		const device = this._device;
		if (!device) {
			Console.warn("WebGPU: createTexture called before device ready");
			return null;
		}

		// Determine format
		let format = descriptor.format || "rgba8unorm";
		if (typeof format === "string" && _TEXTURE_FORMATS[format]) {
			format = _TEXTURE_FORMATS[format];
		}

		// Determine usage flags
		let usage =
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.RENDER_ATTACHMENT;

		// Check if depth format
		const isDepth = format.includes("depth");
		if (isDepth) {
			usage =
				GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
		}

		const texture = device.createTexture({
			size: {
				width: descriptor.width || 1,
				height: descriptor.height || 1,
				depthOrArrayLayers: 1,
			},
			format,
			usage,
		});

		// Create view
		const view = texture.createView();

		// Upload initial data if provided
		if (descriptor.pdata && !isDepth) {
			device.queue.writeTexture(
				{ texture },
				descriptor.pdata,
				{
					bytesPerRow: descriptor.width * 4,
					rowsPerImage: descriptor.height,
				},
				{
					width: descriptor.width,
					height: descriptor.height,
				},
			);
		}

		// Create sampler
		const sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});

		return {
			_gpuTexture: texture,
			_gpuTextureView: view,
			_gpuSampler: sampler,
			width: descriptor.width || 1,
			height: descriptor.height || 1,
			format,
		};
	}

	createBuffer(data, usage) {
		const device = this._device;
		if (!device) {
			Console.warn("WebGPU: createBuffer called before device ready");
			return null;
		}

		let gpuUsage = GPUBufferUsage.COPY_DST;
		if (usage === "index") {
			gpuUsage |= GPUBufferUsage.INDEX;
		} else if (usage === "vertex") {
			gpuUsage |= GPUBufferUsage.VERTEX;
		} else if (usage === "uniform") {
			gpuUsage |= GPUBufferUsage.UNIFORM;
		} else {
			// Default to vertex
			gpuUsage |= GPUBufferUsage.VERTEX;
		}

		// WebGPU requires buffer size to be multiple of 4 when mappedAtCreation is true
		const alignedSize = Math.ceil(data.byteLength / 4) * 4;

		const buffer = device.createBuffer({
			size: alignedSize,
			usage: gpuUsage,
			mappedAtCreation: true,
		});

		// Copy data
		const mappedRange = buffer.getMappedRange();
		if (data instanceof Float32Array) {
			new Float32Array(mappedRange).set(data);
		} else if (data instanceof Uint16Array) {
			new Uint16Array(mappedRange).set(data);
		} else if (data instanceof Uint32Array) {
			new Uint32Array(mappedRange).set(data);
		} else {
			new Uint8Array(mappedRange).set(new Uint8Array(data.buffer));
		}
		buffer.unmap();

		return {
			_gpuBuffer: buffer,
			usage,
			length: data.length,
			bytesPerElement: data.BYTES_PER_ELEMENT || 4,
			byteLength: data.byteLength,
		};
	}

	deleteBuffer(buffer) {
		if (buffer?._gpuBuffer) {
			buffer._gpuBuffer.destroy();
		}
	}

	// =========================================================================
	// State Management
	// =========================================================================

	setViewport(x, y, width, height) {
		if (this._currentPass) {
			this._currentPass.setViewport(x, y, width, height, 0, 1);
		}
	}

	setDepthRange(_near, _far) {
		// WebGPU handles this via viewport - store for next viewport call
		// For now, this is a no-op since we set 0-1 in setViewport
	}

	setBlendState(enabled, srcFactor = "one", dstFactor = "zero") {
		this._blendState = {
			enabled,
			srcFactor: _BLEND_FACTORS[srcFactor] || srcFactor,
			dstFactor: _BLEND_FACTORS[dstFactor] || dstFactor,
		};
	}

	setDepthState(testEnabled, writeEnabled, func = "lequal") {
		this._depthState = {
			test: testEnabled,
			write: writeEnabled,
			func: _DEPTH_FUNCS[func] || func,
		};
	}

	setCullState(enabled, face = "back") {
		this._cullState = {
			enabled,
			face,
		};
	}

	clear(options) {
		// In WebGPU, clearing happens when beginning a render pass
		// Store clear values for next render pass
		this._clearOptions = options;

		// If we have a current pass, end it first
		if (this._currentPass) {
			this._currentPass.end();
			this._currentPass = null;
		}

		// Begin a new render pass with clear values
		const colorAttachments = [];
		if (options.color && this._currentTexture) {
			colorAttachments.push({
				view: this._currentTexture.createView(),
				clearValue: {
					r: options.color[0],
					g: options.color[1],
					b: options.color[2],
					a: options.color[3] ?? 1.0,
				},
				loadOp: "clear",
				storeOp: "store",
			});
		}

		// For now, just clear to the swap chain
		// G-buffer clearing will be handled in Stage 3
		if (colorAttachments.length > 0 && this._commandEncoder) {
			const pass = this._commandEncoder.beginRenderPass({
				colorAttachments,
			});
			pass.end();
		}
	}

	// =========================================================================
	// Queries
	// =========================================================================

	getCapabilities() {
		return this._capabilities;
	}

	isWebGPU() {
		return true;
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

		// Reconfigure context
		if (this._context && this._device) {
			this._context.configure({
				device: this._device,
				format: this._format,
				alphaMode: "opaque",
			});
		}
	}

	// =========================================================================
	// WebGPU-specific accessors
	// =========================================================================

	/**
	 * Get the WebGPU device
	 * @returns {GPUDevice}
	 */
	getDevice() {
		return this._device;
	}

	/**
	 * Get the preferred canvas format
	 * @returns {string}
	 */
	getFormat() {
		return this._format;
	}

	// =========================================================================
	// Stub methods (to be implemented in later stages)
	// =========================================================================

	createShaderProgram(wgslSource, _fragmentSrcOrNull = null) {
		const device = this._device;

		// Handle both object format {code: "..."} and raw string
		const code = typeof wgslSource === "object" ? wgslSource.code : wgslSource;

		if (!code) {
			Console.error("WebGPU: No shader source provided");
			return null;
		}

		try {
			const shaderModule = device.createShaderModule({
				code,
			});

			// Check for compilation errors asynchronously
			shaderModule.getCompilationInfo().then((info) => {
				for (const message of info.messages) {
					const msg = `[${message.lineNum}:${message.linePos}] ${message.message}`;
					if (message.type === "error") {
						Console.error(`WGSL Error: ${msg}`);
					} else if (message.type === "warning") {
						Console.warn(`WGSL Warning: ${msg}`);
					}
				}
			});

			return {
				_gpuShaderModule: shaderModule,
				_uniformCache: new Map(),
			};
		} catch (error) {
			Console.error(`WebGPU shader creation failed: ${error.message}`);
			return null;
		}
	}

	createVertexState(_descriptor) {
		Console.warn("WebGPU: createVertexState not yet implemented");
		return null;
	}

	bindVertexState(_vertexState) {
		// No-op for now
	}

	deleteVertexState(_vertexState) {
		// No-op for now
	}

	createFramebuffer(_descriptor) {
		Console.warn("WebGPU: createFramebuffer not yet implemented");
		return null;
	}

	deleteFramebuffer(_framebuffer) {
		// No-op for now
	}

	bindFramebuffer(_framebuffer) {
		// No-op for now
	}

	setFramebufferAttachment(_fb, _attachment, _texture, _level = 0, _layer = 0) {
		// No-op for now
	}

	bindTexture(_texture, _unit) {
		// No-op for now - WebGPU uses bind groups
	}

	unbindTexture(_unit) {
		// No-op for now
	}

	bindShader(shader) {
		this._currentShader = shader;
	}

	unbindShader() {
		this._currentShader = null;
	}

	disposeShader(_shader) {
		// No-op for now
	}

	uploadTextureFromImage(texture, source) {
		if (!texture || !this._device) return;

		const device = this._device;
		const width = source.width;
		const height = source.height;

		// If texture doesn't exist or is wrong size, recreate it
		if (
			!texture._gpuTexture ||
			texture.width !== width ||
			texture.height !== height
		) {
			// Destroy old texture if exists
			if (texture._gpuTexture) {
				texture._gpuTexture.destroy();
			}

			// Create new texture with correct size
			const newTexture = device.createTexture({
				size: { width, height, depthOrArrayLayers: 1 },
				format: "rgba8unorm",
				usage:
					GPUTextureUsage.TEXTURE_BINDING |
					GPUTextureUsage.COPY_DST |
					GPUTextureUsage.RENDER_ATTACHMENT,
			});

			texture._gpuTexture = newTexture;
			texture._gpuTextureView = newTexture.createView();
			texture.width = width;
			texture.height = height;
		}

		// Create ImageBitmap and copy
		createImageBitmap(source).then((bitmap) => {
			this._device.queue.copyExternalImageToTexture(
				{ source: bitmap },
				{ texture: texture._gpuTexture },
				{ width, height },
			);
		});
	}

	generateMipmaps(_texture) {
		Console.warn("WebGPU: generateMipmaps not yet implemented");
	}

	setTextureWrapMode(_texture, _mode) {
		// In WebGPU, this is set at sampler creation time
		// Would need to recreate sampler
	}

	disposeTexture(texture) {
		if (texture?._gpuTexture) {
			texture._gpuTexture.destroy();
		}
	}

	setTextureAnisotropy(_texture, _level) {
		// In WebGPU, this is set at sampler creation time
	}

	createUBO(size, bindingPoint) {
		const buffer = this._device.createBuffer({
			size,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		return {
			_gpuBuffer: buffer,
			size,
			bindingPoint,
		};
	}

	updateUBO(ubo, data, offset = 0) {
		if (ubo?._gpuBuffer) {
			this._device.queue.writeBuffer(ubo._gpuBuffer, offset, data);
		}
	}

	bindUniformBuffer(_ubo) {
		// In WebGPU, this is handled through bind groups
	}

	drawIndexed(_indexBuffer, _indexCount, _indexOffset = 0, _mode = null) {
		Console.warn("WebGPU: drawIndexed not yet implemented");
	}

	drawFullscreenQuad() {
		Console.warn("WebGPU: drawFullscreenQuad not yet implemented");
	}

	setUniform(_name, _type, _value) {
		// In WebGPU, uniforms are handled through UBOs
	}
}

export default WebGPUBackend;
