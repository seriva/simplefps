import Console from "./console.js";
import DOM from "./dom.js";
import Settings from "./settings.js";
import Utils from "./utils.js";

DOM.css({
	"#context": {
		background: "#000",
		width: "100vw",
		height: "100vh",
		display: "block",
		zIndex: 0,
	},
});

const canvas = DOM.h("canvas#context");
DOM.append(() => canvas);

const REQUIRED_EXTENSIONS = {
	EXT_color_buffer_float: "EXT_color_buffer_float",
};

const OPTIONAL_EXTENSIONS = {
	anisotropic: [
		"EXT_texture_filter_anisotropic",
		"MOZ_EXT_texture_filter_anisotropic",
		"WEBKIT_EXT_texture_filter_anisotropic",
	],
};

const checkWebGLCapabilities = (gl) => {
	// Check required extensions
	for (const [key, ext] of Object.entries(REQUIRED_EXTENSIONS)) {
		const extension = gl.getExtension(ext);
		if (!extension) {
			Console.error(`Required WebGL extension ${ext} is not supported`);
		}
		gl[key] = extension;
	}

	// Check optional extensions
	const afExt = OPTIONAL_EXTENSIONS.anisotropic.reduce(
		(ext, name) => ext || gl.getExtension(name),
		null,
	);

	return { afExt };
};

let afExt = null;

const gl = canvas.domNode.getContext("webgl2", {
	premultipliedAlpha: false,
	antialias: false,
});
if (!gl) {
	Console.error("Failed to initialize WebGL 2.0 context");
}

try {
	const capabilities = checkWebGLCapabilities(gl);
	afExt = capabilities.afExt;

	// Initialize WebGL state
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clearDepth(1.0);

	// Enable depth testing
	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);

	// Enable face culling
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.BACK);

	// Log context information
	Console.log("Initialized context");
	Console.log(`Renderer: ${gl.getParameter(gl.RENDERER)}`);
	Console.log(`Vendor: ${gl.getParameter(gl.VENDOR)}`);
	Console.log(`WebGL version: ${gl.getParameter(gl.VERSION)}`);
	Console.log(`GLSL version: ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`);
	Console.log(
		`Max anisotropic filtering: ${afExt ? gl.getParameter(afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : "Not supported"}`,
	);
} catch (error) {
	Console.error(`WebGL initialization failed: ${error.message}`);
}

const getDevicePixelRatio = () => window.devicePixelRatio || 1;

const width = () =>
	Math.floor(
		gl.canvas.clientWidth * getDevicePixelRatio() * Settings.renderScale,
	);

const height = () =>
	Math.floor(
		gl.canvas.clientHeight * getDevicePixelRatio() * Settings.renderScale,
	);

const aspectRatio = () => width() / height();

const resize = () => {
	gl.canvas.width = width();
	gl.canvas.height = height();
	gl.viewport(0, 0, width(), height());
};

Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	Utils.dispatchEvent("resize");
});

const Context = {
	canvas,
	width,
	height,
	aspectRatio,
	resize,
};

export { gl, afExt, Context };
