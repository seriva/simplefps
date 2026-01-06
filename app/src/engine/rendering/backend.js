import Settings from "../core/settings.js";
import Console from "../systems/console.js";
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

// Initialize backend (async for WebGPU, sync for WebGL)
const _initPromise = Promise.resolve(_defaultBackend.init());

export const Backend = _defaultBackend;

// Wait for backend to be ready before using it
export const backendReady = _initPromise;
