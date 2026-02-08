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
	getWorld: () => _world,
	COLLISION_GROUPS,
};

export default Physics;
