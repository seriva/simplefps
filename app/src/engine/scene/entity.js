import { mat4 } from "../../dependencies/gl-matrix.js";
import { Backend } from "../rendering/backend.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";

const EntityTypes = Object.freeze({
	MESH: 1,
	FPS_MESH: 2,
	DIRECTIONAL_LIGHT: 3,
	POINT_LIGHT: 4,
	SPOT_LIGHT: 5,
	SKYBOX: 6,
	SKINNED_MESH: 7,
});

class Entity {
	constructor(type, updateCallback) {
		this.type = type;
		this.data = {};
		this.updateCallback = updateCallback;
		this.animationTime = 0;
		this.visible = true;
		this.castShadow = true;
		this.receiveShadow = true;

		// Occlusion culling
		this.isOccluder = false; // Is this a large occluder (e.g. wall)?
		this.isVisible = true; // Visibility state from occlusion query (default true)

		this.base_matrix = mat4.create();
		this.ani_matrix = mat4.create();
		this.boundingBox = null;
		this.collider = null;
	}

	update(frametime) {
		if (!this.visible) {
			return;
		}

		// update entity and return the result (for removal signaling)
		const result = this.updateCallback?.(this, frametime);

		// Update our bounding volume
		this.updateBoundingVolume();

		return result;
	}

	updateBoundingVolume() {
		// Virtual function to be overridden by child classes
	}

	render() {
		// Virtual function to be overridden by child classes
	}

	renderWireFrame() {
		// Virtual function to be overridden by child classes
	}

	renderBoundingBox(drawMode = null) {
		if (!this.boundingBox || !this.visible) return;

		Shaders.debug.setMat4("matWorld", this.boundingBox.transformMatrix);
		Shapes.boundingBox.renderSingle(true, drawMode);
	}

	dispose() {
		// Clean up occlusion queries to prevent GPU resource leaks
		if (this._occQueries) {
			for (const query of this._occQueries) {
				Backend.deleteQuery(query);
			}
			this._occQueries = null;
		}

		this.updateCallback = null;
		this.boundingBox = null;
	}
}

export { Entity, EntityTypes };
