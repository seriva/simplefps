import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { WebGLBackend } from "./webgl/webglbackend.js";
import { WebGPUBackend } from "./webgpu/webgpubackend.js";

let _resolved = null;

const _bindMethods = (instance) => {
	let proto = Object.getPrototypeOf(instance);
	while (proto && proto !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (key === "constructor" || Object.hasOwn(instance, key)) continue;
			const desc = Object.getOwnPropertyDescriptor(proto, key);
			if (desc && typeof desc.value === "function") {
				instance[key] = desc.value.bind(instance);
			}
		}
		proto = Object.getPrototypeOf(proto);
	}
};

export const Backend = {};

const _flattenBackend = (resolved) => {
	_bindMethods(resolved);

	let current = resolved;
	while (current && current !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(current)) {
			if (key === "constructor" || key in Backend) continue;

			const desc = Object.getOwnPropertyDescriptor(current, key);
			if (!desc) continue;

			if (desc.get || desc.set) {
				Object.defineProperty(Backend, key, {
					get: desc.get ? desc.get.bind(resolved) : undefined,
					set: desc.set ? desc.set.bind(resolved) : undefined,
					enumerable: desc.enumerable,
					configurable: true,
				});
			} else if (typeof desc.value === "function") {
				Backend[key] = desc.value.bind(resolved);
			} else {
				Backend[key] = desc.value;
			}
		}
		current = Object.getPrototypeOf(current);
	}
};

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
			_flattenBackend(_resolved);
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
	_flattenBackend(_resolved);
})();
