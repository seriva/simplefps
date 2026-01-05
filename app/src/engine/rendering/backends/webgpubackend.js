import RenderBackend from "./renderbackend.js";

class WebGPUBackend extends RenderBackend {
	constructor() {
		super();
		this.device = null;
		this.context = null;
	}

	async init(_canvas) {
		if (!navigator.gpu) return false;
		return false; // Not implemented yet
	}

	isWebGPU() {
		return true;
	}
}

export default WebGPUBackend;
