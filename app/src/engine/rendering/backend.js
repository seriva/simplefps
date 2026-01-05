import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import Utils from "../utils/utils.js";
import WebGLBackend from "./backends/webglbackend.js";

// Global backend instance
const _defaultBackend = new WebGLBackend();
_defaultBackend.init();

export const Backend = _defaultBackend;

// Console command for render scale
Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	Utils.dispatchEvent("resize");
});
