import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import Utils from "../utils/utils.js";
import WebGLBackend from "./backends/WebGLBackend.js";

// Global backend instance
export let Backend = null;

// Initialize WebGL backend synchronously to maintain backward compatibility
const _defaultBackend = new WebGLBackend();
_defaultBackend.init(); // Auto-creates canvas and context
Backend = _defaultBackend;

// Export legacy WebGL objects for backward compatibility
const gl = _defaultBackend.getGL();
const afExt = _defaultBackend.getAnisotropicExt();

// ============================================================================
// Public Context API
// ============================================================================

const _initContext = async (preferWebGPU = true) => {
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
					Backend.dispose(); // Cleanup WebGL
					Backend = gpuBackend;
					return Backend;
				}
			}
		} catch (e) {
			Console.warn(`Failed to initialize WebGPU: ${e.message}`);
		}
	}

	// Fallback/Default is already WebGL (initialized synchronously)
	Console.log("Using WebGL2 backend");
	return Backend;
};

// ============================================================================
// Legacy Context API Wrapper
// ============================================================================

const _resize = () => {
	if (Backend) {
		Backend.resize();
	}
};

// Console command
Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	Utils.dispatchEvent("resize");
});

export { afExt, gl };
