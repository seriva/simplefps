import { mat4 } from "../dependencies/gl-matrix.js";

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
		this.parent = null;
		this.children = [];
		this.updateCallback = updateCallback;
		this.animationTime = 0;
		this.visible = true;
		this.base_matrix = mat4.create();
		this.ani_matrix = mat4.create();
		mat4.identity(this.base_matrix);
		mat4.identity(this.ani_matrix);
	}

	addChild(entity) {
		if (!(entity instanceof Entity)) {
			throw new TypeError('Child must be an Entity instance');
		}
		entity.parent = this;
		this.children.push(entity);
	}

	removeChild(entity) {
		const index = this.children.indexOf(entity);
		if (index !== -1) {
			entity.parent = null;
			this.children.splice(index, 1);
		}
	}

	getChildren(type) {
		let selection = [];
		for (const entity of this.children) {
			if (entity.type === type) {
				selection.push(entity);
			}
			selection = selection.concat(entity.getChildren(type));
		}
		return selection;
	}

	update(frametime) {
		if (!this.visible) {
			return;
		}

		// update entity
		if (this.updateCallback) {
			this.updateCallback(this, frametime);
		}

		// update entity children
		for (const entity of this.children) {
			entity.update(frametime);
		}
	}
}

export { Entity, EntityTypes };
