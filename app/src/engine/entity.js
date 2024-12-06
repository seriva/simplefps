import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import BoundingBox from './boundingbox.js';

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
		if (this.updateCallback) {
			this.updateCallback(this, frametime);
		}

		// Update our bounding volume
		this.updateBoundingVolume();
	}

	updateBoundingVolume() {
		 // Virtual function to be overridden by child classes
	}

	renderBoundingBox() {
		if (this.boundingBox && this.visible) {
			this.boundingBox.render();
		}
	}
}

export { Entity, EntityTypes };
