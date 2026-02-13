import { quat, vec3 } from "../../dependencies/gl-matrix.js";

/**
 * Axis aligned bounding box class.
 */
export class AABB {
	constructor(options = {}) {
		this.lowerBound = vec3.create();
		this.upperBound = vec3.create();

		if (options.lowerBound) {
			vec3.copy(this.lowerBound, options.lowerBound);
		}
		if (options.upperBound) {
			vec3.copy(this.upperBound, options.upperBound);
		}
	}

	setFromPoints(points, position, quaternion, skinSize) {
		const l = this.lowerBound;
		const u = this.upperBound;

		// Set to first point
		if (points.length > 0) {
			const p = points[0];
			if (quaternion) {
				vec3.transformQuat(l, p, quaternion);
			} else {
				vec3.copy(l, p);
			}
			vec3.copy(u, l);
		} else {
			vec3.set(l, 0, 0, 0);
			vec3.set(u, 0, 0, 0);
		}

		for (let i = 1; i < points.length; i++) {
			let p = points[i];
			if (quaternion) {
				vec3.transformQuat(tmpVec3, p, quaternion);
				p = tmpVec3;
			}

			if (p[0] > u[0]) u[0] = p[0];
			if (p[0] < l[0]) l[0] = p[0];
			if (p[1] > u[1]) u[1] = p[1];
			if (p[1] < l[1]) l[1] = p[1];
			if (p[2] > u[2]) u[2] = p[2];
			if (p[2] < l[2]) l[2] = p[2];
		}

		if (position) {
			vec3.add(l, l, position);
			vec3.add(u, u, position);
		}

		if (skinSize) {
			l[0] -= skinSize;
			l[1] -= skinSize;
			l[2] -= skinSize;
			u[0] += skinSize;
			u[1] += skinSize;
			u[2] += skinSize;
		}
		return this;
	}

	copy(aabb) {
		vec3.copy(this.lowerBound, aabb.lowerBound);
		vec3.copy(this.upperBound, aabb.upperBound);
		return this;
	}

	clone() {
		return new AABB().copy(this);
	}

	extend(aabb) {
		vec3.min(this.lowerBound, this.lowerBound, aabb.lowerBound);
		vec3.max(this.upperBound, this.upperBound, aabb.upperBound);
	}

	overlaps(aabb) {
		const l1 = this.lowerBound;
		const u1 = this.upperBound;
		const l2 = aabb.lowerBound;
		const u2 = aabb.upperBound;

		//      l2        u2
		//      |---------|
		// |--------|
		// l1       u1

		const overlapsX =
			(l2[0] <= u1[0] && u1[0] <= u2[0]) || (l1[0] <= u2[0] && u2[0] <= u1[0]);
		const overlapsY =
			(l2[1] <= u1[1] && u1[1] <= u2[1]) || (l1[1] <= u2[1] && u2[1] <= u1[1]);
		const overlapsZ =
			(l2[2] <= u1[2] && u1[2] <= u2[2]) || (l1[2] <= u2[2] && u2[2] <= u1[2]);

		return overlapsX && overlapsY && overlapsZ;
	}

	volume() {
		const l = this.lowerBound;
		const u = this.upperBound;
		return (u[0] - l[0]) * (u[1] - l[1]) * (u[2] - l[2]);
	}

	contains(aabb) {
		const l1 = this.lowerBound;
		const u1 = this.upperBound;
		const l2 = aabb.lowerBound;
		const u2 = aabb.upperBound;

		return (
			l1[0] <= l2[0] &&
			u1[0] >= u2[0] &&
			l1[1] <= l2[1] &&
			u1[1] >= u2[1] &&
			l1[2] <= l2[2] &&
			u1[2] >= u2[2]
		);
	}

	getCorners(a, b, c, d, e, f, g, h) {
		const l = this.lowerBound;
		const u = this.upperBound;

		vec3.copy(a, l);
		vec3.set(b, u[0], l[1], l[2]);
		vec3.set(c, u[0], u[1], l[2]);
		vec3.set(d, l[0], u[1], u[2]);
		vec3.set(e, u[0], l[1], u[2]);
		vec3.set(f, l[0], u[1], l[2]);
		vec3.set(g, l[0], l[1], u[2]);
		vec3.copy(h, u);
	}

	toLocalFrame(frame, target) {
		const corners = transformIntoFrame_corners;
		const a = corners[0];
		const b = corners[1];
		const c = corners[2];
		const d = corners[3];
		const e = corners[4];
		const f = corners[5];
		const g = corners[6];
		const h = corners[7];

		this.getCorners(a, b, c, d, e, f, g, h);

		for (let i = 0; i !== 8; i++) {
			const corner = corners[i];
			frame.pointToLocal(corner, corner);
		}

		return target.setFromPoints(corners);
	}

	toWorldFrame(frame, target) {
		const corners = transformIntoFrame_corners;
		const a = corners[0];
		const b = corners[1];
		const c = corners[2];
		const d = corners[3];
		const e = corners[4];
		const f = corners[5];
		const g = corners[6];
		const h = corners[7];

		this.getCorners(a, b, c, d, e, f, g, h);

		for (let i = 0; i !== 8; i++) {
			const corner = corners[i];
			frame.pointToWorld(corner, corner);
		}

		return target.setFromPoints(corners);
	}
}

const tmpVec3 = vec3.create();
const transformIntoFrame_corners = [
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
];

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
		position,
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
