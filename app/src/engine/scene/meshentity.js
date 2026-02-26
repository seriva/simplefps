import { mat4 } from "../../dependencies/gl-matrix.js";
import BoundingBox from "../physics/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import Console from "../systems/console.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// Reusable temporaries to avoid per-frame allocations
const _tempMatrix = mat4.create();

class MeshEntity extends Entity {
	constructor(position, name, updateCallback, scale = 1) {
		super(EntityTypes.MESH, updateCallback);
		this.mesh = Resources.get(name);
		this.castShadow = false;
		this.isStatic = false;
		this.shadowHeight = null; // null = needs calculation, undefined = no ground found
		mat4.translate(this.base_matrix, this.base_matrix, position);
		mat4.scale(this.base_matrix, this.base_matrix, [scale, scale, scale]);
	}

	setRotation(rotation) {
		if (this.isStatic) {
			Console.warn("Cannot transform a static MeshEntity");
			return;
		}
		mat4.rotateX(
			this.base_matrix,
			this.base_matrix,
			(rotation[0] * Math.PI) / 180,
		);
		mat4.rotateY(
			this.base_matrix,
			this.base_matrix,
			(rotation[1] * Math.PI) / 180,
		);
		mat4.rotateZ(
			this.base_matrix,
			this.base_matrix,
			(rotation[2] * Math.PI) / 180,
		);
	}

	render(probeColor, filter = null, shader = Shaders.geometry) {
		if (!this.visible) return;
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		shader.setVec3("uProbeColor", probeColor);
		shader.setMat4("matWorld", _tempMatrix);
		this.mesh.renderSingle(true, null, filter, shader);
	}

	renderWireFrame() {
		if (!this.visible) return;
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		Shaders.debug.setMat4("matWorld", _tempMatrix);
		this.mesh.renderWireFrame();
	}

	renderShadow() {
		if (!this.visible) return;
		if (!this.castShadow) return;
		if (this.shadowHeight === null || this.shadowHeight === undefined) return;

		// 1. Calculate the standard World Matrix (apply base and ani)
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		// 2. Squash the model Y axis (World Space)
		// We flatten the Y component of the 3 basis vectors
		_tempMatrix[1] *= 0.1; // X-axis Y component
		_tempMatrix[5] *= 0.1; // Y-axis Y component
		_tempMatrix[9] *= 0.1; // Z-axis Y component

		// 3. Translate to the shadow height (World Space)
		// Overwrite the Y position directly
		_tempMatrix[13] = this.shadowHeight;

		Shaders.entityShadows.setMat4("matWorld", _tempMatrix);
		this.mesh.renderSingle(false);
	}

	updateBoundingVolume() {
		if (!this.mesh?.boundingBox) return;

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		// Reuse bounding box instead of creating new one each frame
		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}
		this.mesh.boundingBox.transformInto(_tempMatrix, this.boundingBox);
	}

	dispose() {
		super.dispose();
		this.mesh = null;
	}
}

export default MeshEntity;
