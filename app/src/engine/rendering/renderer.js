import Camera from "../core/camera.js";
import Settings from "../core/settings.js";
import Scene from "../scene/scene.js";

import Resources from "../systems/resources.js";
import { Backend } from "./backend.js";
import RenderPasses from "./renderpasses.js";
import { Shaders } from "./shaders.js";
import Shapes from "./shapes.js";
import Texture from "./texture.js";

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
	worldPosition: null, // World-space position buffer for accurate lighting
};

const _s = {
	framebuffer: null,
	shadow: null,
};

const _l = {
	framebuffer: null,
	light: null,
};

const _b = {
	framebuffer: null,
	blur: null,
	source: null,
};

const _ao = {
	framebuffer: null,
	ssao: null,
	noise: null,
};

let _detailNoise = null;

// SSAO sample kernel and noise data
let _ssaoKernel = null;
let _ssaoNoiseData = [];

// Dispose old resources to prevent memory leaks on resize
const _disposeResources = () => {
	if (_depth) _depth.dispose();
	if (_g.framebuffer) {
		Backend.deleteFramebuffer(_g.framebuffer);
		if (_g.worldPosition) _g.worldPosition.dispose();
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
	if (_b.framebuffer) {
		Backend.deleteFramebuffer(_b.framebuffer);
		if (_b.blur) _b.blur.dispose();
	}
	if (_ao.framebuffer) {
		Backend.deleteFramebuffer(_ao.framebuffer);
		if (_ao.ssao) _ao.ssao.dispose();
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

	// World position buffer (RGBA16F for accurate position at all distances)
	_g.worldPosition = new Texture({ format: "rgba16f", width, height });
	_g.normal = new Texture({ format: "rgba8", width, height });
	_g.color = new Texture({ format: "rgba8", width, height });
	_g.emissive = new Texture({ format: "rgba8", width, height });

	_g.framebuffer = Backend.createFramebuffer({
		colorAttachments: [
			_g.worldPosition.getHandle(),
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
		{ format: "rgba8", width, height },
		{ depthAttachment: _depth.getHandle() },
	);
	_s.shadow = shadowRes.texture;
	_s.framebuffer = shadowRes.fb;

	// **********************************
	// lighting buffer
	// **********************************
	const lightRes = _createFB({ format: "rgba8", width, height }, {});
	_l.light = lightRes.texture;
	_l.framebuffer = lightRes.fb;

	// **********************************
	// blur buffer
	// **********************************
	const blurRes = _createFB({ format: "rgba8", width, height }, {});
	_b.blur = blurRes.texture;
	_b.framebuffer = blurRes.fb;

	// **********************************
	// SSAO buffer
	// **********************************
	const ssaoRes = _createFB({ format: "rgba8", width, height }, {});
	_ao.ssao = ssaoRes.texture;
	_ao.framebuffer = ssaoRes.fb;

	// Initialize SSAO noise texture (only once, doesn't need resize)
	if (!_ao.noise) {
		_generateSSAOKernel();
		_generateSSAONoise();
	}

	if (!_detailNoise) {
		_generateDetailNoise();
	}
};

const _startBlurPass = (blurSource) => {
	switch (blurSource) {
		case _BlurSourceType.SHADOW:
			_b.source = _s.shadow;
			break;
		case _BlurSourceType.LIGHTING:
			_b.source = _l.light;
			break;
		case _BlurSourceType.EMISSIVE:
			_b.source = _g.emissive;
			break;
		default:
	}
	Backend.bindFramebuffer(_b.framebuffer);
};

const _endBlurPass = () => {
	Texture.unBind(0);
	Backend.bindFramebuffer(null);
};

const _swapBlur = (i) => {
	if (i % 2 === 0) {
		Backend.setFramebufferAttachment(_b.framebuffer, 0, _b.blur.getHandle());
		// Re-bind (as setFramebufferAttachment unbinds)
		Backend.bindFramebuffer(_b.framebuffer);
		_b.source.bind(0);
	} else {
		Backend.setFramebufferAttachment(_b.framebuffer, 0, _b.source.getHandle());
		// Re-bind
		Backend.bindFramebuffer(_b.framebuffer);
		_b.blur.bind(0);
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

const _generateSSAOKernel = () => {
	_ssaoKernel = new Float32Array(48); // 16 samples * 3 components
	for (let i = 0; i < 16; ++i) {
		// Generate random samples in a hemisphere
		let x = Math.random() * 2.0 - 1.0;
		let y = Math.random() * 2.0 - 1.0;
		let z = Math.random();
		// Normalize
		const invLen = 1.0 / Math.sqrt(x * x + y * y + z * z);
		x *= invLen;
		y *= invLen;
		z *= invLen;
		// Scale samples so they're more aligned to center of kernel
		const t = i / 16.0;
		const scale = 0.1 + t * t * 0.9; // Lerp between 0.1 and 1.0
		const idx = i * 3;
		_ssaoKernel[idx] = x * scale;
		_ssaoKernel[idx + 1] = y * scale;
		_ssaoKernel[idx + 2] = z * scale;
	}
};

const _generateSSAONoise = () => {
	_ssaoNoiseData = [];
	for (let i = 0; i < 16; i++) {
		// Random vectors in tangent space
		_ssaoNoiseData.push(
			Math.random() * 2.0 - 1.0,
			Math.random() * 2.0 - 1.0,
			0.0,
			1.0,
		);
	}

	// Create noise texture (4x4)
	const noiseData = [];
	for (let i = 0; i < 16; i++) {
		// Convert random values from [-1, 1] to [0, 255] for RGBA
		const x = _ssaoNoiseData[i * 4];
		const y = _ssaoNoiseData[i * 4 + 1];
		const z = _ssaoNoiseData[i * 4 + 2];
		noiseData.push(
			((x * 0.5 + 0.5) * 255) | 0,
			((y * 0.5 + 0.5) * 255) | 0,
			((z * 0.5 + 0.5) * 255) | 0,
			255,
		);
	}

	_ao.noise = new Texture({
		format: "rgba8",
		width: 4,
		height: 4,
		pdata: new Uint8Array(noiseData),
		pformat: "rgba",
		ptype: "ubyte",
	});

	// Set wrap mode to REPEAT
	_ao.noise.setTextureWrapMode("repeat");
};

const _generateDetailNoise = () => {
	const size = 256;
	const data = new Uint8Array(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		const val = Math.floor(Math.random() * 255);
		data[i * 4] = val; // R
		data[i * 4 + 1] = val; // G
		data[i * 4 + 2] = val; // B
		data[i * 4 + 3] = 255; // A
	}

	_detailNoise = new Texture({
		format: "rgba8",
		width: size,
		height: size,
		pdata: data,
		pformat: "rgba",
		ptype: "ubyte",
	});

	_detailNoise.setTextureWrapMode("repeat");
	Backend.generateMipmaps(_detailNoise.getHandle());

	if (Settings.anisotropicFiltering > 1) {
		Backend.setTextureAnisotropy(
			_detailNoise.getHandle(),
			Settings.anisotropicFiltering,
		);
	}
};

const _startGeomPass = (clearDepthOnly = false) => {
	Backend.bindFramebuffer(_g.framebuffer);
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

	if (_detailNoise) _detailNoise.bind(5); // Bind noise to unit 5
	RenderPasses.renderWorldGeometry();

	_endGeomPass();
	Backend.setDepthRange(0.0, 1.0);
};

const _fpsGeomPass = () => {
	// Don't clear depth, just use a closer depth range so it draws on top
	Backend.setDepthRange(0.0, 0.1);
	Backend.bindFramebuffer(_g.framebuffer);

	if (_detailNoise) _detailNoise.bind(5); // Bind noise to unit 5
	RenderPasses.renderFPSGeometry();

	Backend.bindFramebuffer(null);
	Backend.setDepthRange(0.0, 1.0);
};

const _shadowPass = () => {
	// Match the depth range of the world geometry pass so depth comparisons are valid
	Backend.setDepthRange(0.1, 1.0);
	Backend.bindFramebuffer(_s.framebuffer);
	Backend.clear({ color: [1.0, 1.0, 1.0, 1.0] });
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

const _ssaoPass = () => {
	Backend.bindFramebuffer(_ao.framebuffer);
	Backend.clear({ color: [1.0, 1.0, 1.0, 1.0] });

	// Bind G-buffer textures
	_g.normal.bind(0);
	_g.worldPosition.bind(1); // Use position buffer instead of depth
	_ao.noise.bind(2);

	// Setup SSAO shader
	Shaders.ssao.bind();
	Shaders.ssao.setInt("normalBuffer", 0);
	Shaders.ssao.setInt("positionBuffer", 1);
	Shaders.ssao.setInt("noiseTexture", 2);
	// Set uniforms
	Shaders.ssao.setVec2("noiseScale", [
		Backend.getWidth() / 4.0,
		Backend.getHeight() / 4.0,
	]);
	Shaders.ssao.setFloat("radius", Settings.ssaoRadius);
	Shaders.ssao.setFloat("bias", Settings.ssaoBias);
	Shaders.ssao.setVec3Array("uKernel", _ssaoKernel);

	Backend.setDepthState(false, false);
	Shapes.screenQuad.renderSingle();
	Backend.setDepthState(true, true);

	Backend.unbindShader();
	Texture.unBindRange(0, 3);
	Backend.bindFramebuffer(null);
};

const _lightingPass = () => {
	// Explicitly detach depth buffer to allow reading it as a texture
	Backend.setFramebufferAttachment(_l.framebuffer, "depth", null);
	Backend.bindFramebuffer(_l.framebuffer);

	const ambient = Scene.getAmbient();

	Backend.clear({
		color: [ambient[0], ambient[1], ambient[2], 1.0],
	});
	_g.worldPosition.bind(0);
	_g.normal.bind(1);
	_s.shadow.bind(2);

	Backend.setCullState(true);
	Backend.setDepthState(false, false);
	Backend.setBlendState(true, "one", "one");

	RenderPasses.renderLighting();

	Backend.setBlendState(false);
	Backend.setDepthState(true, true);
	Backend.setCullState(true);

	Texture.unBindRange(0, 3);
	Backend.bindFramebuffer(null);

	_blurImage(_BlurSourceType.LIGHTING, 4, 0.2);
};

const _emissiveBlurPass = () => {
	_blurImage(
		_BlurSourceType.EMISSIVE,
		Settings.emissiveIteration,
		Settings.emissiveOffset,
	);
};

const _shadowBlurPass = () => {
	_blurImage(
		_BlurSourceType.SHADOW,
		Settings.shadowBlurIterations,
		Settings.shadowBlurOffset,
	);
};

const _ssaoBlurPass = () => {
	// Blur SSAO directly by setting up a special blur source
	Backend.bindFramebuffer(_b.framebuffer);

	// Ping-pong blur for SSAO
	for (let i = 0; i < Settings.ssaoBlurIterations; i++) {
		if (i % 2 === 0) {
			Backend.setFramebufferAttachment(_b.framebuffer, 0, _b.blur.getHandle());
			Backend.bindFramebuffer(_b.framebuffer);
			_ao.ssao.bind(0);
		} else {
			Backend.setFramebufferAttachment(_b.framebuffer, 0, _ao.ssao.getHandle());
			Backend.bindFramebuffer(_b.framebuffer);
			_b.blur.bind(0);
		}
		Backend.clear({ color: [0, 0, 0, 0] });

		Shaders.kawaseBlur.bind();
		Shaders.kawaseBlur.setInt("colorBuffer", 0);
		Shaders.kawaseBlur.setFloat("offset", i + 1.0);
		Shapes.screenQuad.renderSingle();
		Backend.unbindShader();
	}

	Texture.unBind(0);
	Backend.bindFramebuffer(null);
};

const _transparentPass = () => {
	// Re-attach depth buffer for correct depth testing
	Backend.setFramebufferAttachment(_l.framebuffer, "depth", _depth.getHandle());
	Backend.bindFramebuffer(_l.framebuffer);

	// Match the depth range of the world geometry pass so depth comparisons are valid
	Backend.setDepthRange(0.1, 1.0);

	// Glass pass uses the existing depth buffer for testing but not writing (handled by Scene.renderGlass internal setup usually, but we should be explicit here if needed)
	// We want to blend glass on top of lighting buffer
	Backend.setBlendState(true, "src-alpha", "one-minus-src-alpha");

	// Ensure we read depth but don't write it (standard for transparency)
	Backend.setDepthState(true, false, "lequal");
	Backend.setCullState(false);

	RenderPasses.renderTransparent();

	Backend.setCullState(true);
	Backend.setDepthState(true, true);
	Backend.setBlendState(false);

	Backend.setDepthRange(0.0, 1.0);
	Backend.bindFramebuffer(null);
};

const _postProcessingPass = () => {
	_g.color.bind(0);
	_l.light.bind(1);
	_g.normal.bind(2);
	_g.emissive.bind(3);
	const dirt = Resources.get("system/dirt.webp");
	dirt.bind(4);
	_ao.ssao.bind(5);
	_s.shadow.bind(6);
	_g.worldPosition.bind(7);
	Shaders.postProcessing.bind();
	Shaders.postProcessing.setInt("doFXAA", Settings.doFXAA);

	Shaders.postProcessing.setInt("colorBuffer", 0);
	Shaders.postProcessing.setInt("lightBuffer", 1);
	Shaders.postProcessing.setInt("normalBuffer", 2);
	Shaders.postProcessing.setInt("emissiveBuffer", 3);
	Shaders.postProcessing.setInt("dirtBuffer", 4);
	Shaders.postProcessing.setInt("aoBuffer", 5);
	Shaders.postProcessing.setInt("shadowBuffer", 6);
	Shaders.postProcessing.setInt("positionBuffer", 7);

	Shaders.postProcessing.setFloat("emissiveMult", Settings.emissiveMult);
	Shaders.postProcessing.setFloat("gamma", Settings.gamma);
	Shaders.postProcessing.setFloat(
		"ssaoStrength",
		Settings.doSSAO ? Settings.ssaoStrength : 0.0,
	);
	Shaders.postProcessing.setFloat(
		"dirtIntensity",
		Settings.doDirt ? Settings.dirtIntensity : 0.0,
	);
	Shaders.postProcessing.setFloat("shadowIntensity", Settings.shadowIntensity);
	Shaders.postProcessing.setVec3("uAmbient", Scene.getAmbient());
	Shapes.screenQuad.renderSingle();

	Backend.unbindShader();
	Texture.unBindRange(0, 8);
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
	_frameData[70] = Settings.detailTexture ? 1.0 : 0.0; // .z = doDetailTexture flag

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
		if (Settings.doSSAO) {
			_ssaoPass();
			_ssaoBlurPass();
		}
		_shadowPass();
		if (Settings.shadowBlurIterations > 0) {
			_shadowBlurPass();
		}
		_fpsGeomPass();
		_lightingPass();
		_transparentPass();
		_emissiveBlurPass();
		_postProcessingPass();
		_debugPass();

		Backend.endFrame();
	},
};

export default Renderer;
