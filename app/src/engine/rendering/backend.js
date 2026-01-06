import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import Utils from "../utils/utils.js";
import WebGLBackend from "./backends/webglbackend.js";
import WebGPUBackend from "./backends/webgpubackend.js";

// Global backend instance - prefer WebGPU if enabled and available
let _defaultBackend;
if (Settings.useWebGPU && navigator.gpu) {
	_defaultBackend = new WebGPUBackend();
	Console.log("Using WebGPU backend");
} else {
	_defaultBackend = new WebGLBackend();
	Console.log("Using WebGL backend");
}
_defaultBackend.init();

export const Backend = _defaultBackend;

// Console command for render scale
Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	Utils.dispatchEvent("resize");
});
