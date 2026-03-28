import { vec3 } from "../../dependencies/gl-matrix.js";
import { BoundingBox } from "./boundingbox.js";
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
			this._pendingVertices = [];
			this._pendingIndices = [];
			this._totalVertexCount = 0;
		}
	}

	addMesh(vertices, indices) {
		const vertexOffset = this._totalVertexCount;
		this._pendingVertices.push(vertices);
		this._pendingIndices.push({ data: indices, offset: vertexOffset });
		this._totalVertexCount += vertices.length / 3;
		this._dirty = true;
	}

	finalize() {
		if (!this._dirty) return;

		// Calculate total sizes
		let totalVertLen = 0;
		let totalIdxLen = 0;
		for (const v of this._pendingVertices) totalVertLen += v.length;
		for (const idx of this._pendingIndices) totalIdxLen += idx.data.length;

		// Single allocation for each
		this.vertices = new Float32Array(totalVertLen);
		this.indices = new Int32Array(totalIdxLen);

		// Copy vertices
		let vOffset = 0;
		for (const v of this._pendingVertices) {
			this.vertices.set(v, vOffset);
			vOffset += v.length;
		}

		// Copy indices with offset
		let iOffset = 0;
		for (const { data, offset } of this._pendingIndices) {
			for (let i = 0; i < data.length; i++) {
				this.indices[iOffset + i] = data[i] + offset;
			}
			iOffset += data.length;
		}

		// Free pending buffers
		this._pendingVertices = null;
		this._pendingIndices = null;
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
		const { tree, aabb, indices, vertices } = this;
		tree.reset();
		tree.aabb.copy(aabb);

		// Expand root AABB slightly to cover precision issues during insertion
		const epsilon = 0.001;
		tree.aabb.min[0] -= epsilon;
		tree.aabb.min[1] -= epsilon;
		tree.aabb.min[2] -= epsilon;
		tree.aabb.max[0] += epsilon;
		tree.aabb.max[1] += epsilon;
		tree.aabb.max[2] += epsilon;

		const triangleAABB = new BoundingBox();
		const tmin = triangleAABB.min;
		const tmax = triangleAABB.max;

		for (let i = 0, len = indices.length; i < len; i += 3) {
			const i0 = indices[i] * 3;
			const i1 = indices[i + 1] * 3;
			const i2 = indices[i + 2] * 3;

			const ax = vertices[i0],
				ay = vertices[i0 + 1],
				az = vertices[i0 + 2];
			const bx = vertices[i1],
				by = vertices[i1 + 1],
				bz = vertices[i1 + 2];
			const cx = vertices[i2],
				cy = vertices[i2 + 1],
				cz = vertices[i2 + 2];

			// Compute triangle AABB directly — avoids setFromPoints() array iteration
			// and the intermediate [_va, _vb, _vc] array allocation.
			tmin[0] = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
			tmin[1] = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
			tmin[2] = az < bz ? (az < cz ? az : cz) : bz < cz ? bz : cz;
			tmax[0] = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
			tmax[1] = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;
			tmax[2] = az > bz ? (az > cz ? az : cz) : bz > cz ? bz : cz;

			tree.insert(triangleAABB, i / 3);
		}
		tree.removeEmptyNodes();
	}

	updateNormals() {
		const { indices, vertices, normals } = this;

		for (let i = 0, len = indices.length; i < len; i += 3) {
			const i0 = indices[i] * 3;
			const i1 = indices[i + 1] * 3;
			const i2 = indices[i + 2] * 3;

			vec3.set(_va, vertices[i0], vertices[i0 + 1], vertices[i0 + 2]);
			vec3.set(_vb, vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
			vec3.set(_vc, vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);

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
		out[0] = this.vertices[i3];
		out[1] = this.vertices[i3 + 1];
		out[2] = this.vertices[i3 + 2];
		return out;
	}

	computeLocalAABB(aabb) {
		const { vertices } = this;
		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity;
		let maxX = -Infinity,
			maxY = -Infinity,
			maxZ = -Infinity;

		for (let i = 0, len = vertices.length; i < len; i += 3) {
			const x = vertices[i];
			const y = vertices[i + 1];
			const z = vertices[i + 2];

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
		if (vec3.squaredLength(target) > 0) {
			vec3.normalize(target, target);
		}
	}
}

export { Trimesh };
