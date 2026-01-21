import { Physics } from "../engine/core/engine.js";

// Adapter to match PhysicsWorld interface
export class ClientPhysicsAdapter {
	constructor() {
		// Properties expected by SharedPlayerController
		// It might check 'worldMaterial'
		this.worldMaterial = Physics.getWorldMaterial();
	}

	addBody(body) {
		Physics.addBody(body);
	}

	removeBody(body) {
		Physics.removeBody(body);
	}

	addContactMaterial(matA, matB, options) {
		return Physics.addContactMaterial(matA, matB, options);
	}

	raycastClosest(from, to, options, result) {
		// Engine Physics exposes getWorld()
		return Physics.getWorld().raycastClosest(from, to, options, result);
	}
}
