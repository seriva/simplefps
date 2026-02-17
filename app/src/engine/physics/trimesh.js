import { vec3 } from "../../dependencies/gl-matrix.js";
import BoundingBox from "./boundingbox.js";
import { Octree } from "./octree.js";

// Temp variables
const _va = vec3.create();
const _vb = vec3.create();
const _vc = vec3.create();
const _n = vec3.create();
const _ab = vec3.create();
const _cb = vec3.create();

class Trimesh {
	constructor(vertices, indices) {
		this.aabb = new BoundingBox();
		this.scale = vec3.fromValues(1, 1, 1);
		this.tree = new Octree();

		if (vertices && indices) {
			this.vertices = new Float32Array(vertices);
			this.indices = new Int32Array(indices);
			this.normals = new Float32Array(indices.length);
			this.updateNormals();
			this.computeLocalAABB(this.aabb);
			this.updateTree();
		} else {
			// Empty trimesh — will be populated via addMesh()
			this.vertices = new Float32Array(0);
			this.indices = new Int32Array(0);
			this.normals = new Float32Array(0);
		}
	}

	addMesh(vertices, indices) {
		const vertexOffset = this.vertices.length / 3;

		// Grow vertices
		const newVertices = new Float32Array(
			this.vertices.length + vertices.length,
		);
		newVertices.set(this.vertices);
		newVertices.set(vertices, this.vertices.length);
		this.vertices = newVertices;

		// Grow indices (offset by existing vertex count)
		const newIndices = new Int32Array(this.indices.length + indices.length);
		newIndices.set(this.indices);
		for (let i = 0; i < indices.length; i++) {
			newIndices[this.indices.length + i] = indices[i] + vertexOffset;
		}
		this.indices = newIndices;
		this._dirty = true;
	}

	finalize() {
		if (!this._dirty) return;
		this.normals = new Float32Array(this.indices.length);
		this.updateNormals();
		this.computeLocalAABB(this.aabb);
		this.updateTree();
		this._dirty = false;
	}

	dispose() {
		this.vertices = null;
		this.indices = null;
		this.normals = null;
		this.tree = null;
	}

	updateTree() {
		const { tree, aabb, scale, indices, vertices } = this;
		tree.reset();
		tree.aabb.copy(aabb);

		const invSx = 1 / scale[0];
		const invSy = 1 / scale[1];
		const invSz = 1 / scale[2];

		tree.aabb.min[0] *= invSx;
		tree.aabb.min[1] *= invSy;
		tree.aabb.min[2] *= invSz;
		tree.aabb.max[0] *= invSx;
		tree.aabb.max[1] *= invSy;
		tree.aabb.max[2] *= invSz;

		const triangleAABB = new BoundingBox();
		const points = [_va, _vb, _vc];

		for (let i = 0, len = indices.length; i < len; i += 3) {
			const i0 = indices[i] * 3;
			const i1 = indices[i + 1] * 3;
			const i2 = indices[i + 2] * 3;

			vec3.set(_va, vertices[i0], vertices[i0 + 1], vertices[i0 + 2]);
			vec3.set(_vb, vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
			vec3.set(_vc, vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);

			triangleAABB.setFromPoints(points);
			tree.insert(triangleAABB, i / 3);
		}
		tree.removeEmptyNodes();
	}

	updateNormals() {
		const { indices, vertices, normals, scale } = this;
		const sx = scale[0],
			sy = scale[1],
			sz = scale[2];

		for (let i = 0, len = indices.length; i < len; i += 3) {
			const i0 = indices[i] * 3;
			const i1 = indices[i + 1] * 3;
			const i2 = indices[i + 2] * 3;

			vec3.set(
				_va,
				vertices[i0] * sx,
				vertices[i0 + 1] * sy,
				vertices[i0 + 2] * sz,
			);
			vec3.set(
				_vb,
				vertices[i1] * sx,
				vertices[i1 + 1] * sy,
				vertices[i1 + 2] * sz,
			);
			vec3.set(
				_vc,
				vertices[i2] * sx,
				vertices[i2 + 1] * sy,
				vertices[i2 + 2] * sz,
			);

			Trimesh.computeNormal(_vb, _va, _vc, _n);

			normals[i] = _n[0];
			normals[i + 1] = _n[1];
			normals[i + 2] = _n[2];
		}
	}

	getNormal(i, target) {
		const i3 = i * 3;
		target[0] = this.normals[i3];
		target[1] = this.normals[i3 + 1];
		target[2] = this.normals[i3 + 2];
		return target;
	}

	getVertex(i, out) {
		const i3 = i * 3;
		out[0] = this.vertices[i3] * this.scale[0];
		out[1] = this.vertices[i3 + 1] * this.scale[1];
		out[2] = this.vertices[i3 + 2] * this.scale[2];
		return out;
	}

	computeLocalAABB(aabb) {
		const { vertices, scale } = this;
		const sx = scale[0],
			sy = scale[1],
			sz = scale[2];
		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity;
		let maxX = -Infinity,
			maxY = -Infinity,
			maxZ = -Infinity;

		for (let i = 0, len = vertices.length; i < len; i += 3) {
			const x = vertices[i] * sx;
			const y = vertices[i + 1] * sy;
			const z = vertices[i + 2] * sz;

			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			if (z < minZ) minZ = z;
			if (z > maxZ) maxZ = z;
		}

		vec3.set(aabb.min, minX, minY, minZ);
		vec3.set(aabb.max, maxX, maxY, maxZ);
	}

	static computeNormal(va, vb, vc, target) {
		vec3.sub(_ab, vb, va);
		vec3.sub(_cb, vc, vb);
		vec3.cross(target, _cb, _ab);
		if (vec3.length(target) > 0) {
			vec3.normalize(target, target);
		}
	}
}

export { Trimesh };
