import Settings from "../core/settings.js";
import Console from "../systems/console.js";
import WebGLBackend from "./webgl/webglbackend.js";
import WebGPUBackend from "./webgpu/webgpubackend.js";

// Global backend instance - prefer WebGPU if enabled and available
let _defaultBackend;

if (Settings.useWebGPU && navigator.gpu) {
	_defaultBackend = new WebGPUBackend();
	_defaultBackend.name = "WebGPU";
	Console.log("[Backend] Using WebGPU backend");
} else {
	_defaultBackend = new WebGLBackend();
	_defaultBackend.name = "WebGL";
	Console.log("[Backend] Using WebGL backend");
}

// Initialize backend (async for WebGPU, sync for WebGL)
const _initPromise = Promise.resolve(_defaultBackend.init());

export const Backend = _defaultBackend;
export const backendReady = _initPromise;
