import Console from "../systems/console.js";
import { css } from "../utils/reactive.js";
import Utils from "../utils/utils.js";
import Settings from "./settings.js";

// Private canvas setup
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

const _canvas = document.createElement("canvas");
_canvas.id = "context";
_canvas.className = _canvasStyle;
document.body.appendChild(_canvas);

// Private WebGL extensions
const _REQUIRED_EXTENSIONS = {
	EXT_color_buffer_float: "EXT_color_buffer_float",
};

const _OPTIONAL_EXTENSIONS = {
	anisotropic: [
		"EXT_texture_filter_anisotropic",
		"MOZ_EXT_texture_filter_anisotropic",
		"WEBKIT_EXT_texture_filter_anisotropic",
	],
};

const _checkWebGLCapabilities = (gl) => {
	// Check required extensions
	for (const [key, ext] of Object.entries(_REQUIRED_EXTENSIONS)) {
		const extension = gl.getExtension(ext);
		if (!extension) {
			Console.error(`Required WebGL extension ${ext} is not supported`);
		}
		gl[key] = extension;
	}

	// Check optional extensions
	const afExt = _OPTIONAL_EXTENSIONS.anisotropic.reduce(
		(ext, name) => ext || gl.getExtension(name),
		null,
	);

	return { afExt };
};

// Private WebGL context initialization
let _afExt = null;

const gl = _canvas.getContext("webgl2", {
	premultipliedAlpha: false,
	antialias: false,
	preserveDrawingBuffer: true,
});
if (!gl) {
	Console.error("Failed to initialize WebGL 2.0 context");
}

try {
	const capabilities = _checkWebGLCapabilities(gl);
	_afExt = capabilities.afExt;

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
		`Max anisotropic filtering: ${_afExt ? gl.getParameter(_afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : "Not supported"}`,
	);
} catch (error) {
	Console.error(`WebGL initialization failed: ${error.message}`);
}

// Private helper functions
const _getDevicePixelRatio = () => window.devicePixelRatio || 1;

const _width = () =>
	Math.floor(
		gl.canvas.clientWidth * _getDevicePixelRatio() * Settings.renderScale,
	);

const _height = () =>
	Math.floor(
		gl.canvas.clientHeight * _getDevicePixelRatio() * Settings.renderScale,
	);

const _aspectRatio = () => _width() / _height();

const _resize = () => {
	gl.canvas.width = _width();
	gl.canvas.height = _height();
	gl.viewport(0, 0, _width(), _height());
};

// Console command
Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	Utils.dispatchEvent("resize");
});

// Public Context API
const Context = {
	canvas: _canvas,
	width: _width,
	height: _height,
	aspectRatio: _aspectRatio,
	resize: _resize,
};

const afExt = _afExt;

export { gl, afExt, Context };
