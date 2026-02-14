import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Transform } from "./transform.js";

const intersectTrimesh_normal = vec3.create();
const intersectTrimesh_triangles = [];
const intersectTrimesh_treeTransform = new Transform();
const intersectTrimesh_vector = vec3.create();
const intersectTrimesh_localDirection = vec3.create();
const intersectTrimesh_localFrom = vec3.create();
const intersectTrimesh_localTo = vec3.create();
const intersectTrimesh_worldIntersectPoint = vec3.create();
const intersectTrimesh_worldNormal = vec3.create();
const v0 = vec3.create();
const v1 = vec3.create();
const v2 = vec3.create();
const a = vec3.create();
const b = vec3.create();
const c = vec3.create();
const intersectPoint = vec3.create();
const _invMatrix = mat4.create();

const RAY_MODES = {
	CLOSEST: 1,
	ANY: 2,
	ALL: 4,
};

class RaycastResult {
	constructor() {
		this.rayFromWorld = vec3.create();
		this.rayToWorld = vec3.create();
		this.hitNormalWorld = vec3.create();
		this.hitPointWorld = vec3.create();
		this.hasHit = false;
		this.shape = null;
		this.body = null;
		this.hitFaceIndex = -1;
		this.distance = -1;
		this.shouldStop = false;
	}

	reset() {
		vec3.set(this.rayFromWorld, 0, 0, 0);
		vec3.set(this.rayToWorld, 0, 0, 0);
		vec3.set(this.hitNormalWorld, 0, 0, 0);
		vec3.set(this.hitPointWorld, 0, 0, 0);
		this.hasHit = false;
		this.shape = null;
		this.body = null;
		this.hitFaceIndex = -1;
		this.distance = -1;
		this.shouldStop = false;
	}

	set(from, to, normal, hitPoint, shape, body, distance) {
		vec3.copy(this.rayFromWorld, from);
		vec3.copy(this.rayToWorld, to);
		vec3.copy(this.hitNormalWorld, normal);
		vec3.copy(this.hitPointWorld, hitPoint);
		this.shape = shape;
		this.body = body;
		this.distance = distance;
	}
}

class Ray {
	constructor(from, to) {
		this.from = vec3.create();
		this.to = vec3.create();
		if (from) vec3.copy(this.from, from);
		if (to) vec3.copy(this.to, to);

		this.direction = vec3.create();
		this.precision = 0.0001;
		this.checkCollisionResponse = true;
		this.skipBackfaces = false;
		this.collisionFilterMask = -1;
		this.collisionFilterGroup = -1;
		this.mode = RAY_MODES.ANY;
		this.result = new RaycastResult();
		this.hasHit = false;
		this.callback = (_result) => { };
	}

	updateDirection() {
		vec3.sub(this.direction, this.to, this.from);
		vec3.normalize(this.direction, this.direction);
	}

	intersectTrimesh(mesh, worldMatrix, _options) {
		const normal = intersectTrimesh_normal;
		const triangles = intersectTrimesh_triangles;
		const treeTransform = intersectTrimesh_treeTransform;
		const vector = intersectTrimesh_vector;
		const localDirection = intersectTrimesh_localDirection;
		const localFrom = intersectTrimesh_localFrom;
		const localTo = intersectTrimesh_localTo;
		const worldIntersectPoint = intersectTrimesh_worldIntersectPoint;
		const worldNormal = intersectTrimesh_worldNormal;

		const indices = mesh.indices;

		// Transform ray to local space
		mat4.invert(_invMatrix, worldMatrix);
		vec3.transformMat4(localFrom, this.from, _invMatrix);
		vec3.transformMat4(localTo, this.to, _invMatrix);

		vec3.sub(localDirection, localTo, localFrom);
		vec3.normalize(localDirection, localDirection);

		// Prepare tree transform (identity, as we transformed ray to local)
		vec3.set(treeTransform.position, 0, 0, 0);
		treeTransform.quaternion.set([0, 0, 0, 1]); // Identity quat

		_localRay.from = localFrom;
		_localRay.to = localTo;
		_localRay.direction = localDirection;
		// Copy other props
		_localRay.precision = this.precision;
		_localRay.checkCollisionResponse = this.checkCollisionResponse;
		_localRay.skipBackfaces = this.skipBackfaces;
		_localRay.collisionFilterMask = this.collisionFilterMask;
		_localRay.collisionFilterGroup = this.collisionFilterGroup;
		_localRay.mode = this.mode;
		_localRay.result.shouldStop = false;

		mesh.tree.rayQuery(_localRay, treeTransform, triangles);

		const fromToDistanceSquaredVal = vec3.sqrDist(localFrom, localTo);

		for (
			let i = 0, N = triangles.length;
			!this.result.shouldStop && i !== N;
			i++
		) {
			const trianglesIndex = triangles[i];
			mesh.getNormal(trianglesIndex, normal);
			mesh.getVertex(indices[trianglesIndex * 3], a);

			vec3.sub(vector, a, localFrom);
			const dot = vec3.dot(localDirection, normal);

			const scalar = vec3.dot(normal, vector) / dot;
			if (scalar < 0) {
				continue;
			}

			vec3.scaleAndAdd(intersectPoint, localFrom, localDirection, scalar);

			mesh.getVertex(indices[trianglesIndex * 3 + 1], b);
			mesh.getVertex(indices[trianglesIndex * 3 + 2], c);

			const squaredDistance = vec3.sqrDist(intersectPoint, localFrom);

			if (
				!(
					Ray.pointInTriangle(intersectPoint, b, a, c) ||
					Ray.pointInTriangle(intersectPoint, a, b, c)
				) ||
				squaredDistance > fromToDistanceSquaredVal
			) {
				continue;
			}

			// Transform Hit Point local -> world
			vec3.transformMat4(worldIntersectPoint, intersectPoint, worldMatrix);

			// Transform Normal local -> world (rotate only)
			const m = worldMatrix;
			worldNormal[0] = normal[0] * m[0] + normal[1] * m[4] + normal[2] * m[8];
			worldNormal[1] = normal[0] * m[1] + normal[1] * m[5] + normal[2] * m[9];
			worldNormal[2] = normal[0] * m[2] + normal[1] * m[6] + normal[2] * m[10];
			vec3.normalize(worldNormal, worldNormal);

			this.reportIntersection(
				worldNormal,
				worldIntersectPoint,
				mesh,
				null, // body, deprecated
				trianglesIndex,
			);
		}
		triangles.length = 0;
	}

	reportIntersection(normal, hitPointWorld, shape, body, hitFaceIndex) {
		const from = this.from;
		const to = this.to;
		const distance = vec3.dist(from, hitPointWorld);
		const result = this.result;

		if (this.skipBackfaces && vec3.dot(normal, this.direction) > 0) {
			return;
		}

		result.hitFaceIndex =
			typeof hitFaceIndex !== "undefined" ? hitFaceIndex : -1;

		switch (this.mode) {
			case RAY_MODES.ALL:
				this.hasHit = true;
				result.set(from, to, normal, hitPointWorld, shape, body, distance);
				result.hasHit = true;
				this.callback(result);
				break;

			case RAY_MODES.CLOSEST:
				if (distance < result.distance || !result.hasHit) {
					this.hasHit = true;
					result.hasHit = true;
					result.set(from, to, normal, hitPointWorld, shape, body, distance);
				}
				break;

			case RAY_MODES.ANY:
				this.hasHit = true;
				result.hasHit = true;
				result.set(from, to, normal, hitPointWorld, shape, body, distance);
				result.shouldStop = true;
				break;
		}
	}

	static pointInTriangle(p, a, b, c) {
		vec3.sub(v0, c, a);
		vec3.sub(v1, b, a);
		vec3.sub(v2, p, a);

		const dot00 = vec3.dot(v0, v0);
		const dot01 = vec3.dot(v0, v1);
		const dot02 = vec3.dot(v0, v2);
		const dot11 = vec3.dot(v1, v1);
		const dot12 = vec3.dot(v1, v2);

		const u = dot11 * dot02 - dot01 * dot12;
		const v = dot00 * dot12 - dot01 * dot02;
		return u >= 0 && v >= 0 && u + v < dot00 * dot11 - dot01 * dot01;
	}

	getAABB(result) {
		vec3.min(result.min, this.from, this.to);
		vec3.max(result.max, this.from, this.to);
		return result;
	}
}

const _localRay = new Ray();

export { RAY_MODES, RaycastResult, Ray };

