import { mat4, quat } from "../../dependencies/gl-matrix.js";
import BoundingBox from "../core/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import Physics from "../systems/physics.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";
import Scene from "./scene.js";

const _MAX_RAYCAST_DISTANCE = 200;

// Reusable temporaries to avoid per-frame allocations
const _tempMatrix = mat4.create();
const _tempPos = new Float32Array(3);
const _tempScale = new Float32Array(3);
const _tempShadowPos = new Float32Array(3);
const _tempShadowScale = new Float32Array(3);
const _tempQuat1 = quat.create();
const _tempQuat2 = quat.create();
const _tempQuat3 = quat.create();
const _tempProbeColor = new Float32Array(3);

class MeshEntity extends Entity {
	constructor(position, name, updateCallback, scale = 1) {
		super(EntityTypes.MESH, updateCallback);
		this.mesh = Resources.get(name);
		this.castShadow = false;
		this.shadowHeight = null; // null = needs calculation, undefined = no ground found
		mat4.translate(this.base_matrix, this.base_matrix, position);
		mat4.scale(this.base_matrix, this.base_matrix, [scale, scale, scale]);
	}

	setRotation(rotation) {
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

	calculateShadowHeight() {
		mat4.getTranslation(_tempPos, this.base_matrix);

		const result = Physics.raycast(
			_tempPos[0],
			_tempPos[1] + 1.0,
			_tempPos[2],
			_tempPos[0],
			_tempPos[1] - _MAX_RAYCAST_DISTANCE,
			_tempPos[2],
		);

		if (result.hasHit) {
			this.shadowHeight = result.hitPointWorld.y;
		} else {
			this.shadowHeight = undefined;
		}
	}

	render(filter = null, shader = Shaders.geometry) {
		if (!this.visible) return;
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		// Sample Light Grid for ambient lighting
		mat4.getTranslation(_tempPos, _tempMatrix);
		_tempPos[1] += 32.0;
		Scene.getAmbient(_tempPos, _tempProbeColor);
		shader.setVec3("uProbeColor", _tempProbeColor);

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

		// Auto-calculate shadow height if not yet done
		if (this.shadowHeight === null) {
			this.calculateShadowHeight();
		}

		if (this.shadowHeight === undefined) return; // No shadow if no ground

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
		this.physicsBody = null;
	}
}

export default MeshEntity;
