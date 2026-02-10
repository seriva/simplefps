import * as CANNON from "../../dependencies/cannon-es.js";

// Private state
let _world = null;
let _paused = false;
let _simulationEnabled = false; // Disabled by default - we use raycasts only

// Collision groups for filtering (exported for use in other modules)
const COLLISION_GROUPS = {
	WORLD: 1,
	PLAYER: 2,
	PROJECTILE: 4,
};

// Shared raycast state (reused to avoid GC pressure)
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _defaultRayOptions = {
	skipBackfaces: true,
	collisionFilterMask: COLLISION_GROUPS.WORLD,
};

/**
 * Perform a raycast from (fromX,fromY,fromZ) to (toX,toY,toZ).
 * Returns the shared result object — check result.hasHit, result.hitPointWorld, result.hitNormalWorld.
 * WARNING: The returned object is reused across calls — copy values if you need to keep them.
 */
const _raycast = (fromX, fromY, fromZ, toX, toY, toZ, options) => {
	_rayFrom.set(fromX, fromY, fromZ);
	_rayTo.set(toX, toY, toZ);
	_rayResult.reset();
	_world.raycastClosest(
		_rayFrom,
		_rayTo,
		options || _defaultRayOptions,
		_rayResult,
	);
	return _rayResult;
};

const _init = () => {
	_world = new CANNON.World();
	_world.broadphase = new CANNON.SAPBroadphase(_world);
	_world.gravity.set(0, 0, 0);
	_world.allowSleep = true;
};

const _addBody = (body) => {
	_world.addBody(body);
};

const _removeBody = (body) => {
	_world.removeBody(body);
};

const _addTrimesh = (vertices, indices) => {
	// Convert flat vertex array to CANNON format
	const cannonVertices = [];
	for (let i = 0; i < vertices.length; i += 3) {
		cannonVertices.push(vertices[i], vertices[i + 1], vertices[i + 2]);
	}

	// Flatten all index groups into one array (double-sided: add both windings)
	const cannonIndices = [];
	for (const indexGroup of indices) {
		for (let i = 0; i < indexGroup.array.length; i += 3) {
			const a = indexGroup.array[i];
			const b = indexGroup.array[i + 1];
			const c = indexGroup.array[i + 2];
			// Original winding
			cannonIndices.push(a, b, c);
			// Reversed winding for double-sided collision
			cannonIndices.push(a, c, b);
		}
	}

	const trimesh = new CANNON.Trimesh(cannonVertices, cannonIndices);
	const body = new CANNON.Body({
		mass: 0, // Static body
		type: CANNON.Body.STATIC,
	});
	body.addShape(trimesh);
	_world.addBody(body);
	return body;
};

const _timeStep = 1 / 120;
const _MAX_SUBSTEPS = 10;

const _update = (dt) => {
	if (_paused || !_simulationEnabled) return;
	_world.step(_timeStep, dt, _MAX_SUBSTEPS);
};

// Public Physics API
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
	getWorld: () => _world,
	COLLISION_GROUPS,
};

export default Physics;
