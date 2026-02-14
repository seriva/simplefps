import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import Camera from "../core/camera.js";

class BoundingBox {
	// Increase pool size for better performance in scenes with many boxes
	static #vectorPool = Array(32)
		.fill()
		.map(() => vec3.create());
	static #poolIndex = 0;

	// Reusable buffers for transform() - avoid per-call allocations
	static #cornersBuffer = new Float32Array(24);
	static #transformedMin = vec3.create();
	static #transformedMax = vec3.create();

	// Additional reusable buffers for AABB features
	static #transformIntoFrameCorners = [
		vec3.create(),
		vec3.create(),
		vec3.create(),
		vec3.create(),
		vec3.create(),
		vec3.create(),
		vec3.create(),
		vec3.create(),
	];

	constructor(min, max) {
		this.min = vec3.create();
		this.max = vec3.create();

		if (min) vec3.copy(this.min, min);
		if (max) vec3.copy(this.max, max);
	}

	static #getVector() {
		const vector = BoundingBox.#vectorPool[BoundingBox.#poolIndex];
		BoundingBox.#poolIndex =
			(BoundingBox.#poolIndex + 1) % BoundingBox.#vectorPool.length;
		return vector;
	}

	/**
	 * Creates a BoundingBox from a flat array of coordinates (e.g. [x,y,z, x,y,z, ...])
	 * Use setFromPoints for array of vec3s
	 */
	static fromPoints(points) {
		const min = vec3.fromValues(
			Number.POSITIVE_INFINITY,
			Number.POSITIVE_INFINITY,
			Number.POSITIVE_INFINITY,
		);
		const max = vec3.fromValues(
			Number.NEGATIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		);

		for (let i = 0; i < points.length; i += 3) {
			const x = points[i];
			const y = points[i + 1];
			const z = points[i + 2];
			min[0] = Math.min(min[0], x);
			min[1] = Math.min(min[1], y);
			min[2] = Math.min(min[2], z);
			max[0] = Math.max(max[0], x);
			max[1] = Math.max(max[1], y);
			max[2] = Math.max(max[2], z);
		}

		return new BoundingBox(min, max);
	}

	// Set bounds in-place
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

	// Points is Array of vec3
	setFromPoints(points) {
		const l = this.min;
		const u = this.max;

		// Set to first point
		if (points.length > 0) {
			const p = points[0];
			vec3.copy(l, p);
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

	extend(aabb) {
		vec3.min(this.min, this.min, aabb.min);
		vec3.max(this.max, this.max, aabb.max);
		return this;
	}

	overlaps(aabb) {
		const l1 = this.min;
		const u1 = this.max;
		const l2 = aabb.min;
		const u2 = aabb.max;

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
		return (
			(this.max[0] - this.min[0]) *
			(this.max[1] - this.min[1]) *
			(this.max[2] - this.min[2])
		);
	}

	contains(aabb) {
		const l1 = this.min;
		const u1 = this.max;
		const l2 = aabb.min;
		const u2 = aabb.max;

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
		const l = this.min;
		const u = this.max;

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
		const corners = BoundingBox.#transformIntoFrameCorners;
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
		const corners = BoundingBox.#transformIntoFrameCorners;
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

	// Computed properties
	get center() {
		// Calculate on fly or cache if needed.
		// For now calculating on fly might be safer if min/max are public and mutable
		const c = vec3.create();
		vec3.add(c, this.min, this.max);
		vec3.scale(c, c, 0.5);
		return c;
	}

	get dimensions() {
		const d = vec3.create();
		vec3.subtract(d, this.max, this.min);
		return d;
	}

	get transformMatrix() {
		// This might be expensive if called often, but without dirty flag...
		// Let's create a temp matrix
		const mat = mat4.create();
		const center = this.center;
		const dim = this.dimensions;
		mat4.translate(mat, mat, center);
		mat4.scale(mat, mat, dim);
		return mat;
	}

	transform(matrix) {
		// Use static buffers to avoid per-call allocations
		const corners = BoundingBox.#cornersBuffer;
		const corner = BoundingBox.#getVector();

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

		// Find min and max in one pass - reuse static vectors
		const transformedMin = BoundingBox.#transformedMin;
		const transformedMax = BoundingBox.#transformedMax;
		transformedMin[0] = transformedMax[0] = corners[0];
		transformedMin[1] = transformedMax[1] = corners[1];
		transformedMin[2] = transformedMax[2] = corners[2];

		for (let i = 3; i < 24; i += 3) {
			transformedMin[0] = Math.min(transformedMin[0], corners[i]);
			transformedMin[1] = Math.min(transformedMin[1], corners[i + 1]);
			transformedMin[2] = Math.min(transformedMin[2], corners[i + 2]);
			transformedMax[0] = Math.max(transformedMax[0], corners[i]);
			transformedMax[1] = Math.max(transformedMax[1], corners[i + 1]);
			transformedMax[2] = Math.max(transformedMax[2], corners[i + 2]);
		}

		return new BoundingBox(transformedMin, transformedMax);
	}

	// Transform into an existing BoundingBox (avoids allocation)
	transformInto(matrix, out) {
		const corners = BoundingBox.#cornersBuffer;
		const corner = BoundingBox.#getVector();

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

		const transformedMin = BoundingBox.#transformedMin;
		const transformedMax = BoundingBox.#transformedMax;
		transformedMin[0] = transformedMax[0] = corners[0];
		transformedMin[1] = transformedMax[1] = corners[1];
		transformedMin[2] = transformedMax[2] = corners[2];

		for (let i = 3; i < 24; i += 3) {
			transformedMin[0] = Math.min(transformedMin[0], corners[i]);
			transformedMin[1] = Math.min(transformedMin[1], corners[i + 1]);
			transformedMin[2] = Math.min(transformedMin[2], corners[i + 2]);
			transformedMax[0] = Math.max(transformedMax[0], corners[i]);
			transformedMax[1] = Math.max(transformedMax[1], corners[i + 1]);
			transformedMax[2] = Math.max(transformedMax[2], corners[i + 2]);
		}

		return out.set(transformedMin, transformedMax);
	}

	isVisible() {
		const p = BoundingBox.#getVector();
		const n = BoundingBox.#getVector();
		const planes = Camera.frustumPlanesArray;

		// Use array for fast iteration (avoids Object.values())
		for (let i = 0; i < 6; i++) {
			const plane = planes[i];
			// Use direct array access for better performance
			p[0] = plane[0] > 0 ? this.max[0] : this.min[0];
			p[1] = plane[1] > 0 ? this.max[1] : this.min[1];
			p[2] = plane[2] > 0 ? this.max[2] : this.min[2];

			n[0] = plane[0] > 0 ? this.min[0] : this.max[0];
			n[1] = plane[1] > 0 ? this.min[1] : this.max[1];
			n[2] = plane[2] > 0 ? this.min[2] : this.max[2];

			if (
				vec3.dot(p, plane) + plane[3] < 0 &&
				vec3.dot(n, plane) + plane[3] < 0
			) {
				return false;
			}
		}

		return true;
	}
}

export default BoundingBox;
