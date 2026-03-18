import { vec3 } from "../../dependencies/gl-matrix.js";
import { BoundingBox } from "./boundingbox.js";

const _halfDiagonal = vec3.create();
const _tmpAABB = new BoundingBox();
const _queryQueue = [];

// Module-scoped Ray-AABB intersection (Slab method)
// Avoids prototype chain lookups in hot loops
const _intersectRayAABB = (aabb, origin, invDir, maxDist) => {
	const min = aabb.min;
	const max = aabb.max;

	let tmin, tmax, tymin, tymax, tzmin, tzmax;

	if (invDir[0] >= 0) {
		tmin = (min[0] - origin[0]) * invDir[0];
		tmax = (max[0] - origin[0]) * invDir[0];
	} else {
		tmin = (max[0] - origin[0]) * invDir[0];
		tmax = (min[0] - origin[0]) * invDir[0];
	}

	if (invDir[1] >= 0) {
		tymin = (min[1] - origin[1]) * invDir[1];
		tymax = (max[1] - origin[1]) * invDir[1];
	} else {
		tymin = (max[1] - origin[1]) * invDir[1];
		tymax = (min[1] - origin[1]) * invDir[1];
	}

	if (tmin > tymax || tymin > tmax) return false;

	if (tymin > tmin) tmin = tymin;
	if (tymax < tmax) tmax = tymax;

	if (invDir[2] >= 0) {
		tzmin = (min[2] - origin[2]) * invDir[2];
		tzmax = (max[2] - origin[2]) * invDir[2];
	} else {
		tzmin = (max[2] - origin[2]) * invDir[2];
		tzmax = (min[2] - origin[2]) * invDir[2];
	}

	if (tmin > tzmax || tzmin > tmax) return false;

	if (tzmin > tmin) tmin = tzmin;
	if (tzmax < tmax) tmax = tzmax;

	return tmax >= 0 && tmin <= maxDist;
};

class OctreeNode {
	constructor(options = {}) {
		this.root = options.root || null;
		this.aabb = options.aabb ? options.aabb.clone() : new BoundingBox();
		this.data = [];
		this.children = [];
		this.maxDepth = options.maxDepth;
	}

	reset() {
		this.children.length = this.data.length = 0;
	}

	insert(aabb, elementData, level = 0) {
		const nodeData = this.data;
		if (!this.aabb.contains(aabb)) {
			return false;
		}

		const children = this.children;
		const maxDepth = this.maxDepth || this.root.maxDepth;

		if (level < maxDepth) {
			let subdivided = false;
			if (!children.length) {
				this.subdivide();
				subdivided = true;
			}

			for (let i = 0; i !== 8; i++) {
				if (children[i].insert(aabb, elementData, level + 1)) {
					return true;
				}
			}

			if (subdivided) {
				children.length = 0;
			}
		}

		nodeData.push(elementData);
		return true;
	}

	subdivide() {
		const aabb = this.aabb;
		const l = aabb.min;
		const u = aabb.max;
		const children = this.children;

		children.push(
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(0, 0, 0)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(1, 0, 0)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(1, 1, 0)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(1, 1, 1)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(0, 1, 1)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(0, 0, 1)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(1, 0, 1)),
			}),
			new OctreeNode({
				aabb: new BoundingBox(vec3.fromValues(0, 1, 0)),
			}),
		);

		vec3.sub(_halfDiagonal, u, l);
		vec3.scale(_halfDiagonal, _halfDiagonal, 0.5);

		const root = this.root || this;

		for (let i = 0; i !== 8; i++) {
			const child = children[i];
			child.root = root;
			const min = child.aabb.min;
			min[0] *= _halfDiagonal[0];
			min[1] *= _halfDiagonal[1];
			min[2] *= _halfDiagonal[2];
			vec3.add(min, min, l);
			vec3.add(child.aabb.max, min, _halfDiagonal);
		}
	}

	aabbQuery(aabb, result) {
		_queryQueue.push(this);
		while (_queryQueue.length) {
			const node = _queryQueue.pop();
			if (node.aabb.overlaps(aabb)) {
				for (const d of node.data) {
					result.push(d);
				}
				for (const c of node.children) {
					_queryQueue.push(c);
				}
			}
		}
		return result;
	}

	rayQuery(ray, treeTransform, result) {
		treeTransform.pointToLocal(ray.from, _tmpAABB.min);
		treeTransform.vectorToLocal(ray.direction, _tmpAABB.max);

		return this.rayQueryLocal(
			_tmpAABB.min,
			_tmpAABB.max,
			vec3.distance(ray.from, ray.to),
			result,
		);
	}

	rayQueryLocal(origin, direction, maxDist, result) {
		const invDirX = 1.0 / direction[0];
		const invDirY = 1.0 / direction[1];
		const invDirZ = 1.0 / direction[2];

		// Reuse _tmpAABB.min as invDir storage (caller already consumed it)
		const invDir = _tmpAABB.max; // Repurpose temporarily
		invDir[0] = invDirX;
		invDir[1] = invDirY;
		invDir[2] = invDirZ;

		_queryQueue.push(this);
		while (_queryQueue.length) {
			const node = _queryQueue.pop();

			if (_intersectRayAABB(node.aabb, origin, invDir, maxDist)) {
				for (const d of node.data) {
					result.push(d);
				}
				for (const c of node.children) {
					_queryQueue.push(c);
				}
			}
		}

		return result;
	}

	removeEmptyNodes() {
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].removeEmptyNodes();
			if (!this.children[i].children.length && !this.children[i].data.length) {
				this.children.splice(i, 1);
			}
		}
	}
}

class Octree extends OctreeNode {
	constructor(aabb, options = {}) {
		super({ root: null, aabb: aabb });
		this.maxDepth =
			typeof options.maxDepth !== "undefined" ? options.maxDepth : 8;
	}
}

export { Octree, _intersectRayAABB };
