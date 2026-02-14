import { quat, vec3 } from "../../dependencies/gl-matrix.js";

const _tmpVec3 = vec3.create();

/**
 * Transform
 */
export class Transform {
	constructor(options = {}) {
		this.position = vec3.create();
		this.quaternion = quat.create();

		if (options.position) {
			vec3.copy(this.position, options.position);
		}
		if (options.quaternion) {
			quat.copy(this.quaternion, options.quaternion);
		}
	}

	pointToLocal(worldPoint, result) {
		return Transform.pointToLocalFrame(
			this.position,
			this.quaternion,
			worldPoint,
			result,
		);
	}

	pointToWorld(localPoint, result) {
		return Transform.pointToWorldFrame(
			this.position,
			this.quaternion,
			localPoint,
			result,
		);
	}

	static pointToLocalFrame(
		position,
		quaternion,
		worldPoint,
		result = vec3.create(),
	) {
		vec3.sub(result, worldPoint, position);
		quat.conjugate(tmpQuat, quaternion);
		vec3.transformQuat(result, result, tmpQuat);
		return result;
	}

	static pointToWorldFrame(
		position,
		quaternion,
		localPoint,
		result = vec3.create(),
	) {
		vec3.transformQuat(result, localPoint, quaternion);
		vec3.add(result, result, position);
		return result;
	}

	static vectorToWorldFrame(quaternion, localVector, result = vec3.create()) {
		vec3.transformQuat(result, localVector, quaternion);
		return result;
	}

	static vectorToLocalFrame(
		_position,
		quaternion,
		worldVector,
		result = vec3.create(),
	) {
		quat.conjugate(tmpQuat, quaternion);
		vec3.transformQuat(result, worldVector, tmpQuat);
		return result;
	}
}

const tmpQuat = quat.create();
