import Console from "./console.js";
import { Context, gl } from "./context.js";
import Resources from "./resources.js";
import Scene from "./scene.js";
import Settings from "./settings.js";
import { Shader, Shaders } from "./shaders.js";
import { screenQuad } from "./shapes.js";
import Texture from "./texture.js";
import Utils from "./utils.js";

let depth = null;

const BlurSourceType = Object.freeze({
	SHADOW: 0,
	LIGHTING: 1,
	EMISSIVE: 2,
});

const g = {
	framebuffer: null,
	position: null,
	normal: null,
	color: null,
	emissive: null,
};

const s = {
	framebuffer: null,
	shadow: null,
};

const l = {
	framebuffer: null,
	light: null,
};

const b = {
	framebuffer: null,
	blur: null,
	source: null,
};

const checkFramebufferStatus = () => {
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

const resize = (width, height) => {
	// **********************************
	// depth buffer
	// **********************************
	depth = new Texture({
		format: gl.DEPTH_COMPONENT32F,
		width,
		height,
	});

	// **********************************
	// geometry buffer
	// **********************************
	g.width = width;
	g.height = height;
	g.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	g.position = new Texture({
		format: gl.RGBA16F,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		g.position.texture,
		0,
	);

	g.normal = new Texture({
		format: gl.RGBA16F,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT1,
		gl.TEXTURE_2D,
		g.normal.texture,
		0,
	);

	g.color = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT2,
		gl.TEXTURE_2D,
		g.color.texture,
		0,
	);

	g.emissive = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT3,
		gl.TEXTURE_2D,
		g.emissive.texture,
		0,
	);

	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D,
		depth.texture,
		0,
	);
	gl.drawBuffers([
		gl.COLOR_ATTACHMENT0,
		gl.COLOR_ATTACHMENT1,
		gl.COLOR_ATTACHMENT2,
		gl.COLOR_ATTACHMENT3,
	]);
	checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// shadow buffer
	// **********************************
	s.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	s.shadow = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		s.shadow.texture,
		0,
	);
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D,
		depth.texture,
		0,
	);
	checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// lighting buffer
	// **********************************
	l.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	l.light = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		l.light.texture,
		0,
	);
	checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// **********************************
	// gaussianblur buffer
	// **********************************
	b.framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
	gl.activeTexture(gl.TEXTURE0);

	b.blur = new Texture({
		format: gl.RGBA8,
		width,
		height,
	});
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		b.blur.texture,
		0,
	);
	checkFramebufferStatus();
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startBlurPass = (blurSource) => {
	switch (blurSource) {
		case BlurSourceType.SHADOW:
			b.source = s.shadow;
			break;
		case BlurSourceType.LIGHTING:
			b.source = l.light;
			break;
		case BlurSourceType.EMISSIVE:
			b.source = g.emissive;
			break;
		default:
	}
	gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
};

const endBlurPass = () => {
	Texture.unBind(gl.TEXTURE0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const swapBlur = (i) => {
	if (i % 2 === 0) {
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			b.blur.texture,
			0,
		);
		b.source.bind(gl.TEXTURE0);
	} else {
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			b.source.texture,
			0,
		);
		b.blur.bind(gl.TEXTURE0);
	}
	gl.clear(gl.COLOR_BUFFER_BIT);
};

const blurImage = (source, iterations, radius) => {
	Shaders.gaussianBlur.bind();
	startBlurPass(source);
	for (let i = 0; i < iterations; i++) {
		swapBlur(i);

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
	endBlurPass();
	Shader.unBind();
};

const startGeomPass = (clearDepthOnly = false) => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
	const ambient = Scene.getAmbient();
	gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
	if (clearDepthOnly) {
		gl.clear(gl.DEPTH_BUFFER_BIT);
	} else {
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
};

const endGeomPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const worldGeomPass = () => {
	startGeomPass();

	Scene.renderWorldGeometry();

	endGeomPass();
};

const fpsGeomPass = () => {
	startGeomPass(true);

	Scene.renderFPSGeometry();

	endGeomPass();
};

const shadowPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
	gl.clearColor(1.0, 1.0, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	Scene.renderShadows();

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const lightingPass = () => {
	gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
	const ambient = Scene.getAmbient();
	gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	g.position.bind(gl.TEXTURE0);
	g.normal.bind(gl.TEXTURE1);
	s.shadow.bind(gl.TEXTURE2);

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

	blurImage(BlurSourceType.LIGHTING, 4, 0.2);
};

const emissiveBlurPass = () => {
	blurImage(
		BlurSourceType.EMISSIVE,
		Settings.emissiveIteration,
		Settings.emissiveOffset,
	);
};

const postProcessingPass = () => {
	g.color.bind(gl.TEXTURE0);
	l.light.bind(gl.TEXTURE1);
	g.position.bind(gl.TEXTURE2);
	g.normal.bind(gl.TEXTURE3);
	g.emissive.bind(gl.TEXTURE4);
	const dirt = Resources.get("system/dirt.webp");
	dirt.bind(gl.TEXTURE5);
	Shaders.postProcessing.bind();
	Shaders.postProcessing.setInt("doFXAA", Settings.doFXAA);
	Shaders.postProcessing.setInt("colorBuffer", 0);
	Shaders.postProcessing.setInt("lightBuffer", 1);
	Shaders.postProcessing.setInt("positionBuffer", 2);
	Shaders.postProcessing.setInt("normalBuffer", 3);
	Shaders.postProcessing.setInt("emissiveBuffer", 4);
	Shaders.postProcessing.setInt("dirtBuffer", 5);
	Shaders.postProcessing.setVec2("viewportSize", [
		Context.width(),
		Context.height(),
	]);
	Shaders.postProcessing.setFloat("emissiveMult", Settings.emissiveMult);
	Shaders.postProcessing.setFloat("gamma", Settings.gamma);
	//Shaders.postProcessing.setFloat("noiseAmmount", Settings.noiseAmmount);
	//Shaders.postProcessing.setFloat("noiseSpeed", Settings.noiseSpeed);
	//Shaders.postProcessing.setFloat("noiseTime", performance.now());

	screenQuad.renderSingle();

	Shader.unBind();
	Texture.unBind(gl.TEXTURE5);
	Texture.unBind(gl.TEXTURE0);
	Texture.unBind(gl.TEXTURE1);
	Texture.unBind(gl.TEXTURE2);
	Texture.unBind(gl.TEXTURE3);
	Texture.unBind(gl.TEXTURE4);
};

window.addEventListener(
	"resize",
	() => {
		Context.resize();
		resize(Context.width(), Context.height());
	},
	false,
);
Utils.dispatchEvent("resize");

const Renderer = {
	render() {
		worldGeomPass();
		shadowPass();
		fpsGeomPass();
		lightingPass();
		emissiveBlurPass();
		postProcessingPass();
	},
};

export { Renderer as default };
