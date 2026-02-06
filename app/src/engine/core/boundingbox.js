import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import Camera from "./camera.js";

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

	#center = vec3.create();
	#dimensions = vec3.create();
	#min;
	#max;
	#transformMatrix = mat4.create();

	static #getVector() {
		const vector = BoundingBox.#vectorPool[BoundingBox.#poolIndex];
		BoundingBox.#poolIndex =
			(BoundingBox.#poolIndex + 1) % BoundingBox.#vectorPool.length;
		return vector;
	}

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

	constructor(min, max) {
		this.#min = vec3.clone(min);
		this.#max = vec3.clone(max);
		this.#updateCachedValues();
	}

	// Set bounds in-place (avoids creating new BoundingBox)
	set(min, max) {
		vec3.copy(this.#min, min);
		vec3.copy(this.#max, max);
		this.#updateCachedValues();
		return this;
	}

	#updateCachedValues() {
		vec3.add(this.#center, this.#min, this.#max);
		vec3.scale(this.#center, this.#center, 0.5);
		vec3.subtract(this.#dimensions, this.#max, this.#min);
	}

	get min() {
		return this.#min;
	}
	get max() {
		return this.#max;
	}
	get center() {
		return this.#center;
	}
	get dimensions() {
		return this.#dimensions;
	}
	get transformMatrix() {
		mat4.identity(this.#transformMatrix);
		mat4.translate(this.#transformMatrix, this.#transformMatrix, this.#center);
		mat4.scale(this.#transformMatrix, this.#transformMatrix, this.#dimensions);
		return this.#transformMatrix;
	}

	transform(matrix) {
		// Use static buffers to avoid per-call allocations
		const corners = BoundingBox.#cornersBuffer;
		const corner = BoundingBox.#getVector();

		for (let i = 0; i < 8; i++) {
			vec3.set(
				corner,
				i & 1 ? this.#max[0] : this.#min[0],
				i & 2 ? this.#max[1] : this.#min[1],
				i & 4 ? this.#max[2] : this.#min[2],
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
				i & 1 ? this.#max[0] : this.#min[0],
				i & 2 ? this.#max[1] : this.#min[1],
				i & 4 ? this.#max[2] : this.#min[2],
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
			p[0] = plane[0] > 0 ? this.#max[0] : this.#min[0];
			p[1] = plane[1] > 0 ? this.#max[1] : this.#min[1];
			p[2] = plane[2] > 0 ? this.#max[2] : this.#min[2];

			n[0] = plane[0] > 0 ? this.#min[0] : this.#max[0];
			n[1] = plane[1] > 0 ? this.#min[1] : this.#max[1];
			n[2] = plane[2] > 0 ? this.#min[2] : this.#max[2];

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
