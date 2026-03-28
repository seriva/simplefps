import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { WebGLBackend } from "./webgl/webglbackend.js";
import { WebGPUBackend } from "./webgpu/webgpubackend.js";

// The resolved backend instance — populated by _initPromise before backendReady resolves.
let _resolved = null;

// Pre-bind all prototype methods to the instance so that when the Proxy
// returns a method and it's called (with `this = Proxy`), all `this.xxx`
// accesses inside the method body hit _resolved directly rather than
// re-entering the Proxy trap on every property read.
const _bindMethods = (instance) => {
	let proto = Object.getPrototypeOf(instance);
	while (proto && proto !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			// Only bind if not already bound from a more-derived class —
			// otherwise base-class stubs would overwrite concrete implementations.
			if (
				key !== "constructor" &&
				typeof proto[key] === "function" &&
				!Object.prototype.hasOwnProperty.call(instance, key)
			) {
				instance[key] = proto[key].bind(instance);
			}
		}
		proto = Object.getPrototypeOf(proto);
	}
};

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
			_bindMethods(_resolved);
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
	_bindMethods(_resolved);
})();
