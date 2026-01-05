import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import Utils from "../utils/utils.js";
import WebGLBackend from "./backends/WebGLBackend.js";

// Global backend instance
let _backend = null;

// Initialize WebGL backend synchronously to maintain backward compatibility
const _defaultBackend = new WebGLBackend();
_defaultBackend.init(); // Auto-creates canvas and context
_backend = _defaultBackend;

// Export legacy WebGL objects for backward compatibility
const gl = _defaultBackend.getGL();
const afExt = _defaultBackend.getAnisotropicExt();
const canvas = _defaultBackend.getCanvas();

// ============================================================================
// Public Context API
// ============================================================================

/**
 * Get the current render backend
 * @returns {RenderBackend}
 */
const getBackend = () => _backend;

/**
 * Initialize the rendering context (async)
 * Supports switching to WebGPU if available
 * @param {boolean} preferWebGPU
 */
const initContext = async (preferWebGPU = true) => {
	// If WebGPU is requested and supported
	if (preferWebGPU && navigator.gpu) {
		try {
			// Dynamic import to avoid loading WebGPU code if not needed
			const { default: WebGPUBackend } = await import(
				"./backends/WebGPUBackend.js"
			).catch(() => ({ default: null }));

			if (WebGPUBackend) {
				const gpuBackend = new WebGPUBackend();
				if (await gpuBackend.init(_defaultBackend.getCanvas())) {
					Console.log("Switching to WebGPU backend");
					_backend.dispose(); // Cleanup WebGL
					_backend = gpuBackend;
					return _backend;
				}
			}
		} catch (e) {
			Console.warn(`Failed to initialize WebGPU: ${e.message}`);
		}
	}

	// Fallback/Default is already WebGL (initialized synchronously)
	Console.log("Using WebGL2 backend");
	return _backend;
};

// ============================================================================
// Legacy Context API Wrapper
// ============================================================================

const _resize = () => {
	if (_backend) {
		_backend.resize();
	}
};

// Console command
Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	Utils.dispatchEvent("resize");
});

const Context = {
	canvas: canvas,
	width: () => _backend.getWidth(),
	height: () => _backend.getHeight(),
	aspectRatio: () => _backend.getWidth() / _backend.getHeight(),
	resize: _resize,
};

export { Context, afExt, getBackend, gl, initContext };
