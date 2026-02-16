import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import Camera from "../systems/camera.js";

// ============================================================================
// Private state (Module-scoped temporary variables)
// ============================================================================

const _cornersBuffer = new Float32Array(24);
const _transformedMin = vec3.create();
const _transformedMax = vec3.create();
const _tempCenter = vec3.create();
const _tempDimensions = vec3.create();
const _tempTransformMat = mat4.create();
const _tempCorner = vec3.create();

// Temps for isVisible
const _p = vec3.create();
const _n = vec3.create();

// Corners for frame transformation
const _transformIntoFrameCorners = [
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
	vec3.create(),
];

// ============================================================================
// Public BoundingBox Class
// ============================================================================

class BoundingBox {
	constructor(min, max) {
		this.min = vec3.create();
		this.max = vec3.create();
		if (min) vec3.copy(this.min, min);
		if (max) vec3.copy(this.max, max);
	}

	static fromPoints(points) {
		const min = vec3.fromValues(Infinity, Infinity, Infinity);
		const max = vec3.fromValues(-Infinity, -Infinity, -Infinity);

		for (let i = 0; i < points.length; i += 3) {
			const x = points[i],
				y = points[i + 1],
				z = points[i + 2];
			min[0] = Math.min(min[0], x);
			min[1] = Math.min(min[1], y);
			min[2] = Math.min(min[2], z);
			max[0] = Math.max(max[0], x);
			max[1] = Math.max(max[1], y);
			max[2] = Math.max(max[2], z);
		}
		return new BoundingBox(min, max);
	}

	set(min, max) {
		vec3.copy(this.min, min);
		vec3.copy(this.max, max);
		return this;
	}

	copy(aabb) {
		vec3.copy(this.min, aabb.min);
		vec3.copy(this.max, aabb.max);
		return this;
	}

	clone() {
		return new BoundingBox(this.min, this.max);
	}

	setFromPoints(points) {
		const l = this.min,
			u = this.max;
		if (points.length > 0) {
			vec3.copy(l, points[0]);
			vec3.copy(u, l);
		} else {
			vec3.set(l, 0, 0, 0);
			vec3.set(u, 0, 0, 0);
		}

		for (let i = 1; i < points.length; i++) {
			const p = points[i];
			if (p[0] > u[0]) u[0] = p[0];
			if (p[0] < l[0]) l[0] = p[0];
			if (p[1] > u[1]) u[1] = p[1];
			if (p[1] < l[1]) l[1] = p[1];
			if (p[2] > u[2]) u[2] = p[2];
			if (p[2] < l[2]) l[2] = p[2];
		}
		return this;
	}

	overlaps(aabb) {
		const l1 = this.min,
			u1 = this.max,
			l2 = aabb.min,
			u2 = aabb.max;
		return (
			((l2[0] <= u1[0] && u1[0] <= u2[0]) ||
				(l1[0] <= u2[0] && u2[0] <= u1[0])) &&
			((l2[1] <= u1[1] && u1[1] <= u2[1]) ||
				(l1[1] <= u2[1] && u2[1] <= u1[1])) &&
			((l2[2] <= u1[2] && u1[2] <= u2[2]) || (l1[2] <= u2[2] && u2[2] <= u1[2]))
		);
	}

	contains(aabb) {
		const l1 = this.min,
			u1 = this.max,
			l2 = aabb.min,
			u2 = aabb.max;
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
		const l = this.min,
			u = this.max;
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
		const corners = _transformIntoFrameCorners;
		this.getCorners(...corners);
		for (let i = 0; i < 8; i++) frame.pointToLocal(corners[i], corners[i]);
		return target.setFromPoints(corners);
	}

	toWorldFrame(frame, target) {
		const corners = _transformIntoFrameCorners;
		this.getCorners(...corners);
		for (let i = 0; i < 8; i++) frame.pointToWorld(corners[i], corners[i]);
		return target.setFromPoints(corners);
	}

	get center() {
		vec3.add(_tempCenter, this.min, this.max);
		vec3.scale(_tempCenter, _tempCenter, 0.5);
		return _tempCenter;
	}

	get dimensions() {
		vec3.subtract(_tempDimensions, this.max, this.min);
		return _tempDimensions;
	}

	get transformMatrix() {
		mat4.identity(_tempTransformMat);
		mat4.translate(_tempTransformMat, _tempTransformMat, this.center);
		mat4.scale(_tempTransformMat, _tempTransformMat, this.dimensions);
		return _tempTransformMat;
	}

	transform(matrix) {
		return this.transformInto(matrix, new BoundingBox());
	}

	transformInto(matrix, out) {
		const corners = _cornersBuffer;
		const corner = _tempCorner;

		for (let i = 0; i < 8; i++) {
			vec3.set(
				corner,
				i & 1 ? this.max[0] : this.min[0],
				i & 2 ? this.max[1] : this.min[1],
				i & 4 ? this.max[2] : this.min[2],
			);
			vec3.transformMat4(corner, corner, matrix);
			corners[i * 3] = corner[0];
			corners[i * 3 + 1] = corner[1];
			corners[i * 3 + 2] = corner[2];
		}

		const tMin = _transformedMin,
			tMax = _transformedMax;
		tMin[0] = tMax[0] = corners[0];
		tMin[1] = tMax[1] = corners[1];
		tMin[2] = tMax[2] = corners[2];

		for (let i = 3; i < 24; i += 3) {
			tMin[0] = Math.min(tMin[0], corners[i]);
			tMin[1] = Math.min(tMin[1], corners[i + 1]);
			tMin[2] = Math.min(tMin[2], corners[i + 2]);
			tMax[0] = Math.max(tMax[0], corners[i]);
			tMax[1] = Math.max(tMax[1], corners[i + 1]);
			tMax[2] = Math.max(tMax[2], corners[i + 2]);
		}

		return out.set(tMin, tMax);
	}

	isVisible() {
		// Use dedicated temps _p and _n (no allocation)
		const p = _p;
		const planes = Camera.frustumPlanesArray;

		for (let i = 0; i < 6; i++) {
			const plane = planes[i];
			// Find the point on the AABB furthest in the direction of the plane normal
			p[0] = plane[0] > 0 ? this.max[0] : this.min[0];
			p[1] = plane[1] > 0 ? this.max[1] : this.min[1];
			p[2] = plane[2] > 0 ? this.max[2] : this.min[2];

			// If that point is behind the plane, the entire AABB is outside
			if (vec3.dot(p, plane) + plane[3] < 0) {
				return false;
			}
		}
		return true;
	}
}

export default BoundingBox;
