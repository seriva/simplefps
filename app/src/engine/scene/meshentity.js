import * as CANNON from "../../dependencies/cannon-es.js";
import { mat4, quat } from "../../dependencies/gl-matrix.js";
import { Shaders } from "../rendering/shaders.js";
import Physics from "../systems/physics.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

// Raycast helpers (reused to avoid GC pressure)
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = {}; // Empty options - hit everything
const _MAX_RAYCAST_DISTANCE = 200; // Maximum distance to search for ground
const _SHADOW_OFFSET = 0.2; // Small offset to prevent z-fighting

// Reusable temporaries to avoid per-frame allocations
const _tempMatrix = mat4.create();
const _tempPos = new Float32Array(3);
const _tempScale = new Float32Array(3);
const _tempShadowPos = new Float32Array(3);
const _tempShadowScale = new Float32Array(3);
const _tempQuat1 = quat.create();
const _tempQuat2 = quat.create();
const _tempQuat3 = quat.create();

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

	/**
	 * Calculate shadow height by raycasting downward to find ground.
	 * Sets shadowHeight to the hit point Y + offset, or undefined if no ground found.
	 */
	calculateShadowHeight() {
		mat4.getTranslation(_tempPos, this.base_matrix);

		_rayFrom.set(_tempPos[0], _tempPos[1], _tempPos[2]);
		_rayTo.set(_tempPos[0], _tempPos[1] - _MAX_RAYCAST_DISTANCE, _tempPos[2]);
		_rayResult.reset();

		Physics.getWorld().raycastClosest(
			_rayFrom,
			_rayTo,
			_rayOptions,
			_rayResult,
		);

		if (_rayResult.hasHit) {
			this.shadowHeight = _rayResult.hitPointWorld.y + _SHADOW_OFFSET;
		} else {
			this.shadowHeight = undefined; // No shadow if no ground
		}
	}

	render(filter = null, shader = Shaders.geometry) {
		if (!this.visible) return;
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
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

		mat4.getTranslation(_tempPos, this.base_matrix);
		mat4.getRotation(_tempQuat1, this.base_matrix);
		mat4.getRotation(_tempQuat2, this.ani_matrix);
		quat.multiply(_tempQuat3, _tempQuat1, _tempQuat2);
		mat4.getScaling(_tempScale, this.base_matrix);

		// Populate shadow pos (use calculated shadow height)
		_tempShadowPos[0] = _tempPos[0];
		_tempShadowPos[1] = this.shadowHeight;
		_tempShadowPos[2] = _tempPos[2];

		// Populate shadow scale (squash Y)
		_tempShadowScale[0] = _tempScale[0];
		_tempShadowScale[1] = 0.001;
		_tempShadowScale[2] = _tempScale[2];

		mat4.fromRotationTranslationScale(
			_tempMatrix,
			_tempQuat3,
			_tempShadowPos,
			_tempShadowScale,
		);

		Shaders.entityShadows.setMat4("matWorld", _tempMatrix);
		this.mesh.renderSingle(false);
	}

	updateBoundingVolume() {
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		this.boundingBox = this.mesh.boundingBox?.transform(_tempMatrix);
	}
}

export default MeshEntity;
