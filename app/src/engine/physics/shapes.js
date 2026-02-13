import { vec3 } from "../../dependencies/gl-matrix.js";
import { AABB } from "./math.js";
import { Octree } from "./spatial.js";

export class Shape {
	constructor(options = {}) {
		this.id = Shape.idCounter++;
		this.type = options.type || 0;
		this.boundingSphereRadius = 0;
		this.collisionResponse =
			options.collisionResponse !== undefined
				? options.collisionResponse
				: true;
		this.collisionFilterGroup =
			options.collisionFilterGroup !== undefined
				? options.collisionFilterGroup
				: 1;
		this.collisionFilterMask =
			options.collisionFilterMask !== undefined
				? options.collisionFilterMask
				: -1;
		this.body = null;
	}

	updateBoundingSphereRadius() {
		throw (
			"computeBoundingSphereRadius() not implemented for shape type " +
			this.type
		);
	}

	volume() {
		throw "volume() not implemented for shape type " + this.type;
	}

	calculateLocalInertia(mass, target) {
		throw "calculateLocalInertia() not implemented for shape type " + this.type;
	}
}
Shape.idCounter = 0;
Shape.types = {
	SPHERE: 1,
	PLANE: 2,
	BOX: 4,
	COMPOUND: 8,
	CONVEXPOLYHEDRON: 16,
	HEIGHTFIELD: 32,
	PARTICLE: 64,
	CYLINDER: 128,
	TRIMESH: 256,
};

const computeNormals_n = vec3.create();
const va = vec3.create();
const vb = vec3.create();
const vc = vec3.create();
const ab = vec3.create();
const cb = vec3.create();
const unscaledAABB = new AABB();

export class Trimesh extends Shape {
	constructor(vertices, indices) {
		super({ type: Shape.types.TRIMESH });
		this.vertices = new Float32Array(vertices);
		this.indices = new Int16Array(indices);
		this.normals = new Float32Array(indices.length);
		this.aabb = new AABB();
		this.scale = vec3.fromValues(1, 1, 1);
		this.tree = new Octree();

		this.updateEdges();
		this.updateNormals();
		this.updateAABB();
		this.updateBoundingSphereRadius();
		this.updateTree();
	}

	updateTree() {
		const tree = this.tree;
		tree.reset();
		tree.aabb.copy(this.aabb);
		const scale = this.scale;

		tree.aabb.lowerBound[0] *= 1 / scale[0];
		tree.aabb.lowerBound[1] *= 1 / scale[1];
		tree.aabb.lowerBound[2] *= 1 / scale[2];
		tree.aabb.upperBound[0] *= 1 / scale[0];
		tree.aabb.upperBound[1] *= 1 / scale[1];
		tree.aabb.upperBound[2] *= 1 / scale[2];

		const triangleAABB = new AABB();
		const a = vec3.create();
		const b = vec3.create();
		const c = vec3.create();
		const points = [a, b, c];

		for (let i = 0; i < this.indices.length / 3; i++) {
			const i3 = i * 3;
			this._getUnscaledVertex(this.indices[i3], a);
			this._getUnscaledVertex(this.indices[i3 + 1], b);
			this._getUnscaledVertex(this.indices[i3 + 2], c);
			triangleAABB.setFromPoints(points);
			tree.insert(triangleAABB, i);
		}
		tree.removeEmptyNodes();
	}

	getTrianglesInAABB(aabb, result) {
		unscaledAABB.copy(aabb);
		const scale = this.scale;
		const l = unscaledAABB.lowerBound;
		const u = unscaledAABB.upperBound;
		l[0] /= scale[0];
		l[1] /= scale[1];
		l[2] /= scale[2];
		u[0] /= scale[0];
		u[1] /= scale[1];
		u[2] /= scale[2];
		return this.tree.aabbQuery(unscaledAABB, result);
	}

	setScale(scale) {
		const wasUniform =
			this.scale[0] === this.scale[1] && this.scale[1] === this.scale[2];
		const isUniform = scale[0] === scale[1] && scale[1] === scale[2];

		if (!(wasUniform && isUniform)) {
			this.updateNormals();
		}
		vec3.copy(this.scale, scale);
		this.updateAABB();
		this.updateBoundingSphereRadius();
	}

	updateNormals() {
		const n = computeNormals_n;
		const normals = this.normals;

		for (let i = 0; i < this.indices.length / 3; i++) {
			const i3 = i * 3;
			const a = this.indices[i3];
			const b = this.indices[i3 + 1];
			const c = this.indices[i3 + 2];
			this.getVertex(a, va);
			this.getVertex(b, vb);
			this.getVertex(c, vc);
			Trimesh.computeNormal(vb, va, vc, n);
			normals[i3] = n[0];
			normals[i3 + 1] = n[1];
			normals[i3 + 2] = n[2];
		}
	}

	updateEdges() {
		const edges = {};
		const add = (a, b) => {
			const key = a < b ? `${a}_${b}` : `${b}_${a}`;
			edges[key] = true;
		};

		for (let i = 0; i < this.indices.length / 3; i++) {
			const i3 = i * 3;
			const a = this.indices[i3];
			const b = this.indices[i3 + 1];
			const c = this.indices[i3 + 2];
			add(a, b);
			add(b, c);
			add(c, a);
		}

		const keys = Object.keys(edges);
		this.edges = new Int16Array(keys.length * 2);

		for (let i = 0; i < keys.length; i++) {
			const indices = keys[i].split("_");
			this.edges[2 * i] = parseInt(indices[0], 10);
			this.edges[2 * i + 1] = parseInt(indices[1], 10);
		}
	}

	getEdgeVertex(edgeIndex, firstOrSecond, vertexStore) {
		const vertexIndex = this.edges[edgeIndex * 2 + (firstOrSecond ? 1 : 0)];
		this.getVertex(vertexIndex, vertexStore);
	}

	getNormal(i, target) {
		const i3 = i * 3;
		vec3.set(
			target,
			this.normals[i3],
			this.normals[i3 + 1],
			this.normals[i3 + 2],
		);
		return target;
	}

	getVertex(i, out) {
		const scale = this.scale;
		this._getUnscaledVertex(i, out);
		out[0] *= scale[0];
		out[1] *= scale[1];
		out[2] *= scale[2];
		return out;
	}

	_getUnscaledVertex(i, out) {
		const i3 = i * 3;
		vec3.set(
			out,
			this.vertices[i3],
			this.vertices[i3 + 1],
			this.vertices[i3 + 2],
		);
		return out;
	}

	getTriangleVertices(i, a, b, c) {
		const i3 = i * 3;
		this.getVertex(this.indices[i3], a);
		this.getVertex(this.indices[i3 + 1], b);
		this.getVertex(this.indices[i3 + 2], c);
	}

	computeLocalAABB(aabb) {
		const l = aabb.lowerBound;
		const u = aabb.upperBound;
		const n = this.vertices.length;
		const vertices = this.vertices;
		const s = this.scale;

		vec3.set(l, Infinity, Infinity, Infinity);
		vec3.set(u, -Infinity, -Infinity, -Infinity);

		for (let i = 0; i < n; i += 3) {
			const x = vertices[i] * s[0];
			const y = vertices[i + 1] * s[1];
			const z = vertices[i + 2] * s[2];

			if (x < l[0]) l[0] = x;
			if (x > u[0]) u[0] = x;
			if (y < l[1]) l[1] = y;
			if (y > u[1]) u[1] = y;
			if (z < l[2]) l[2] = z;
			if (z > u[2]) u[2] = z;
		}
	}

	updateAABB() {
		this.computeLocalAABB(this.aabb);
	}

	updateBoundingSphereRadius() {
		this.boundingSphereRadius = Number.MAX_VALUE;
		let maxDistSq = 0;
		const vertices = this.vertices;
		const s = this.scale;
		for (let i = 0; i < vertices.length; i += 3) {
			const x = vertices[i] * s[0];
			const y = vertices[i + 1] * s[1];
			const z = vertices[i + 2] * s[2];
			const d2 = x * x + y * y + z * z;
			if (d2 > maxDistSq) maxDistSq = d2;
		}
		this.boundingSphereRadius = Math.sqrt(maxDistSq);
	}

	static computeNormal(va, vb, vc, target) {
		vec3.sub(ab, vb, va);
		vec3.sub(cb, vc, vb);
		vec3.cross(target, cb, ab);
		if (vec3.length(target) > 0) {
			vec3.normalize(target, target);
		}
	}
}
