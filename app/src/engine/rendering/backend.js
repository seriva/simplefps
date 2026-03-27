import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { WebGLBackend } from "./webgl/webglbackend.js";
import { WebGPUBackend } from "./webgpu/webgpubackend.js";

// The resolved backend instance — populated by _initPromise before backendReady resolves.
let _resolved = null;

// Transparent proxy: all property accesses / method calls are forwarded to
// whichever backend was ultimately selected. This lets the rest of the codebase
// keep `import { Backend } from "…/backend.js"` unchanged.
export const Backend = new Proxy(
	{},
	{
		get(_target, prop) {
			return _resolved?.[prop];
		},
		set(_target, prop, value) {
			if (_resolved) _resolved[prop] = value;
			return true;
		},
	},
);

// Attempt to initialise a backend, falling back from WebGPU → WebGL when
// WebGPU is requested but fails to initialise (adapter/device unavailable,
// context creation error, etc.)
export const backendReady = (async () => {
	if (Settings.useWebGPU && navigator.gpu) {
		const webgpu = new WebGPUBackend();
		webgpu.name = "WebGPU";
		Console.log("[Backend] Trying WebGPU backend…");

		let ok = false;
		try {
			ok = await webgpu.init();
		} catch (e) {
			Console.warn(`[Backend] WebGPU init threw: ${e?.message ?? e}`);
		}

		if (ok) {
			Console.log("[Backend] Using WebGPU backend");
			_resolved = webgpu;
			return;
		}

		// WebGPU unavailable — clean up any DOM canvas it inserted, and reset
		// the stored setting so the UI reflects what's actually running.
		Console.warn("[Backend] WebGPU unavailable, falling back to WebGL");
		webgpu.dispose();
		Settings.useWebGPU = false;
		Settings.save();
	}

	const webgl = new WebGLBackend();
	webgl.name = "WebGL";
	Console.log("[Backend] Using WebGL backend");
	const webglOk = await webgl.init();
	if (!webglOk) throw new Error("WebGL initialization failed");
	_resolved = webgl;
})();
