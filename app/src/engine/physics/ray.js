import { vec3 } from "../../dependencies/gl-matrix.js";
import { Transform } from "./transform.js";

export const RAY_MODES = {
	CLOSEST: 1,
	ANY: 2,
	ALL: 4,
};

export class RaycastResult {
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

export class Ray {
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
		this.callback = (result) => {};
	}

	updateDirection() {
		vec3.sub(this.direction, this.to, this.from);
		vec3.normalize(this.direction, this.direction);
	}

	intersectTrimesh(mesh, quat, position, body, options) {
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

		vec3.copy(treeTransform.position, position);
		// quat.copy(treeTransform.quaternion, quat); // quat is array/typedarray, copy works
		// BUT wait, is quat passed here a gl-matrix quat (Float32Array)? Yes, expected.
		// math.js Transform expects quat property.
		treeTransform.quaternion.set(quat);

		Transform.vectorToLocalFrame(
			position,
			quat,
			this.direction,
			localDirection,
		);
		Transform.pointToLocalFrame(position, quat, this.from, localFrom);
		Transform.pointToLocalFrame(position, quat, this.to, localTo);

		const scale = mesh.scale;
		localTo[0] *= scale[0];
		localTo[1] *= scale[1];
		localTo[2] *= scale[2];
		localFrom[0] *= scale[0];
		localFrom[1] *= scale[1];
		localFrom[2] *= scale[2];

		vec3.sub(localDirection, localTo, localFrom);
		vec3.normalize(localDirection, localDirection);

		const fromToDistanceSquared = vec3.dist(localFrom, localTo); // dist is sqrt(distSq)
		// Wait, distSquared? gl-matrix has squaredDistance? No, squaredDistance is sqrDist
		const fromToDistanceSquaredVal = vec3.sqrDist(localFrom, localTo);

		mesh.tree.rayQuery(this, treeTransform, triangles);

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

			// Backface culling
			// if (this.skipBackfaces && dot > 0) ... no, normal and direction same way?
			// Cannon: if (this.skipBackfaces && normal.dot(this.direction) > 0)

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

			Transform.vectorToWorldFrame(quat, normal, worldNormal);
			Transform.pointToWorldFrame(
				position,
				quat,
				intersectPoint,
				worldIntersectPoint,
			);

			this.reportIntersection(
				worldNormal,
				worldIntersectPoint,
				mesh,
				body,
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

		let u, v;
		return (
			(u = dot11 * dot02 - dot01 * dot12) >= 0 &&
			(v = dot00 * dot12 - dot01 * dot02) >= 0 &&
			u + v < dot00 * dot11 - dot01 * dot01
		);
	}

	getAABB(result) {
		vec3.min(result.min, this.from, this.to);
		vec3.max(result.max, this.from, this.to);
		return result;
	}
}

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
