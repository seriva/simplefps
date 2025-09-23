import { mat4 } from "../dependencies/gl-matrix.js";
import { gl } from "./context.js";
import { Shaders } from "./shaders.js";
import { boundingBox } from "./shapes.js";

const EntityTypes = Object.freeze({
	MESH: 1,
	FPS_MESH: 2,
	DIRECTIONAL_LIGHT: 3,
	POINT_LIGHT: 4,
	SPOT_LIGHT: 5,
	SKYBOX: 6,
});

class Entity {
	constructor(type, updateCallback) {
		this.type = type;
		this.data = {};
		this.updateCallback = updateCallback;
		this.animationTime = 0;
		this.visible = true;
		this.base_matrix = mat4.create();
		this.ani_matrix = mat4.create();
		mat4.identity(this.base_matrix);
		mat4.identity(this.ani_matrix);
		this.boundingBox = null;
	}

	update(frametime) {
		if (!this.visible) {
			return;
		}

		// update entity
		this.updateCallback?.(this, frametime);

		// Update our bounding volume
		this.updateBoundingVolume();
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

	renderBoundingBox() {
		if (!this.boundingBox || !this.visible) return;

		Shaders.debug.setMat4("matWorld", this.boundingBox.transformMatrix);
		boundingBox.renderSingle(true, gl.LINES);
	}
}

export { Entity, EntityTypes };
