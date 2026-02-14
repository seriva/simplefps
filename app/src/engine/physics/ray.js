import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Transform } from "./transform.js";

const _itNormal = vec3.create();
const _itTriangles = [];
const _itTreeTransform = new Transform();
const _itVector = vec3.create();
const _itLocalDir = vec3.create();
const _itLocalFrom = vec3.create();
const _itLocalTo = vec3.create();
const _itWorldPoint = vec3.create();
const _itWorldNormal = vec3.create();
const _v0 = vec3.create();
const _v1 = vec3.create();
const _v2 = vec3.create();
const _a = vec3.create();
const _b = vec3.create();
const _c = vec3.create();
const _intersectPoint = vec3.create();
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
		this.callback = (_result) => {};
	}

	updateDirection() {
		vec3.sub(this.direction, this.to, this.from);
		vec3.normalize(this.direction, this.direction);
	}

	intersectTrimesh(mesh, worldMatrix, _options) {
		const indices = mesh.indices;

		// Transform ray to local space
		mat4.invert(_invMatrix, worldMatrix);
		vec3.transformMat4(_itLocalFrom, this.from, _invMatrix);
		vec3.transformMat4(_itLocalTo, this.to, _invMatrix);

		vec3.sub(_itLocalDir, _itLocalTo, _itLocalFrom);
		vec3.normalize(_itLocalDir, _itLocalDir);

		// Prepare tree transform (identity, as we transformed ray to local)
		vec3.set(_itTreeTransform.position, 0, 0, 0);
		_itTreeTransform.quaternion.set([0, 0, 0, 1]); // Identity quat

		_localRay.from = _itLocalFrom;
		_localRay.to = _itLocalTo;
		_localRay.direction = _itLocalDir;
		// Copy other props
		_localRay.precision = this.precision;
		_localRay.checkCollisionResponse = this.checkCollisionResponse;
		_localRay.skipBackfaces = this.skipBackfaces;
		_localRay.collisionFilterMask = this.collisionFilterMask;
		_localRay.collisionFilterGroup = this.collisionFilterGroup;
		_localRay.mode = this.mode;
		_localRay.result.shouldStop = false;

		mesh.tree.rayQuery(_localRay, _itTreeTransform, _itTriangles);

		const fromToDistanceSquaredVal = vec3.sqrDist(_itLocalFrom, _itLocalTo);

		for (
			let i = 0, N = _itTriangles.length;
			!this.result.shouldStop && i !== N;
			i++
		) {
			const trianglesIndex = _itTriangles[i];
			mesh.getNormal(trianglesIndex, _itNormal);
			mesh.getVertex(indices[trianglesIndex * 3], _a);

			vec3.sub(_itVector, _a, _itLocalFrom);
			const dot = vec3.dot(_itLocalDir, _itNormal);

			const scalar = vec3.dot(_itNormal, _itVector) / dot;
			if (scalar < 0) {
				continue;
			}

			vec3.scaleAndAdd(_intersectPoint, _itLocalFrom, _itLocalDir, scalar);

			mesh.getVertex(indices[trianglesIndex * 3 + 1], _b);
			mesh.getVertex(indices[trianglesIndex * 3 + 2], _c);

			const squaredDistance = vec3.sqrDist(_intersectPoint, _itLocalFrom);

			if (
				!(
					Ray.pointInTriangle(_intersectPoint, _b, _a, _c) ||
					Ray.pointInTriangle(_intersectPoint, _a, _b, _c)
				) ||
				squaredDistance > fromToDistanceSquaredVal
			) {
				continue;
			}

			// Transform Hit Point local -> world
			vec3.transformMat4(_itWorldPoint, _intersectPoint, worldMatrix);

			// Transform Normal local -> world (rotate only)
			const m = worldMatrix;
			_itWorldNormal[0] =
				_itNormal[0] * m[0] + _itNormal[1] * m[4] + _itNormal[2] * m[8];
			_itWorldNormal[1] =
				_itNormal[0] * m[1] + _itNormal[1] * m[5] + _itNormal[2] * m[9];
			_itWorldNormal[2] =
				_itNormal[0] * m[2] + _itNormal[1] * m[6] + _itNormal[2] * m[10];
			vec3.normalize(_itWorldNormal, _itWorldNormal);

			this.reportIntersection(
				_itWorldNormal,
				_itWorldPoint,
				mesh,
				null, // body, deprecated
				trianglesIndex,
			);
		}
		_itTriangles.length = 0;
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
		vec3.sub(_v0, c, a);
		vec3.sub(_v1, b, a);
		vec3.sub(_v2, p, a);

		const dot00 = vec3.dot(_v0, _v0);
		const dot01 = vec3.dot(_v0, _v1);
		const dot02 = vec3.dot(_v0, _v2);
		const dot11 = vec3.dot(_v1, _v1);
		const dot12 = vec3.dot(_v1, _v2);

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
