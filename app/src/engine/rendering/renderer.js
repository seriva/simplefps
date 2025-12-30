import Camera from "../core/camera.js";
import { Context, gl } from "../core/context.js";
import Scene from "../core/scene.js";
import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import Resources from "../systems/resources.js";
import Utils from "../utils/utils.js";
import { Shader, Shaders } from "./shaders.js";
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

// SSAO sample kernel and noise data
let _ssaoKernel = [];
let _ssaoNoiseData = [];

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
	// **********************************
	// depth buffer
	// **********************************
	_depth = new Texture({
		format: gl.DEPTH_COMPONENT32F,
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

	_g.normal = new Texture({
		format: gl.RGBA16F,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
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
		gl.COLOR_ATTACHMENT1,
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
		gl.COLOR_ATTACHMENT2,
		gl.TEXTURE_2D,
		_g.emissive.texture,
		0,
	);

	// Linear depth buffer for SSAO (camera-relative depth)
	_g.linearDepth = new Texture({
		format: gl.R16F,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT3,
		gl.TEXTURE_2D,
		_g.linearDepth.texture,
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
	Shaders.gaussianBlur.bind();
	_startBlurPass(source);
	for (let i = 0; i < iterations; i++) {
		_swapBlur(i);

		Shaders.gaussianBlur.setInt("colorBuffer", 0);
		Shaders.gaussianBlur.setVec2("viewportSize", [
			Context.width(),
			Context.height(),
		]);
		Shaders.gaussianBlur.setVec2(
			"direction",
			i % 2 === 0 ? [radius, 0] : [0, radius],
		);

		screenQuad.renderSingle();
	}
	_endBlurPass();
	Shader.unBind();
};

const _generateSSAOKernel = () => {
	_ssaoKernel = [];
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

		_ssaoKernel.push(sample[0], sample[1], sample[2]);
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
		format: gl.RGBA8,
		width: 4,
		height: 4,
		pdata: new Uint8Array(noiseData),
		pformat: gl.RGBA,
		ptype: gl.UNSIGNED_BYTE,
	});

	// Set wrap mode to REPEAT
	_ao.noise.setTextureWrapMode(gl.REPEAT);
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

	Scene.renderWorldGeometry();

	_endGeomPass();
	gl.depthRange(0.0, 1.0);
};

const _fpsGeomPass = () => {
	// Don't clear depth, just use a closer depth range so it draws on top
	gl.depthRange(0.0, 0.1);
	gl.bindFramebuffer(gl.FRAMEBUFFER, _g.framebuffer);

	Scene.renderFPSGeometry();

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.depthRange(0.0, 1.0);
};

const _shadowPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _s.framebuffer);
	gl.clearColor(1.0, 1.0, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	Scene.renderShadows();

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const _ssaoPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _ao.framebuffer);
	gl.clearColor(1.0, 1.0, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Bind G-buffer textures
	_g.normal.bind(gl.TEXTURE0);
	_depth.bind(gl.TEXTURE1); // Use hardware depth for reconstruction
	_ao.noise.bind(gl.TEXTURE2);

	// Setup SSAO shader
	Shaders.ssao.bind();
	Shaders.ssao.setInt("normalBuffer", 0);
	Shaders.ssao.setInt("depthBuffer", 1);
	Shaders.ssao.setInt("noiseTexture", 2);

	// Set uniforms
	Shaders.ssao.setVec2("viewportSize", [Context.width(), Context.height()]);
	Shaders.ssao.setVec2("noiseScale", [
		Context.width() / 4.0,
		Context.height() / 4.0,
	]);
	Shaders.ssao.setFloat("radius", Settings.ssaoRadius);
	Shaders.ssao.setFloat("bias", Settings.ssaoBias);
	Shaders.ssao.setMat4("matViewProj", Camera.viewProjection);
	Shaders.ssao.setMat4("matInvViewProj", Camera.inverseViewProjection);
	Shaders.ssao.setVec3("cameraPosition", Camera.position);
	Shaders.ssao.setVec3Array("uKernel", new Float32Array(_ssaoKernel));

	gl.disable(gl.DEPTH_TEST);
	screenQuad.renderSingle();
	gl.enable(gl.DEPTH_TEST);

	Shader.unBind();
	Texture.unBind(gl.TEXTURE0);
	Texture.unBind(gl.TEXTURE1);
	Texture.unBind(gl.TEXTURE2);
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
	gl.clear(gl.COLOR_BUFFER_BIT);
	_depth.bind(gl.TEXTURE0);
	_g.normal.bind(gl.TEXTURE1);
	_s.shadow.bind(gl.TEXTURE2);

	gl.enable(gl.CULL_FACE);
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE);

	Scene.renderLighting();

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);

	Texture.unBind(gl.TEXTURE0);
	Texture.unBind(gl.TEXTURE1);
	Texture.unBind(gl.TEXTURE2);
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

		Shaders.gaussianBlur.bind();
		Shaders.gaussianBlur.setInt("colorBuffer", 0);
		Shaders.gaussianBlur.setVec2("viewportSize", [
			Context.width(),
			Context.height(),
		]);
		Shaders.gaussianBlur.setVec2(
			"direction",
			i % 2 === 0 ? [1.0, 0] : [0, 1.0],
		);
		screenQuad.renderSingle();
		Shader.unBind();
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

	Scene.renderTransparent();

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
	_g.linearDepth.bind(gl.TEXTURE6);
	Shaders.postProcessing.bind();
	Shaders.postProcessing.setInt("doFXAA", Settings.doFXAA);

	Shaders.postProcessing.setInt("colorBuffer", 0);
	Shaders.postProcessing.setInt("lightBuffer", 1);
	Shaders.postProcessing.setInt("normalBuffer", 2);
	Shaders.postProcessing.setInt("emissiveBuffer", 3);
	Shaders.postProcessing.setInt("dirtBuffer", 4);
	Shaders.postProcessing.setInt("aoBuffer", 5);

	Shaders.postProcessing.setVec2("viewportSize", [
		Context.width(),
		Context.height(),
	]);
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

	Shader.unBind();
	Texture.unBind(gl.TEXTURE0);
	Texture.unBind(gl.TEXTURE1);
	Texture.unBind(gl.TEXTURE2);
	Texture.unBind(gl.TEXTURE3);
	Texture.unBind(gl.TEXTURE4);
	Texture.unBind(gl.TEXTURE5);
};

const _debugPass = () => {
	Scene.renderDebug();
};

// Public Renderer API
const Renderer = {
	render() {
		_worldGeomPass();
		if (Settings.doSSAO) {
			_ssaoPass();
			_ssaoBlurPass();
		}
		_shadowPass();
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
