import { mat4, quat } from "../dependencies/gl-matrix.js";
import { Entity, EntityTypes } from "./entity.js";
import Resources from "./resources.js";
import { Shaders } from "./shaders.js";

class MeshEntity extends Entity {
	constructor(position, name, updateCallback, scale = 1) {
		super(EntityTypes.MESH, updateCallback);
		this.mesh = Resources.get(name);
		this.castShadow = false;
		this.shadowHeight = 1;
		mat4.translate(this.base_matrix, this.base_matrix, position);
		mat4.scale(this.base_matrix, this.base_matrix, [scale, scale, scale]);
	}

	render() {
		if (!this.visible) return;
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		Shaders.geometry.setMat4("matWorld", m);
		this.mesh.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		Shaders.debug.setMat4("matWorld", m);
		this.mesh.renderWireFrame();
	}

	renderShadow() {
		if (!this.visible) return;
		if (!this.castShadow) return;
		const m = mat4.create();
		mat4.copy(m, this.base_matrix);
		const q = quat.create();
		mat4.getRotation(q, this.ani_matrix);
		const rm = mat4.create();
		mat4.fromQuat(rm, q);
		mat4.translate(m, m, [0, this.shadowHeight, 0]);
		mat4.scale(m, m, [1, 0.001, 1]);
		mat4.multiply(m, m, rm);
		Shaders.entityShadows.setMat4("matWorld", m);
		this.mesh.renderSingle(false);
	}

	updateBoundingVolume() {
		// Get the mesh's transformed bounding box
		const worldMatrix = mat4.create();
		mat4.multiply(worldMatrix, this.base_matrix, this.ani_matrix);
		this.boundingBox = this.mesh.boundingBox?.transform(worldMatrix);
	}
}

export default MeshEntity;
