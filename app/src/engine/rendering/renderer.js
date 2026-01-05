import Camera from "../core/camera.js";
import Settings from "../core/settings.js";
import Scene from "../scene/scene.js";
import Console from "../systems/console.js";
import Resources from "../systems/resources.js";
import Utils from "../utils/utils.js";
import { afExt, Context, getBackend, gl } from "./context.js";
import RenderPasses from "./renderpasses.js";
import { Shaders } from "./shaders.js";
import { screenQuad } from "./shapes.js";
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
		gl.deleteFramebuffer(_g.framebuffer);
		if (_g.worldPosition) _g.worldPosition.dispose();
		if (_g.normal) _g.normal.dispose();
		if (_g.color) _g.color.dispose();
		if (_g.emissive) _g.emissive.dispose();
	}
	if (_s.framebuffer) {
		gl.deleteFramebuffer(_s.framebuffer);
		if (_s.shadow) _s.shadow.dispose();
	}
	if (_l.framebuffer) {
		gl.deleteFramebuffer(_l.framebuffer);
		if (_l.light) _l.light.dispose();
	}
	if (_b.framebuffer) {
		gl.deleteFramebuffer(_b.framebuffer);
		if (_b.blur) _b.blur.dispose();
	}
	if (_ao.framebuffer) {
		gl.deleteFramebuffer(_ao.framebuffer);
		if (_ao.ssao) _ao.ssao.dispose();
		// Note: _ao.noise is NOT disposed - it's reusable across resizes
	}
};

// Private functions
const _checkFramebufferStatus = () => {
	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	switch (status) {
		case gl.FRAMEBUFFER_COMPLETE:
			break;
		case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
			Console.error("FRAMEBUFFER_INCOMPLETE_ATTACHMENT");
			break;
		case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
			Console.error("FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT");
			break;
		case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
			Console.error("FRAMEBUFFER_INCOMPLETE_DIMENSIONS");
			break;
		case gl.FRAMEBUFFER_UNSUPPORTED:
			Console.error("FRAMEBUFFER_UNSUPPORTED");
			break;
		default:
			break;
	}
};

const _resize = (width, height) => {
	// Dispose old resources first to prevent memory leaks
	_disposeResources();

	// **********************************
	// depth buffer
	// **********************************
	_depth = new Texture({
		format: gl.DEPTH_COMPONENT24,
		width,
		height,
	});

	// **********************************
	// geometry buffer
	// **********************************
	_g.width = width;
	_g.height = height;
	_g.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, _g.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	// World position buffer (RGBA16F for accurate position at all distances)
	// Using RGBA instead of RGB for better compatibility as color attachment
	_g.worldPosition = new Texture({
		format: gl.RGBA16F,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		_g.worldPosition.texture,
		0,
	);

	_g.normal = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT1,
		gl.TEXTURE_2D,
		_g.normal.texture,
		0,
	);

	_g.color = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT2,
		gl.TEXTURE_2D,
		_g.color.texture,
		0,
	);

	_g.emissive = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT3,
		gl.TEXTURE_2D,
		_g.emissive.texture,
		0,
	);

	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D,
		_depth.texture,
		0,
	);
	gl.drawBuffers([
		gl.COLOR_ATTACHMENT0,
		gl.COLOR_ATTACHMENT1,
		gl.COLOR_ATTACHMENT2,
		gl.COLOR_ATTACHMENT3,
	]);
	_checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// shadow buffer
	// **********************************
	_s.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, _s.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	_s.shadow = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		_s.shadow.texture,
		0,
	);
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D,
		_depth.texture,
		0,
	);
	_checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// lighting buffer
	// **********************************
	_l.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, _l.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	_l.light = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		_l.light.texture,
		0,
	);

	_checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// gaussianblur buffer
	// **********************************
	_b.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, _b.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	_b.blur = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		_b.blur.texture,
		0,
	);
	_checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// SSAO buffer
	// **********************************
	_ao.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, _ao.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	_ao.ssao = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		_ao.ssao.texture,
		0,
	);
	_checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

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
	gl.bindFramebuffer(gl.FRAMEBUFFER, _b.framebuffer);
};

const _endBlurPass = () => {
	Texture.unBind(gl.TEXTURE0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const _swapBlur = (i) => {
	if (i % 2 === 0) {
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			_b.blur.texture,
			0,
		);
		_b.source.bind(gl.TEXTURE0);
	} else {
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			_b.source.texture,
			0,
		);
		_b.blur.bind(gl.TEXTURE0);
	}
	gl.clear(gl.COLOR_BUFFER_BIT);
};

const _blurImage = (source, iterations, radius) => {
	Shaders.kawaseBlur.bind();
	_startBlurPass(source);
	for (let i = 0; i < iterations; i++) {
		_swapBlur(i);

		Shaders.kawaseBlur.setInt("colorBuffer", 0);
		// Kawase blur uses progressive offsets: each iteration increases spread
		Shaders.kawaseBlur.setFloat("offset", (i + 1) * radius);

		screenQuad.renderSingle();
	}
	_endBlurPass();
	getBackend().unbindShader();
};

const _generateSSAOKernel = () => {
	const kernel = [];
	for (let i = 0; i < 16; ++i) {
		// Generate random samples in a hemisphere
		const sample = [
			Math.random() * 2.0 - 1.0,
			Math.random() * 2.0 - 1.0,
			Math.random(),
		];
		// Normalize
		const length = Math.sqrt(
			sample[0] * sample[0] + sample[1] * sample[1] + sample[2] * sample[2],
		);
		sample[0] /= length;
		sample[1] /= length;
		sample[2] /= length;

		// Scale samples so they're more aligned to center of kernel
		let scale = i / 16.0;
		scale = 0.1 + scale * scale * 0.9; // Lerp between 0.1 and 1.0
		sample[0] *= scale;
		sample[1] *= scale;
		sample[2] *= scale;

		kernel.push(sample[0], sample[1], sample[2]);
	}
	_ssaoKernel = new Float32Array(kernel);
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
		format: gl.RGBA8,
		width: 4,
		height: 4,
		pdata: new Uint8Array(noiseData),
		pformat: gl.RGBA,
		ptype: gl.UNSIGNED_BYTE,
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
		format: gl.RGBA8,
		width: size,
		height: size,
		pdata: data,
		pformat: gl.RGBA,
		ptype: gl.UNSIGNED_BYTE,
	});

	_detailNoise.bind(gl.TEXTURE0);
	gl.texParameteri(
		gl.TEXTURE_2D,
		gl.TEXTURE_MIN_FILTER,
		gl.LINEAR_MIPMAP_LINEAR,
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	if (afExt) {
		const maxAniso = gl.getParameter(afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
		const af = Math.min(Math.max(Settings.anisotropicFiltering, 1), maxAniso);
		gl.texParameterf(gl.TEXTURE_2D, afExt.TEXTURE_MAX_ANISOTROPY_EXT, af);
	}

	gl.generateMipmap(gl.TEXTURE_2D);
};

const _startGeomPass = (clearDepthOnly = false) => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _g.framebuffer);
	const ambient = Scene.getAmbient();
	gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
	if (clearDepthOnly) {
		gl.clear(gl.DEPTH_BUFFER_BIT);
	} else {
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
};

const _endGeomPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const _worldGeomPass = () => {
	gl.depthRange(0.1, 1.0);
	_startGeomPass();

	if (_detailNoise) _detailNoise.bind(gl.TEXTURE5); // Bind noise to unit 5
	RenderPasses.renderWorldGeometry();

	_endGeomPass();
	gl.depthRange(0.0, 1.0);
};

const _fpsGeomPass = () => {
	// Don't clear depth, just use a closer depth range so it draws on top
	gl.depthRange(0.0, 0.1);
	gl.bindFramebuffer(gl.FRAMEBUFFER, _g.framebuffer);

	if (_detailNoise) _detailNoise.bind(gl.TEXTURE5); // Bind noise to unit 5
	RenderPasses.renderFPSGeometry();

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.depthRange(0.0, 1.0);
};

const _shadowPass = () => {
	// Match the depth range of the world geometry pass so depth comparisons are valid
	gl.depthRange(0.1, 1.0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, _s.framebuffer);
	gl.clearColor(1.0, 1.0, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	RenderPasses.renderShadows();

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.depthRange(0.0, 1.0);
};

const _ssaoPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _ao.framebuffer);
	gl.clearColor(1.0, 1.0, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Bind G-buffer textures
	_g.normal.bind(gl.TEXTURE0);
	_g.worldPosition.bind(gl.TEXTURE1); // Use position buffer instead of depth
	_ao.noise.bind(gl.TEXTURE2);

	// Setup SSAO shader
	Shaders.ssao.bind();
	Shaders.ssao.setInt("normalBuffer", 0);
	Shaders.ssao.setInt("positionBuffer", 1);
	Shaders.ssao.setInt("noiseTexture", 2);
	// Set uniforms
	Shaders.ssao.setVec2("noiseScale", [
		Context.width() / 4.0,
		Context.height() / 4.0,
	]);
	Shaders.ssao.setFloat("radius", Settings.ssaoRadius);
	Shaders.ssao.setFloat("bias", Settings.ssaoBias);
	Shaders.ssao.setVec3Array("uKernel", _ssaoKernel);

	gl.disable(gl.DEPTH_TEST);
	screenQuad.renderSingle();
	gl.enable(gl.DEPTH_TEST);

	getBackend().unbindShader();
	Texture.unBindRange(gl.TEXTURE0, 3);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const _lightingPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _l.framebuffer);

	// Explicitly detach depth buffer to allow reading it as a texture
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D,
		null,
		0,
	);

	const ambient = Scene.getAmbient();
	gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	_g.worldPosition.bind(gl.TEXTURE0);
	_g.normal.bind(gl.TEXTURE1);
	_s.shadow.bind(gl.TEXTURE2);

	gl.enable(gl.CULL_FACE);
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE);

	RenderPasses.renderLighting();

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);

	Texture.unBindRange(gl.TEXTURE0, 3);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

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
	gl.bindFramebuffer(gl.FRAMEBUFFER, _b.framebuffer);

	// Ping-pong blur for SSAO
	for (let i = 0; i < Settings.ssaoBlurIterations; i++) {
		if (i % 2 === 0) {
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				_b.blur.texture,
				0,
			);
			_ao.ssao.bind(gl.TEXTURE0);
		} else {
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				_ao.ssao.texture,
				0,
			);
			_b.blur.bind(gl.TEXTURE0);
		}
		gl.clear(gl.COLOR_BUFFER_BIT);

		Shaders.kawaseBlur.bind();
		Shaders.kawaseBlur.setInt("colorBuffer", 0);
		Shaders.kawaseBlur.setFloat("offset", i + 1.0);
		screenQuad.renderSingle();
		getBackend().unbindShader();
	}

	Texture.unBind(gl.TEXTURE0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const _transparentPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _l.framebuffer);

	// Re-attach depth buffer for correct depth testing
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D,
		_depth.texture,
		0,
	);

	// Match the depth range of the world geometry pass so depth comparisons are valid
	gl.depthRange(0.1, 1.0);

	// Glass pass uses the existing depth buffer for testing but not writing (handled by Scene.renderGlass internal setup usually, but we should be explicit here if needed)
	// We want to blend glass on top of lighting buffer
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	// Ensure we read depth but don't write it (standard for transparency)
	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);
	gl.depthMask(false);
	gl.disable(gl.CULL_FACE);

	RenderPasses.renderTransparent();

	gl.enable(gl.CULL_FACE);
	gl.depthMask(true);
	gl.disable(gl.BLEND);

	gl.depthRange(0.0, 1.0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const _postProcessingPass = () => {
	_g.color.bind(gl.TEXTURE0);
	_l.light.bind(gl.TEXTURE1);
	_g.normal.bind(gl.TEXTURE2);
	_g.emissive.bind(gl.TEXTURE3);
	const dirt = Resources.get("system/dirt.webp");
	dirt.bind(gl.TEXTURE4);
	_ao.ssao.bind(gl.TEXTURE5);
	Shaders.postProcessing.bind();
	Shaders.postProcessing.setInt("doFXAA", Settings.doFXAA);

	Shaders.postProcessing.setInt("colorBuffer", 0);
	Shaders.postProcessing.setInt("lightBuffer", 1);
	Shaders.postProcessing.setInt("normalBuffer", 2);
	Shaders.postProcessing.setInt("emissiveBuffer", 3);
	Shaders.postProcessing.setInt("dirtBuffer", 4);
	Shaders.postProcessing.setInt("aoBuffer", 5);

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
	Shaders.postProcessing.setVec3("uAmbient", Scene.getAmbient());
	screenQuad.renderSingle();

	getBackend().unbindShader();
	Texture.unBindRange(gl.TEXTURE0, 6);
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

	_frameDataUBO = gl.createBuffer();
	gl.bindBuffer(gl.UNIFORM_BUFFER, _frameDataUBO);
	gl.bufferData(gl.UNIFORM_BUFFER, _FRAME_DATA_SIZE, gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.UNIFORM_BUFFER, null);

	gl.bindBufferBase(
		gl.UNIFORM_BUFFER,
		_FRAME_DATA_BINDING_POINT,
		_frameDataUBO,
	);
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
	_frameData[68] = Context.width();
	_frameData[69] = Context.height();

	gl.bindBuffer(gl.UNIFORM_BUFFER, _frameDataUBO);
	gl.bufferSubData(gl.UNIFORM_BUFFER, 0, _frameData);
	gl.bindBuffer(gl.UNIFORM_BUFFER, null);
};

// Public Renderer API
const Renderer = {
	render(time = 0) {
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
	},
};

export default Renderer;

// Initialize on resize
window.addEventListener(
	"resize",
	() => {
		Context.resize();
		_resize(Context.width(), Context.height());
	},
	false,
);
Utils.dispatchEvent("resize");
