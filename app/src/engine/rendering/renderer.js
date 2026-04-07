import { Scene } from "../scene/scene.js";
import { Camera } from "../systems/camera.js";
import { Resources } from "../systems/resources.js";
import { Settings } from "../systems/settings.js";
import { Backend } from "./backend.js";
import { RenderPasses } from "./renderpasses.js";
import { Shaders } from "./shaders.js";
import { Shapes } from "./shapes.js";
import { Texture } from "./texture.js";

// Private state - buffers
let _depth = null;

const _BlurSourceType = Object.freeze({
	SHADOW: 0,
	LIGHTING: 1,
	EMISSIVE: 2,
});

const _g = {
	framebuffer: null,
	position: null,
	normal: null,
	color: null,
	emissive: null,
};

const _s = {
	framebuffer: null,
	shadow: null,
	width: 0,
	height: 0,
};

const _l = {
	framebuffer: null,
	light: null,
};

const _scratch = {
	framebuffer: null,
	color: null,
};

let _blurSource = null;

const _fsr = {
	framebuffer: null,
	easu: null,
};

let _proceduralNoise = null;

// Pre-allocated scratch arrays to avoid per-frame allocations in render passes
const _fsrCon0 = [0, 0, 0, 0];

// Dispose old resources to prevent memory leaks on resize
const _disposeResources = () => {
	if (_depth) _depth.dispose();
	if (_g.framebuffer) {
		Backend.deleteFramebuffer(_g.framebuffer);
		if (_g.normal) _g.normal.dispose();
		if (_g.color) _g.color.dispose();
		if (_g.emissive) _g.emissive.dispose();
	}
	if (_s.framebuffer) {
		Backend.deleteFramebuffer(_s.framebuffer);
		if (_s.shadow) _s.shadow.dispose();
	}
	if (_l.framebuffer) {
		Backend.deleteFramebuffer(_l.framebuffer);
		if (_l.light) _l.light.dispose();
	}
	if (_scratch.framebuffer) {
		Backend.deleteFramebuffer(_scratch.framebuffer);
		if (_scratch.color) _scratch.color.dispose();
	}
	if (_fsr.framebuffer) {
		Backend.deleteFramebuffer(_fsr.framebuffer);
		if (_fsr.easu) _fsr.easu.dispose();
	}
};

// Private functions
// _checkFramebufferStatus removed - Backend handles validation during creation

const _createFB = (textureConfig, attachmentConfig) => {
	const texture = new Texture(textureConfig);
	let fb = null;
	if (attachmentConfig) {
		fb = Backend.createFramebuffer({
			...attachmentConfig,
			colorAttachments: [
				texture.getHandle(),
				...(attachmentConfig.colorAttachments || []),
			],
		});
	}
	return { texture, fb };
};

const _resize = (width, height) => {
	// Dispose old resources first to prevent memory leaks
	_disposeResources();

	// **********************************
	// depth buffer
	// **********************************
	_depth = new Texture({
		format: "depth24",
		width,
		height,
	});

	// **********************************
	// geometry buffer
	// **********************************
	_g.width = width;
	_g.height = height;

	// Normal buffer: RG = oct-encoded normal, B = world geometry flag (1=world, 0=skybox)
	_g.normal = new Texture({ format: "rgba8", width, height });
	_g.color = new Texture({ format: "rgba8", width, height });
	_g.emissive = new Texture({ format: "rgba8", width, height });

	_g.framebuffer = Backend.createFramebuffer({
		colorAttachments: [
			_g.normal.getHandle(),
			_g.color.getHandle(),
			_g.emissive.getHandle(),
		],
		depthAttachment: _depth.getHandle(),
	});

	// **********************************
	// shadow buffer
	// **********************************
	const shadowRes = _createFB(
		{ format: "r8", width, height },
		{ depthAttachment: _depth.getHandle() },
	);
	_s.shadow = shadowRes.texture;
	_s.framebuffer = shadowRes.fb;
	_s.width = width;
	_s.height = height;

	// **********************************
	// lighting buffer
	// **********************************
	const lightRes = _createFB({ format: "rgba8", width, height }, {});
	_l.light = lightRes.texture;
	_l.framebuffer = lightRes.fb;

	// **********************************
	// scratch buffer
	// **********************************
	const scratchRes = _createFB({ format: "rgba8", width, height }, {});
	_scratch.color = scratchRes.texture;
	_scratch.framebuffer = scratchRes.fb;
	if (!_proceduralNoise) {
		_generateProceduralNoise();
	}

	// **********************************
	// post-processing & FSR buffers
	// **********************************
	if (Settings.doFSR) {
		const nativeWidth = Backend.getNativeWidth();
		const nativeHeight = Backend.getNativeHeight();

		const fsrRes = _createFB(
			{ format: "rgba8", width: nativeWidth, height: nativeHeight },
			{},
		);
		_fsr.easu = fsrRes.texture;
		_fsr.framebuffer = fsrRes.fb;
	} else {
		_fsr.easu = null;
		_fsr.framebuffer = null;
	}
};

const _startBlurPass = (blurSource) => {
	switch (blurSource) {
		case _BlurSourceType.SHADOW:
			_blurSource = _s.shadow;
			break;
		case _BlurSourceType.LIGHTING:
			_blurSource = _l.light;
			break;
		case _BlurSourceType.EMISSIVE:
			_blurSource = _g.emissive;
			break;
		default:
	}
	Backend.bindFramebuffer(_scratch.framebuffer);
	Backend.setViewport(0, 0, _g.width, _g.height);
};

const _endBlurPass = () => {
	Texture.unBind(0);
	// Restore default attachment
	Backend.setFramebufferAttachment(
		_scratch.framebuffer,
		0,
		_scratch.color.getHandle(),
	);
	Backend.bindFramebuffer(null);
};

const _swapBlur = (i) => {
	if (i % 2 === 0) {
		Backend.setFramebufferAttachment(
			_scratch.framebuffer,
			0,
			_scratch.color.getHandle(),
		);
		// Re-bind (as setFramebufferAttachment unbinds)
		Backend.bindFramebuffer(_scratch.framebuffer);
		_blurSource.bind(0);
	} else {
		Backend.setFramebufferAttachment(
			_scratch.framebuffer,
			0,
			_blurSource.getHandle(),
		);
		// Re-bind
		Backend.bindFramebuffer(_scratch.framebuffer);
		_scratch.color.bind(0);
	}
	Backend.clear({ color: [0, 0, 0, 0] });
};
const _blurImage = (source, iterations, radius) => {
	if (iterations <= 0) return;
	Shaders.kawaseBlur.bind();
	Shaders.kawaseBlur.setInt("colorBuffer", 0);
	_startBlurPass(source);
	for (let i = 0; i < iterations; i++) {
		_swapBlur(i);
		// Kawase blur uses progressive offsets: each iteration increases spread
		Shaders.kawaseBlur.setFloat("offset", (i + 1) * radius);
		Shapes.screenQuad.renderSingle();
	}
	_endBlurPass();
	Backend.unbindShader();
};

const _generateProceduralNoise = () => {
	const size = 128;
	const data = new Uint8Array(size * size * 4);
	const heightMap = new Float32Array(size * size);

	// Periodic Gradient Noise (Perlin)
	const perm = new Uint8Array(512);
	const p = [
		151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
		36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120,
		234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
		88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71,
		134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133,
		230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161,
		1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130,
		116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250,
		124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227,
		47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
		154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98,
		108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34,
		242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14,
		239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121,
		50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243,
		141, 128, 195, 78, 66, 215, 61, 156, 180,
	];
	for (let i = 0; i < 256; i++) perm[i] = perm[256 + i] = p[i];

	const grad = (hash, x, y) => {
		const h = hash & 15;
		const u = h < 8 ? x : y,
			v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
		return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
	};

	const periodNoise = (x, y, period) => {
		let X = Math.floor(x),
			Y = Math.floor(y);
		const fx = x - X,
			fy = y - Y;
		X = X % period;
		Y = Y % period;
		// Fade curves
		const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
		const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
		// Hashing
		const A = perm[X] + Y,
			AA = perm[A % 255],
			AB = perm[(A + 1) % 255];
		const B = perm[(X + 1) % 255] + Y,
			BA = perm[B % 255],
			BB = perm[(B + 1) % 255];
		// Lerp
		const lerp = (t, a, b) => a + t * (b - a);
		return lerp(
			v,
			lerp(u, grad(perm[AA], fx, fy), grad(perm[BA], fx - 1, fy)),
			lerp(u, grad(perm[AB], fx, fy - 1), grad(perm[BB], fx - 1, fy - 1)),
		);
	};

	// Simple hash for "Grit" (White Noise)
	const hashFunc = (x, y) => {
		const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
		return n - Math.floor(n);
	};

	for (let i = 0; i < size * size; i++) {
		const x = i % size,
			y = Math.floor(i / size);
		let h = 0,
			amp = 0.5,
			freq = 4.0;
		for (let k = 0; k < 4; k++) {
			h += periodNoise((x / size) * freq, (y / size) * freq, freq) * amp;
			amp *= 0.5;
			freq *= 2.0;
		}
		// Contrast & grit
		h = (h * 0.5 + 0.5) ** 2.0 * (3.0 - 2.0 * (h * 0.5 + 0.5));
		heightMap[i] = (h * 0.8 + hashFunc(x, y) * 0.2) ** 1.5;
	}

	// 2. Compute Normal Map from Height Map
	for (let i = 0; i < size * size; i++) {
		const x = i % size;
		const y = Math.floor(i / size);

		// Sample neighbors (wrapping)
		const l = heightMap[((x - 1 + size) % size) + y * size];
		const r = heightMap[((x + 1) % size) + y * size];
		const u = heightMap[x + ((y - 1 + size) % size) * size];
		const d = heightMap[x + ((y + 1) % size) * size];

		// Compute gradients (Sobel filter approximation)
		const dx = (r - l) * 2.0; // strength factor
		const dy = (d - u) * 2.0;

		// Compute normal
		const nz = 1.0;
		const len = Math.sqrt(dx * dx + dy * dy + nz * nz);

		// Pack Normal into RGB [0, 255]
		data[i * 4] = ((dx / len) * 0.5 + 0.5) * 255; // R: Normal X
		data[i * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255; // G: Normal Y
		data[i * 4 + 2] = ((nz / len) * 0.5 + 0.5) * 255; // B: Normal Z

		// Pack Height into Alpha [0, 255]
		data[i * 4 + 3] = heightMap[i] * 255;
	}

	_proceduralNoise = new Texture({
		format: "rgba8",
		width: size,
		height: size,
		pdata: data,
		pformat: "rgba",
		ptype: "ubyte",
	});

	_proceduralNoise.setTextureWrapMode("repeat");
	Backend.generateMipmaps(_proceduralNoise.getHandle());

	if (Settings.anisotropicFiltering > 1) {
		Backend.setTextureAnisotropy(
			_proceduralNoise.getHandle(),
			Settings.anisotropicFiltering,
		);
	}
};

const _startGeomPass = (clearDepthOnly = false) => {
	Backend.bindFramebuffer(_g.framebuffer);
	Backend.setViewport(0, 0, _g.width, _g.height);
	const ambient = Scene.getAmbient();
	const color = [ambient[0], ambient[1], ambient[2], 1.0];
	if (clearDepthOnly) {
		Backend.clear({ depth: 1.0 });
	} else {
		Backend.clear({ color, depth: 1.0 });
	}
};

const _endGeomPass = () => {
	Backend.bindFramebuffer(null);
};

const _worldGeomPass = () => {
	Backend.setDepthRange(0.1, 1.0);
	_startGeomPass();

	if (_proceduralNoise) _proceduralNoise.bind(5); // Bind noise to unit 5
	RenderPasses.renderWorldGeometry();

	_endGeomPass();
	Backend.setDepthRange(0.0, 1.0);
};

const _fpsGeomPass = () => {
	// Don't clear depth, just use a closer depth range so it draws on top
	Backend.setDepthRange(0.0, 0.1);
	Backend.bindFramebuffer(_g.framebuffer);
	Backend.setViewport(0, 0, _g.width, _g.height);

	if (_proceduralNoise) _proceduralNoise.bind(5); // Bind noise to unit 5
	RenderPasses.renderFPSGeometry();

	Backend.bindFramebuffer(null);
	Backend.setDepthRange(0.0, 1.0);
};

const _shadowPass = () => {
	if (!_s.framebuffer) return;

	// Match the depth range of the world geometry pass so depth comparisons are valid
	Backend.setDepthRange(0.1, 1.0);
	Backend.bindFramebuffer(_s.framebuffer);
	Backend.setViewport(0, 0, _s.width, _s.height);
	Backend.clear({ color: [1.0, 1.0, 1.0, 1.0] });
	// Ensure shadows always write to color target even if prior passes changed state.
	Backend.setColorMask(true, true, true, true);
	Backend.setBlendState(false);
	Backend.setDepthState(true, false, "lequal");
	Backend.setPolygonOffset(true, -1.0, -1.0);
	Backend.setCullState(false);

	RenderPasses.renderShadows();

	// Restore default state
	Backend.setCullState(true);
	Backend.setPolygonOffset(false);
	Backend.setDepthState(true, true);
	Backend.bindFramebuffer(null);
	Backend.setDepthRange(0.0, 1.0);
};

const _lightingPass = () => {
	// Explicitly detach depth buffer to allow reading it as a texture
	Backend.setFramebufferAttachment(_l.framebuffer, "depth", null);
	Backend.bindFramebuffer(_l.framebuffer);
	Backend.setViewport(0, 0, _g.width, _g.height);

	const ambient = Scene.getAmbient();

	Backend.clear({
		color: [ambient[0], ambient[1], ambient[2], 1.0],
	});
	_depth.bind(0);
	_g.normal.bind(1);
	_s.shadow.bind(2);
	_g.color.bind(3);

	Backend.setCullState(true);
	Backend.setDepthState(false, false);
	Backend.setBlendState(true, "one", "one");

	RenderPasses.renderLighting();

	Backend.setBlendState(false);
	Backend.setDepthState(true, true);
	Backend.setCullState(true);

	Texture.unBindRange(0, 4);
	Backend.bindFramebuffer(null);

	_blurImage(_BlurSourceType.LIGHTING, Settings.lightBlurIterations, 0.2);
};

const _emissiveBlurPass = () => {
	_blurImage(
		_BlurSourceType.EMISSIVE,
		Settings.emissiveIteration,
		Settings.emissiveOffset,
	);
};

const _shadowBlurPass = () => {
	// WebGPU shadow blur currently over-smooths/overwrites the shadow target in some drivers.
	// Keep raw shadow map there until a backend-specific blur path lands.
	if (Backend.isWebGPU()) return;

	_blurImage(
		_BlurSourceType.SHADOW,
		Settings.shadowBlurIterations,
		Settings.shadowBlurOffset,
	);
};

const _transparentPass = () => {
	// Re-attach depth buffer for correct depth testing
	Backend.setFramebufferAttachment(_l.framebuffer, "depth", _depth.getHandle());
	Backend.bindFramebuffer(_l.framebuffer);
	Backend.setViewport(0, 0, _g.width, _g.height);

	// Match the depth range of the world geometry pass so depth comparisons are valid
	Backend.setDepthRange(0.1, 1.0);

	// Glass pass uses the existing depth buffer for testing but not writing (handled by Scene.renderGlass internal setup usually, but we should be explicit here if needed)
	// We want to blend glass on top of lighting buffer
	Backend.setBlendState(true, "src-alpha", "one-minus-src-alpha");

	// Ensure we read depth but don't write it (standard for transparency)
	Backend.setDepthState(true, false, "lequal");
	Backend.setCullState(false);

	RenderPasses.renderTransparent();

	// Render explosions and particles with additive blending directly into the light buffer
	Backend.setBlendState(true, "src-alpha", "one");
	RenderPasses.renderBillboards();

	Backend.setCullState(true);
	Backend.setDepthState(true, true);
	Backend.setBlendState(false);

	Backend.setDepthRange(0.0, 1.0);
	Backend.bindFramebuffer(null);
};

const _postProcessingPass = () => {
	if (Settings.doFSR) {
		Backend.bindFramebuffer(_scratch.framebuffer);
		Backend.setViewport(0, 0, _g.width, _g.height);
		Backend.clear({ color: [0, 0, 0, 1] });
	} else {
		Backend.bindFramebuffer(null);
		Backend.setViewport(0, 0, _g.width, _g.height);
		Backend.clear({ color: [0, 0, 0, 1], depth: 1.0 });
	}

	_g.color.bind(0);
	_l.light.bind(1);
	_g.emissive.bind(2);
	const dirt = Resources.get("system/dirt.webp");
	dirt.bind(3);
	_s.shadow.bind(4);
	_g.normal.bind(5);
	Shaders.postProcessing.bind();

	Shaders.postProcessing.setInt("colorBuffer", 0);
	Shaders.postProcessing.setInt("lightBuffer", 1);
	Shaders.postProcessing.setInt("emissiveBuffer", 2);
	Shaders.postProcessing.setInt("dirtBuffer", 3);
	Shaders.postProcessing.setInt("shadowBuffer", 4);
	Shaders.postProcessing.setInt("normalBuffer", 5);

	Shaders.postProcessing.setFloat("emissiveMult", Settings.emissiveMult);
	Shaders.postProcessing.setFloat("gamma", Settings.gamma);
	Shaders.postProcessing.setFloat(
		"dirtIntensity",
		Settings.doDirt ? Settings.dirtIntensity : 0.0,
	);
	Shaders.postProcessing.setFloat("shadowIntensity", Settings.shadowIntensity);
	Shaders.postProcessing.setVec3("uAmbient", Scene.getAmbient());
	Shapes.screenQuad.renderSingle();

	Backend.unbindShader();
	Texture.unBindRange(0, 6);

	if (Settings.doFSR) {
		Backend.bindFramebuffer(null);
	}
};
const _fsrPass = () => {
	if (!Settings.doFSR || !_scratch.color || !_fsr.easu) return;

	const nativeWidth = Backend.getNativeWidth();
	const nativeHeight = Backend.getNativeHeight();

	// Disable depth test for fullscreen FSR passes
	Backend.setDepthState(false, false);

	// EASU pass
	Backend.bindFramebuffer(_fsr.framebuffer);
	Backend.setViewport(0, 0, nativeWidth, nativeHeight);

	Shaders.fsrEasu.bind();
	Shaders.fsrEasu.setInt("colorBuffer", 0);

	// Set FSR constants
	_fsrCon0[0] = _g.width;
	_fsrCon0[1] = _g.height;
	_fsrCon0[2] = nativeWidth;
	_fsrCon0[3] = nativeHeight;
	Shaders.fsrEasu.setVec4("con0", _fsrCon0);

	_scratch.color.bind(0);
	Shapes.screenQuad.renderSingle();

	// RCAS pass
	Backend.bindFramebuffer(null);
	Backend.setViewport(0, 0, nativeWidth, nativeHeight);
	// No clear needed, full screen quad overwrite
	_fsr.easu.bind(0);
	Shaders.fsrRcas.bind();
	Shaders.fsrRcas.setInt("colorBuffer", 0);
	Shaders.fsrRcas.setFloat("sharpness", Settings.fsrSharpness || 0.2);

	Shapes.screenQuad.renderSingle();

	// Restore depth test
	Backend.setDepthState(true, true);
	Backend.unbindShader();
	Texture.unBindRange(0, 1);
};
const _debugPass = () => {
	RenderPasses.renderDebug();
};

// UBO for FrameData
let _frameDataUBO = null;
const _FRAME_DATA_BINDING_POINT = 0;
// mat4 (16) * 4 + vec4 (4) + vec4 (4) = 64 + 4 + 4 = 72 floats * 4 bytes = 288 bytes
// But std140 alignment:
// mat4 = 64
// mat4 = 64
// mat4 = 64
// mat4 = 64
// vec4 = 16
// vec4 = 16
// Total = 288 bytes (exactly 72 floats)
const _FRAME_DATA_SIZE = 288;

// Pre-allocate UBO data array to avoid per-frame allocation
const _frameData = new Float32Array(72);

const _initUBO = () => {
	if (_frameDataUBO) return;

	_frameDataUBO = Backend.createUBO(
		_FRAME_DATA_SIZE,
		_FRAME_DATA_BINDING_POINT,
	);
	Backend.bindUniformBuffer(_frameDataUBO);
};

const _updateFrameData = (time) => {
	if (!_frameDataUBO) _initUBO();

	// matViewProj (0-15)
	_frameData.set(Camera.viewProjection, 0);
	// matInvViewProj (16-31)
	_frameData.set(Camera.inverseViewProjection, 16);
	// matView (32-47)
	_frameData.set(Camera.view, 32);
	// matProjection (48-63)
	_frameData.set(Camera.projection, 48);

	// cameraPosition (64-67)
	_frameData.set(Camera.position, 64);
	_frameData[67] = time; // .w = time

	// viewportSize (68-71)
	_frameData[68] = Backend.getWidth();
	_frameData[69] = Backend.getHeight();
	_frameData[70] = Settings.proceduralDetail ? 1.0 : 0.0; // .z = doProceduralDetail flag

	Backend.updateUBO(_frameDataUBO, _frameData);
};

// Public Renderer API
const Renderer = {
	resize() {
		_resize(Backend.getWidth(), Backend.getHeight());
	},

	render(time = 0) {
		Backend.beginFrame();

		_updateFrameData(time);
		_worldGeomPass();
		_shadowPass();
		if (Settings.shadowBlurIterations > 0) {
			_shadowBlurPass();
		}
		_fpsGeomPass();
		_lightingPass();
		_transparentPass();
		_emissiveBlurPass();
		_postProcessingPass();
		if (Settings.doFSR) {
			_fsrPass();
		}
		_debugPass();

		Backend.endFrame();
	},
};

export { Renderer };
