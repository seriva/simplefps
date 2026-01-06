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

// Shader binding metadata (Hardcoded for Stage 2)
// This maps shader labels to their expected bind group layouts
const _SHADER_BINDINGS = {
	geometry: {
		group1: [
			{ binding: 0, type: "ubo", id: 1 }, // MaterialData (UBO binding point 1)
			{ binding: 1, type: "uniform", name: "matWorld" },
		],
		group2: [
			{ binding: 0, type: "sampler", unit: 0 },
			{ binding: 1, type: "texture", unit: 0 }, // Albedo
			{ binding: 2, type: "texture", unit: 1 }, // Emissive
			{ binding: 3, type: "texture", unit: 4 }, // Lightmap
			{ binding: 4, type: "texture", unit: 5 }, // Detail Noise
			{ binding: 5, type: "texture", unit: 2 }, // Reflection (SphereMap)
			{ binding: 6, type: "texture", unit: 3 }, // Reflection Mask
		],
	},
	entityShadows: {
		group1: [
			{ binding: 0, type: "uniform", name: "matWorld" },
			{ binding: 1, type: "uniform", name: "ambient" },
		],
	},
	applyShadows: {
		group1: [
			{ binding: 0, type: "sampler", unit: 2 },
			{ binding: 1, type: "texture", unit: 2 }, // shadowBuffer at unit 2
		],
	},
	directionalLight: {
		group1: [
			{ binding: 0, type: "uniform", name: "directionalLight" },
			{ binding: 2, type: "texture", unit: 1 }, // normalBuffer at unit 1
		],
	},
	pointLight: {
		group1: [
			{ binding: 0, type: "uniform", name: "matWorld" },
			{ binding: 1, type: "uniform", name: "pointLight" },
			{ binding: 3, type: "texture", unit: 0 }, // Position (Unit 0)
			{ binding: 4, type: "texture", unit: 1 }, // Normal (Unit 1)
		],
	},
	spotLight: {
		group1: [
			{ binding: 0, type: "uniform", name: "matWorld" },
			{ binding: 1, type: "uniform", name: "spotLight" },
			{ binding: 3, type: "texture", unit: 0 }, // Position (Unit 0)
			{ binding: 4, type: "texture", unit: 1 }, // Normal (Unit 1)
		],
	},
	kawaseBlur: {
		group1: [
			{ binding: 0, type: "uniform", name: "blurParams" },
			{ binding: 1, type: "sampler", unit: 0 },
			{ binding: 2, type: "texture", unit: 0 },
		],
	},
	postProcessing: {
		group1: [
			{ binding: 0, type: "uniform", name: "postProcessParams" },
			{ binding: 1, type: "sampler", unit: 0 },
			{ binding: 2, type: "texture", unit: 0 }, // colorBuffer
			{ binding: 3, type: "texture", unit: 1 }, // lightBuffer
			{ binding: 4, type: "texture", unit: 2 }, // normalBuffer
			{ binding: 5, type: "texture", unit: 3 }, // emissiveBuffer
			{ binding: 6, type: "texture", unit: 4 }, // dirtBuffer
			{ binding: 7, type: "texture", unit: 5 }, // aoBuffer
		],
	},
	transparent: {
		group1: [
			{ binding: 0, type: "ubo", id: 1 }, // MaterialData (Binding Point 1)
			{ binding: 1, type: "uniform", name: "matWorld" },
			{ binding: 2, type: "ubo", id: 2 }, // LightingData (Binding Point 2)
		],
		group2: [
			{ binding: 0, type: "sampler", unit: 0 }, // colorSampler
			{ binding: 1, type: "texture", unit: 0 }, // colorTexture
			{ binding: 2, type: "texture", unit: 1 }, // emissiveTexture
			{ binding: 3, type: "texture", unit: 2 }, // reflectionTexture
			{ binding: 4, type: "texture", unit: 3 }, // reflectionMaskTexture
		],
	},
	ssao: {
		group1: [
			{ binding: 0, type: "uniform", name: "ssaoParams" },
			{ binding: 1, type: "sampler", unit: 0 },
			{ binding: 2, type: "texture", unit: 1 }, // positionBuffer at unit 1
			{ binding: 3, type: "texture", unit: 0 }, // normalBuffer at unit 0
			{ binding: 4, type: "texture", unit: 2 }, // noiseTexture at unit 2
		],
	},
	debug: {
		group1: [
			{ binding: 0, type: "sampler", unit: 0 },
			{ binding: 1, type: "texture", unit: 0 },
		],
	},
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

		// Pipeline cache
		this._pipelineCache = new Map();

		// Current rendering state
		this._currentVertexState = null;
		this._currentPassFormats = null;
		this._activeFramebuffer = null;
		this._clearColor = { r: 0, g: 0, b: 0, a: 1 };
		this._boundTextures = new Map();
		this._boundUBOs = new Map();
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

			// Create default texture (1x1 white)
			const whiteData = new Uint8Array([255, 255, 255, 255]);
			const defaultTexture = this._device.createTexture({
				size: { width: 1, height: 1, depthOrArrayLayers: 1 },
				format: "rgba8unorm",
				usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
			});
			this._device.queue.writeTexture(
				{ texture: defaultTexture },
				whiteData,
				{ bytesPerRow: 4, rowsPerImage: 1 },
				{ width: 1, height: 1 },
			);
			this._defaultTextureView = defaultTexture.createView();

			// Create default sampler
			this._defaultSampler = this._device.createSampler({
				magFilter: "linear",
				minFilter: "linear",
				mipmapFilter: "linear",
				addressModeU: "repeat",
				addressModeV: "repeat",
			});

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
		// Cache settings
		this._viewport = { x, y, width, height };

		if (this._currentPass) {
			this._currentPass.setViewport(
				x,
				y,
				width,
				height,
				this._depthRange?.min ?? 0.0,
				this._depthRange?.max ?? 1.0,
			);
		}
	}

	setDepthRange(min, max) {
		this._depthRange = { min, max };

		// Update active pass immediately
		if (this._currentPass && this._viewport) {
			this._currentPass.setViewport(
				this._viewport.x,
				this._viewport.y,
				this._viewport.width,
				this._viewport.height,
				min,
				max,
			);
		}
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

	_beginPass(colorLoadOp = "clear", depthLoadOp = "clear") {
		// End any active render pass before starting a new one
		if (this._currentPass) {
			this._currentPass.end();
			this._currentPass = null;
		}

		const encoder = this._commandEncoder; // Use the encoder from beginFrame
		// const loadOp = colorLoadOp; // Alias for consistent usage if needed, but we use specific ops now

		// Ensure we have a texture to render to if rendering to swapchain
		if (!this._activeFramebuffer && !this._currentTexture) {
			this._currentTexture = this._context.getCurrentTexture();
		}

		const fb = this._activeFramebuffer;

		const colorAttachments = [];
		let depthAttachment = null;

		// Determine color attachments
		if (fb) {
			// Render to framebuffer
			for (let i = 0; i < fb.colorAttachments.length; i++) {
				const attachment = fb.colorAttachments[i];
				// handle is { _gpuTexture, _gpuTextureView, ... }
				if (attachment) {
					colorAttachments.push({
						view: attachment._gpuTextureView,
						clearValue: this._clearColor || { r: 0, g: 0, b: 0, a: 1 },
						loadOp: colorLoadOp,
						storeOp: "store",
					});
				}
			}
			if (fb.depthAttachment) {
				depthAttachment = {
					view: fb.depthAttachment._gpuTextureView,
					depthClearValue: 1.0,
					depthLoadOp: depthLoadOp,
					depthStoreOp: "store",
				};
			}

			// Cache formats for pipeline creation
			this._currentPassFormats = {
				targets: fb.colorAttachments
					.map((a) => (a ? a.format : null))
					.filter((f) => f),
				depth: fb.depthAttachment ? fb.depthAttachment.format : null,
			};
		} else {
			// Render to swapchain
			if (!this._currentTexture) {
				this._currentTexture = this._context.getCurrentTexture();
			}

			colorAttachments.push({
				view: this._currentTexture.createView(),
				clearValue: this._clearColor || { r: 0, g: 0, b: 0, a: 1 },
				loadOp: colorLoadOp,
				storeOp: "store",
			});

			this._currentPassFormats = {
				targets: [this._format],
				depth: null,
			};
		}

		const descriptor = {
			colorAttachments,
		};

		if (depthAttachment) {
			descriptor.depthStencilAttachment = depthAttachment;
		}

		this._currentPass = encoder.beginRenderPass(descriptor);

		// Restore viewport if we have one cached
		if (this._viewport) {
			this._currentPass.setViewport(
				this._viewport.x,
				this._viewport.y,
				this._viewport.width,
				this._viewport.height,
				this._depthRange?.min ?? 0.0,
				this._depthRange?.max ?? 1.0,
			);
		}
	}

	clear(options) {
		// End current pass to start a new one with correct loadOps
		if (this._currentPass) {
			this._currentPass.end();
			this._currentPass = null;
		}

		// If options provided, update clear state
		if (options.color) {
			this._clearColor = {
				r: options.color[0],
				g: options.color[1],
				b: options.color[2],
				a: options.color[3] ?? 1.0,
			};
		}

		// Determine load ops based on what we want to clear
		const colorLoadOp = options.color ? "clear" : "load";
		const depthLoadOp = options.depth !== undefined ? "clear" : "load";

		// Begin new pass with specific loadOps
		this._beginPass(colorLoadOp, depthLoadOp);
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
			// Derive label from code logic or pass it?
			// Since args were (wgslSource), if wgslSource is object it might have label?
			// WgslShaderSources keys?
			// For now, we rely on the object passed being `{ code: ... }` but we want to know WHICH shader it is.
			// renderbackend calls createShaderProgram(source).
			// shaders.js calls createShaderProgram(WgslShaderSources.geometry).
			// We can attach name to WgslShaderSources?
			const label =
				typeof wgslSource === "object"
					? wgslSource.label || "unknown"
					: "unknown";

			const shaderModule = device.createShaderModule({
				label,
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

	createVertexState(descriptor) {
		const buffers = [];
		const layout = [];

		// We use one buffer slot per attribute (Structure of Arrays approach used in Mesh.js)
		for (let i = 0; i < descriptor.attributes.length; i++) {
			const attr = descriptor.attributes[i];
			const buffer = attr.buffer;

			// Add to list of buffers to bind at draw time
			buffers.push(buffer);

			// Determine format
			let format = "float32";
			if (attr.size === 2) format = "float32x2";
			if (attr.size === 3) format = "float32x3";
			if (attr.size === 4) format = "float32x4";

			// Create layout entry for this buffer slot
			layout.push({
				arrayStride: attr.size * 4, // 4 bytes per float
				stepMode: "vertex",
				attributes: [
					{
						shaderLocation: attr.slot,
						offset: 0,
						format: format,
					},
				],
			});
		}

		return {
			buffers, // The GPUBuffer objects associated with this state
			layout, // The layout description for pipeline creation
		};
	}

	bindVertexState(vertexState) {
		this._currentVertexState = vertexState;
	}

	deleteVertexState(_vertexState) {
		// No-op for now
	}

	createFramebuffer(descriptor) {
		// Store descriptor to know attachments and formats later
		return {
			colorAttachments: descriptor.colorAttachments || [],
			depthAttachment: descriptor.depthAttachment || null,
		};
	}

	deleteFramebuffer(_framebuffer) {
		// JS GC handles this mostly, unless we need to destroy specific resources
	}

	bindFramebuffer(framebuffer) {
		// If binding a new framebuffer, end current pass
		if (this._currentPass) {
			this._currentPass.end();
			this._currentPass = null;
		}
		this._activeFramebuffer = framebuffer;
	}

	setFramebufferAttachment(fb, attachment, texture, _level = 0, _layer = 0) {
		if (!fb) return;
		if (attachment === "depth") {
			fb.depthAttachment = texture;
		} else {
			const index = Number(attachment);
			if (!Number.isNaN(index)) {
				// Ensure array size
				if (!fb.colorAttachments) fb.colorAttachments = [];
				while (fb.colorAttachments.length <= index) {
					fb.colorAttachments.push(null);
				}
				fb.colorAttachments[index] = texture;
			}
		}
	}

	async uploadTextureFromImage(texture, source) {
		if (!texture || !this._device) return;

		const device = this._device;
		const width = source.width;
		const height = source.height;

		const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;

		// If texture doesn't exist or is wrong size, recreate it
		if (
			!texture._gpuTexture ||
			texture.width !== width ||
			texture.height !== height ||
			texture.mipLevelCount !== mipLevelCount
		) {
			// Destroy old texture if exists
			if (texture._gpuTexture) {
				texture._gpuTexture.destroy();
			}

			// Create new texture with correct size
			const newTexture = device.createTexture({
				size: { width, height, depthOrArrayLayers: 1 },
				mipLevelCount,
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
			texture.mipLevelCount = mipLevelCount;
		}

		// Create ImageBitmap and copy synchronously (await)
		const bitmap = await createImageBitmap(source);
		this._device.queue.copyExternalImageToTexture(
			{ source: bitmap },
			{ texture: texture._gpuTexture },
			{ width, height },
		);
	}

	generateMipmaps(texture) {
		if (
			!texture._gpuTexture ||
			!texture.mipLevelCount ||
			texture.mipLevelCount <= 1
		) {
			return;
		}

		const pipeline = this._getMipmapPipeline(texture.format || "rgba8unorm");

		// We need a command encoder. If one exists for the frame (beginFrame), use it?
		// Usually generateMipmaps is called during load, outside frame.
		let encoder = this._commandEncoder;
		let submitImmediate = false;

		if (!encoder) {
			encoder = this._device.createCommandEncoder();
			submitImmediate = true;
		}

		let srcView = texture._gpuTexture.createView({
			baseMipLevel: 0,
			mipLevelCount: 1,
		});

		for (let i = 1; i < texture.mipLevelCount; i++) {
			const dstView = texture._gpuTexture.createView({
				baseMipLevel: i,
				mipLevelCount: 1,
			});

			const passEncoder = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: dstView,
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});

			passEncoder.setPipeline(pipeline);
			passEncoder.setBindGroup(
				0,
				this._device.createBindGroup({
					layout: pipeline.getBindGroupLayout(0),
					entries: [
						{ binding: 0, resource: this._defaultSampler },
						{ binding: 1, resource: srcView },
					],
				}),
			);
			passEncoder.draw(4);
			passEncoder.end();

			srcView = dstView;
		}

		if (submitImmediate) {
			this._device.queue.submit([encoder.finish()]);
		}
	}

	_getMipmapPipeline(format) {
		if (!this._mipmapPipelines) {
			this._mipmapPipelines = new Map();
		}

		if (this._mipmapPipelines.has(format)) {
			return this._mipmapPipelines.get(format);
		}

		const module = this._device.createShaderModule({
			label: "mipmap-blit",
			code: /* wgsl */ `
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
			`,
		});

		const pipeline = this._device.createRenderPipeline({
			label: `mipmap-pipeline-${format}`,
			layout: "auto",
			vertex: {
				module,
				entryPoint: "vs_main",
			},
			fragment: {
				module,
				entryPoint: "fs_main",
				targets: [{ format }],
			},
			primitive: {
				topology: "triangle-strip",
				stripIndexFormat: undefined,
			},
		});

		this._mipmapPipelines.set(format, pipeline);
		return pipeline;
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

	bindTexture(texture, unit) {
		if (!this._boundTextures) this._boundTextures = new Map();
		this._boundTextures.set(unit, texture);
	}

	unbindTexture(unit) {
		if (this._boundTextures) {
			this._boundTextures.delete(unit);
		}
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

	createUBO(size, bindingPoint) {
		// Create buffer with exact size
		// Note: size should be aligned to 16 bytes for UBOs usually
		const alignedSize = Math.ceil(size / 16) * 16;

		const buffer = this._device.createBuffer({
			size: alignedSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		return {
			_gpuBuffer: buffer,
			size: alignedSize,
			bindingPoint,
		};
	}

	updateUBO(ubo, data, offset = 0) {
		if (ubo?._gpuBuffer) {
			// Check if data needs padding/sizing?
			// writeBuffer handles TypedArrays nicely
			this._device.queue.writeBuffer(ubo._gpuBuffer, offset, data);
		}
	}

	bindUniformBuffer(ubo) {
		if (!this._boundUBOs) this._boundUBOs = new Map();

		if (ubo) {
			this._boundUBOs.set(ubo.bindingPoint, ubo);
		}
	}

	_getPipelineKey(
		vertexState,
		shader,
		primitive,
		depthState,
		blendState,
		cullState,
		formats,
	) {
		// Create a unique key for the pipeline configuration
		return JSON.stringify({
			layout: vertexState.layout, // Buffer layout
			shader: shader._gpuShaderModule.label || "shader", // Just ID
			topology: primitive.topology,
			cullMode: cullState.enabled ? cullState.face : "none",
			depth: depthState,
			blend: blendState,
			formats: formats,
		});
	}

	drawIndexed(indexBuffer, indexCount, indexOffset = 0, _mode = null) {
		if (!this._device || !this._currentVertexState || !this._currentShader)
			return;

		// 1. Ensure active render pass
		if (!this._currentPass) {
			this._beginPass("load", "load");
		}

		const pass = this._currentPass;

		// 2. Get or create pipeline
		const primitive = {
			topology: "triangle-list", // WebGL BACKEND uses TRIANGLES usually.
			// If 'mode' arg passed, map it? (gl.TRIANGLES etc).
			// RenderBackend abstraction implies TRIANGLES default.
			cullMode: this._cullState.enabled ? this._cullState.face : "none",
			frontFace: "ccw", // standard
		};

		const key = this._getPipelineKey(
			this._currentVertexState,
			this._currentShader,
			primitive,
			this._depthState,
			this._blendState,
			this._cullState,
			this._currentPassFormats,
		);

		let pipeline = this._pipelineCache.get(key);

		if (!pipeline) {
			const descriptor = {
				layout: "auto",
				vertex: {
					module: this._currentShader._gpuShaderModule,
					entryPoint: "vs_main",
					buffers: this._currentVertexState.layout,
				},
				fragment: {
					module: this._currentShader._gpuShaderModule,
					entryPoint: "fs_main",
					targets: this._currentPassFormats.targets.map((format) => ({
						format,
						blend: this._blendState.enabled
							? {
									color: {
										srcFactor: this._blendState.srcFactor,
										dstFactor: this._blendState.dstFactor,
										operation: "add",
									},
									alpha: {
										srcFactor: this._blendState.srcFactor,
										dstFactor: this._blendState.dstFactor,
										operation: "add",
									},
								}
							: undefined,
						writeMask: GPUColorWrite.ALL,
					})),
				},
				primitive,
			};

			if (this._currentPassFormats.depth) {
				descriptor.depthStencil = {
					format: this._currentPassFormats.depth,
					depthWriteEnabled: this._depthState.write,
					depthCompare: this._depthState.test
						? this._depthState.func
						: "always",
				};
			}

			try {
				pipeline = this._device.createRenderPipeline(descriptor);
				this._pipelineCache.set(key, pipeline);
			} catch (e) {
				Console.error(`Failed to create pipeline: ${e.message}`);
				return;
			}
		}

		pass.setPipeline(pipeline);

		// 3. Bind Vertex Buffers
		const buffers = this._currentVertexState.buffers;
		for (let i = 0; i < buffers.length; i++) {
			if (buffers[i]?._gpuBuffer) {
				pass.setVertexBuffer(i, buffers[i]._gpuBuffer);
			}
		}

		// 4. Bind Index Buffer
		if (indexBuffer?._gpuBuffer) {
			pass.setIndexBuffer(indexBuffer._gpuBuffer, "uint16"); // Assuming uint16 for now from Mesh.js
		}

		// 5. Bind Groups
		// Group 0: FrameData (always expected if shader uses it)
		if (this._boundUBOs.has(0)) {
			// Use cached BindGroup if possible? For now create new.
			try {
				pass.setBindGroup(
					0,
					this._device.createBindGroup({
						layout: pipeline.getBindGroupLayout(0),
						entries: [
							{
								binding: 0,
								resource: { buffer: this._boundUBOs.get(0)._gpuBuffer },
							},
						],
					}),
				);
			} catch (_e) {
				/* Ignore if shader doesn't use group 0 */
			}
		}

		// Shader-specific groups
		const shaderName = this._currentShader._gpuShaderModule.label;
		const bindings = _SHADER_BINDINGS[shaderName];

		if (bindings) {
			// Group 1
			if (bindings.group1) {
				const entries = [];
				for (const b of bindings.group1) {
					if (b.type === "ubo") {
						const ubo = this._boundUBOs.get(b.id);
						if (ubo)
							entries.push({
								binding: b.binding,
								resource: { buffer: ubo._gpuBuffer },
							});
					} else if (b.type === "uniform") {
						// Create temp buffer for uniforms
						let val = this._uniforms?.get(b.name);

						// If no direct value, try to pack struct provided by renderer scalars
						if (!val && this._packStruct) {
							val = this._packStruct(b.name);
						}

						if (val !== undefined && val !== null) {
							// If primitive, wrap in array
							let bufferVal = val;
							if (typeof val === "number") {
								bufferVal = new Float32Array([val]);
							} else if (typeof val === "boolean") {
								bufferVal = new Uint32Array([val ? 1 : 0]);
							} else if (Array.isArray(val)) {
								bufferVal = new Float32Array(val);
							}

							// Align size to 16 bytes for Uniform usage requirement usually preferred
							const size = Math.ceil(bufferVal.byteLength / 16) * 16;
							const buf = this._device.createBuffer({
								size,
								usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
								mappedAtCreation: true,
							});

							// Copy data to mapped range (zero padding if size > bufferVal.byteLength)
							if (bufferVal instanceof Float32Array) {
								new Float32Array(buf.getMappedRange()).set(bufferVal);
							} else {
								new Uint8Array(buf.getMappedRange()).set(
									new Uint8Array(
										bufferVal.buffer,
										bufferVal.byteOffset,
										bufferVal.byteLength,
									),
								);
							}

							buf.unmap();
							entries.push({ binding: b.binding, resource: { buffer: buf } });
						}
					} else if (b.type === "sampler") {
						const tex = this._boundTextures.get(b.unit);
						const resource = tex ? tex._gpuSampler : this._defaultSampler;
						entries.push({ binding: b.binding, resource });
					} else if (b.type === "texture") {
						const tex = this._boundTextures.get(b.unit);
						const resource = tex
							? tex._gpuTextureView
							: this._defaultTextureView;
						entries.push({ binding: b.binding, resource });
					}
				}
				if (entries.length > 0) {
					try {
						pass.setBindGroup(
							1,
							this._device.createBindGroup({
								layout: pipeline.getBindGroupLayout(1),
								entries,
							}),
						);
					} catch (e) {
						Console.warn(`BindGroup 1 error: ${e.message}`);
					}
				}
			}

			// Group 2
			if (bindings.group2) {
				const entries = [];
				for (const b of bindings.group2) {
					const tex = this._boundTextures.get(b.unit);
					if (tex) {
						if (b.type === "sampler") {
							entries.push({ binding: b.binding, resource: tex._gpuSampler });
						} else if (b.type === "texture") {
							entries.push({
								binding: b.binding,
								resource: tex._gpuTextureView,
							});
						}
					} else {
						// Fallback to defaults
						if (b.type === "sampler") {
							entries.push({
								binding: b.binding,
								resource: this._defaultSampler,
							});
						} else if (b.type === "texture") {
							entries.push({
								binding: b.binding,
								resource: this._defaultTextureView,
							});
						}
					}
				}
				if (entries.length > 0) {
					try {
						pass.setBindGroup(
							2,
							this._device.createBindGroup({
								layout: pipeline.getBindGroupLayout(2),
								entries,
							}),
						);
					} catch (e) {
						Console.warn(`BindGroup 2 error: ${e.message}`);
					}
				}
			}
		}

		pass.drawIndexed(indexCount, 1, indexOffset, 0, 0);
	}

	_packStruct(name) {
		if (!this._uniforms) return null;

		if (name === "pointLight") {
			// 32 bytes = 8 floats
			const arr = new Float32Array(8);
			const pos = this._uniforms.get("pointLight.position"); // vec3
			const size = this._uniforms.get("pointLight.size"); // f32
			const col = this._uniforms.get("pointLight.color"); // vec3
			const intensity = this._uniforms.get("pointLight.intensity"); // f32

			if (pos) arr.set(pos, 0); // 0,1,2
			if (size !== undefined) arr[3] = size;
			if (col) arr.set(col, 4); // 4,5,6
			if (intensity !== undefined) arr[7] = intensity;
			return arr;
		} else if (name === "directionalLight") {
			// 32 bytes = 8 floats
			const arr = new Float32Array(8);
			const dir = this._uniforms.get("directionalLight.direction");
			const col = this._uniforms.get("directionalLight.color");

			if (dir) arr.set(dir, 0);
			if (col) arr.set(col, 4);
			return arr;
		} else if (name === "spotLight") {
			// 48 bytes = 12 floats
			const arr = new Float32Array(12);
			// pos(0), cutoff(3), dir(4), range(7), col(8), intensity(11)
			const pos = this._uniforms.get("spotLight.position");
			const cutoff = this._uniforms.get("spotLight.cutoff");
			const dir = this._uniforms.get("spotLight.direction");
			const range = this._uniforms.get("spotLight.range");
			const col = this._uniforms.get("spotLight.color");
			const intensity = this._uniforms.get("spotLight.intensity");

			if (pos) arr.set(pos, 0);
			if (cutoff !== undefined) arr[3] = cutoff;
			if (dir) arr.set(dir, 4);
			if (range !== undefined) arr[7] = range;
			if (col) arr.set(col, 8);
			if (intensity !== undefined) arr[11] = intensity;
			return arr;
		} else if (name === "postProcessParams") {
			// Renamed from params
			// PostProcess
			// 64 bytes = 16 floats
			const arr = new Float32Array(16);
			// gamma(0), emissiveMult(1), ssaoStrength(2), dirtIntensity(3)
			const gamma = this._uniforms.get("gamma");
			const emissiveMult = this._uniforms.get("emissiveMult");
			const ssaoStrength = this._uniforms.get("ssaoStrength");
			const dirtIntensity = this._uniforms.get("dirtIntensity");
			const doFXAA = this._uniforms.get("doFXAA");
			const ambient =
				this._uniforms.get("ambient") ?? this._uniforms.get("params.ambient");

			if (gamma !== undefined) arr[0] = gamma;
			if (emissiveMult !== undefined) arr[1] = emissiveMult;
			if (ssaoStrength !== undefined) arr[2] = ssaoStrength;
			if (dirtIntensity !== undefined) arr[3] = dirtIntensity;
			if (doFXAA !== undefined) arr[4] = doFXAA;
			if (ambient) arr.set(ambient, 12);

			return arr;
		} else if (name === "ssaoParams") {
			// SSAOParams: radius(f32), bias(f32), noiseScale(vec2), kernel(array<vec4,16>)
			// Size: 8 + 8 + 256 = 272 bytes?
			// Layout:
			// 0: radius, 4: bias, 8: noiseScale (vec2), 16: kernel array (aligned 16)
			// Total size = 16 + 256 = 272 bytes.
			const arr = new Float32Array(4 + 16 * 4); // 4 + 64 floats = 68 floats = 272 bytes

			const radius = this._uniforms.get("radius");
			const bias = this._uniforms.get("bias");
			const noiseScale = this._uniforms.get("noiseScale");
			const kernel = this._uniforms.get("kernel"); // Float32Array(48) (16*3)? Or Float32Array(64) (16*4)?

			if (radius !== undefined) arr[0] = radius;
			if (bias !== undefined) arr[1] = bias;
			if (noiseScale) arr.set(noiseScale, 2); // vec2 at index 2 (offset 8)

			// Kernel (index 4 = offset 16).
			// If kernel is vec3 array (flat), we must expand to vec4.
			if (kernel) {
				for (let i = 0; i < 16; i++) {
					if (i * 3 + 2 < kernel.length) {
						arr[4 + i * 4] = kernel[i * 3];
						arr[4 + i * 4 + 1] = kernel[i * 3 + 1];
						arr[4 + i * 4 + 2] = kernel[i * 3 + 2];
						arr[4 + i * 4 + 3] = 0.0; // pad
					}
				}
			}
			return arr;
		} else if (name === "shadowParams") {
			// ShadowParams: lightVP(mat4), ambient(vec3), _pad, bias(f32)
			// lightVP: 64 bytes.
			// ambient: offset 64. (vec3).
			// bias: offset 80? (align 16 for vec3 pad? no, bias is f32).
			// Struct: lightVP, ambient, _pad(f32), bias(f32). ??
			// entityShadowsShader: lightVP, ambient, _pad, bias, _pad2.

			const arr = new Float32Array(24); // 96 bytes implies ~24 floats.
			const lightVP = this._uniforms.get("lightVP");
			const ambient = this._uniforms.get("ambient");
			const bias = this._uniforms.get("bias");

			if (lightVP) arr.set(lightVP, 0); // 0..15
			if (ambient) arr.set(ambient, 16); // 16..18
			// bias at? offset 80? index 20?
			// 16 floats = 64 bytes.
			// ambient at 64. (index 16).
			// bias at 76? (index 19?).
			// Check alignment.
			// vec3 ambient (12 bytes). 64+12 = 76.
			// Next f32 (bias)?
			// Wait, struct: ambient(vec3), _pad(f32), bias(f32).
			// ambient: 64. _pad: 76. bias: 80.
			// index 16, 17, 18 used. 19 is _pad. 20 is bias.
			if (bias !== undefined) arr[20] = bias;

			return arr;
		} else if (name === "blurParams") {
			// offset: f32 (0). _pad: vec3 (4..16)? NO.
			// vec3 alignment is 16.
			// offset (0-4). Pad (4-16).
			// _pad (vec3) at 16 (16-28).
			// Struct size aligned to 16 -> 32 bytes.
			const arr = new Float32Array(8); // 32 bytes
			const offset = this._uniforms.get("offset");

			if (offset !== undefined) arr[0] = offset;
			return arr;
		} else if (name === "ambient") {
			// Shadow shader "ambient" vec3
			// entityShadowsShader: var<uniform> ambient: vec3<f32>;
			// Wait, struct? No, var<uniform> ambient: vec3<f32>.
			// This is NOT a struct. It's a raw vec3.
			// Renderer calls setVec3("ambient").
			// drawIndexed will find "ambient" in _uniforms (Float32Array).
			// So "val" will be found. No pack needed.
			return null;
		}
		return null;
	}

	setUniform(name, _type, value) {
		if (!this._uniforms) this._uniforms = new Map();
		this._uniforms.set(name, value);
	}
}

export default WebGPUBackend;
