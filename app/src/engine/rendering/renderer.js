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

	_g.position = new Texture({
		format: gl.RGBA16F,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		_g.position.texture,
		0,
	);

	_g.normal = new Texture({
		format: gl.RGBA16F,
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

const _lightingPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _l.framebuffer);
	const ambient = Scene.getAmbient();
	gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	_g.position.bind(gl.TEXTURE0);
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

const _glassPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, _l.framebuffer);

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

	Scene.renderGlass();

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
	Shaders.postProcessing.bind();
	Shaders.postProcessing.setInt("doFXAA", Settings.doFXAA);
	Shaders.postProcessing.setInt("colorBuffer", 0);
	Shaders.postProcessing.setInt("lightBuffer", 1);
	Shaders.postProcessing.setInt("normalBuffer", 2);
	Shaders.postProcessing.setInt("emissiveBuffer", 3);
	Shaders.postProcessing.setInt("dirtBuffer", 4);
	Shaders.postProcessing.setVec2("viewportSize", [
		Context.width(),
		Context.height(),
	]);
	Shaders.postProcessing.setFloat("emissiveMult", Settings.emissiveMult);
	Shaders.postProcessing.setFloat("gamma", Settings.gamma);
	Shaders.postProcessing.setVec3("ambient", Scene.getAmbient());
	screenQuad.renderSingle();

	Shader.unBind();
	Texture.unBind(gl.TEXTURE0);
	Texture.unBind(gl.TEXTURE1);
	Texture.unBind(gl.TEXTURE2);
	Texture.unBind(gl.TEXTURE3);
	Texture.unBind(gl.TEXTURE4);
};

const _debugPass = () => {
	Scene.renderDebug();
};

// Public Renderer API
const Renderer = {
	render() {
		_worldGeomPass();
		_shadowPass();
		_fpsGeomPass();
		_lightingPass();
		_glassPass();
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
