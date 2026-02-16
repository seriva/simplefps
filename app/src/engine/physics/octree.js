import { vec3 } from "../../dependencies/gl-matrix.js";
import BoundingBox from "./boundingbox.js";

const _halfDiagonal = vec3.create();
const _tmpAABB = new BoundingBox();

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
				aabb: new BoundingBox({ min: vec3.fromValues(0, 0, 0) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(1, 0, 0) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(1, 1, 0) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(1, 1, 1) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(0, 1, 1) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(0, 0, 1) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(1, 0, 1) }),
			}),
			new OctreeNode({
				aabb: new BoundingBox({ min: vec3.fromValues(0, 1, 0) }),
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
		const queue = [this];
		while (queue.length) {
			const node = queue.pop();
			if (node.aabb.overlaps(aabb)) {
				for (const d of node.data) {
					result.push(d);
				}
			}
			for (const c of node.children) {
				queue.push(c);
			}
		}
		return result;
	}

	rayQuery(ray, treeTransform, result) {
		ray.getAABB(_tmpAABB);
		_tmpAABB.toLocalFrame(treeTransform, _tmpAABB);
		this.aabbQuery(_tmpAABB, result);
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

export { Octree };
