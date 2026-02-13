import { quat, vec3 } from "../../dependencies/gl-matrix.js";
import { Ray, RaycastResult } from "../../engine/physics/ray.js";
import { Trimesh } from "../../engine/physics/shapes.js";

// Private state
const _staticObjects = [];
let _paused = false;
let _simulationEnabled = false;

// Collision groups
const COLLISION_GROUPS = {
	WORLD: 1,
	PLAYER: 2,
	PROJECTILE: 4,
};

// Shared raycast state
const _rayFrom = vec3.create();
const _rayTo = vec3.create();
const _rayResult = new RaycastResult();
const _ray = new Ray();
const _defaultRayOptions = {
	skipBackfaces: true,
	collisionFilterMask: COLLISION_GROUPS.WORLD,
};

const _raycast = (fromX, fromY, fromZ, toX, toY, toZ, options) => {
	vec3.set(_rayFrom, fromX, fromY, fromZ);
	vec3.set(_rayTo, toX, toY, toZ);
	_rayResult.reset();

	vec3.copy(_ray.from, _rayFrom);
	vec3.copy(_ray.to, _rayTo);
	_ray.updateDirection();
	_ray.result = _rayResult;

	const opts = options || _defaultRayOptions;
	_ray.skipBackfaces =
		typeof opts.skipBackfaces !== "undefined" ? opts.skipBackfaces : true;
	_ray.collisionFilterMask =
		typeof opts.collisionFilterMask !== "undefined"
			? opts.collisionFilterMask
			: -1;
	_ray.collisionFilterGroup =
		typeof opts.collisionFilterGroup !== "undefined"
			? opts.collisionFilterGroup
			: -1;
	_ray.mode = 1; // CLOSEST

	_ray.hasHit = false;
	_rayResult.distance = Infinity;

	for (let i = 0; i < _staticObjects.length; i++) {
		const obj = _staticObjects[i];
		_ray.intersectTrimesh(
			obj.shape,
			obj.quaternion,
			obj.position,
			obj, // body
			opts,
		);
	}

	return _rayResult;
};

const _init = () => {
	_staticObjects.length = 0;
};

const _addBody = (body) => {
	console.warn("Physics.addBody not fully supported in simplified physics");
	if (body && body.shape) {
		_staticObjects.push({
			shape: body.shape,
			position: body.position || vec3.create(),
			quaternion: body.quaternion || quat.create(),
		});
	}
};

const _removeBody = (body) => {
	for (let i = 0; i < _staticObjects.length; i++) {
		if (_staticObjects[i] === body) {
			_staticObjects.splice(i, 1);
			return;
		}
	}
};

const _addTrimesh = (vertices, indices) => {
	const cannonVertices = [];
	for (let i = 0; i < vertices.length; i += 3) {
		cannonVertices.push(vertices[i], vertices[i + 1], vertices[i + 2]);
	}

	const cannonIndices = [];
	for (const indexGroup of indices) {
		for (let i = 0; i < indexGroup.array.length; i += 3) {
			const a = indexGroup.array[i];
			const b = indexGroup.array[i + 1];
			const c = indexGroup.array[i + 2];
			cannonIndices.push(a, b, c);
			cannonIndices.push(a, c, b);
		}
	}

	const trimesh = new Trimesh(cannonVertices, cannonIndices);
	const body = {
		position: vec3.create(),
		quaternion: quat.create(),
		shape: trimesh,
		mass: 0,
	};
	_staticObjects.push(body);
	return body;
};

const _update = (dt) => {};

const Physics = {
	init: _init,
	update: _update,
	pause: (p) => {
		_paused = p;
	},
	setSimulationEnabled: (enabled) => {
		_simulationEnabled = enabled;
	},
	addBody: _addBody,
	removeBody: _removeBody,
	addTrimesh: _addTrimesh,
	raycast: _raycast,
	getWorld: () => ({ bodies: _staticObjects }),
	COLLISION_GROUPS,
};

export default Physics;
