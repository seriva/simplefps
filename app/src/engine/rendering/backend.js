import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { WebGLBackend } from "./webgl/webglbackend.js";
import { WebGPUBackend } from "./webgpu/webgpubackend.js";

let _resolved = null;

const _bindMethods = (instance) => {
	let proto = Object.getPrototypeOf(instance);
	while (proto && proto !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (
				key !== "constructor" &&
				typeof proto[key] === "function" &&
				!Object.hasOwn(instance, key)
			) {
				instance[key] = proto[key].bind(instance);
			}
		}
		proto = Object.getPrototypeOf(proto);
	}
};

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
