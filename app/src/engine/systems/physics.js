import * as CANNON from "../../dependencies/cannon-es.js";

// Private state
let _world = null;
let _paused = false;
const _timeStep = 1 / 120;

// Collision groups for filtering (exported for use in other modules)
const COLLISION_GROUPS = {
	WORLD: 1,
	PLAYER: 2,
	PROJECTILE: 4,
};

// Gravity scale constant
const _GRAVITY_SCALE = 80;

// Shared world material for all static geometry
const _worldMaterial = new CANNON.Material("world");

// Private functions
const _gravityBodies = new Set();

const _init = () => {
	_world = new CANNON.World();
	_world.broadphase = new CANNON.SAPBroadphase(_world);
	_world.gravity.set(0, 0, 0);
	_world.allowSleep = true;
	_world.quatNormalizeSkip = 0;
	_world.quatNormalizeFast = false;
	_world.solver.tolerance = 0.001;
	_world.solver.iterations = 10;
	_gravityBodies.clear();

	// Apply gravity to registered bodies each step
	const _gravityVec = new CANNON.Vec3(0, 0, 0);
	_world.addEventListener("preStep", () => {
		for (const body of _gravityBodies) {
			// Use custom gravity scale if defined, otherwise use default (1.0)
			const gravityScale =
				body.gravityScale !== undefined ? body.gravityScale : 1.0;

			_gravityVec.y = -9.82 * _GRAVITY_SCALE * body.mass * gravityScale;
			body.applyForce(_gravityVec, body.position);
		}
	});
};

const _addBody = (body) => {
	_world.addBody(body);
	// Auto-register for gravity if gravityScale is not explicitly 0
	if (body.gravityScale !== 0) {
		_gravityBodies.add(body);
	}
};

const _removeBody = (body) => {
	_world.removeBody(body);
	_gravityBodies.delete(body);
};

const _addContactMaterial = (materialA, materialB, options) => {
	const contactMaterial = new CANNON.ContactMaterial(
		materialA,
		materialB,
		options,
	);
	_world.addContactMaterial(contactMaterial);
	return contactMaterial;
};

const _onCollision = (bodyA, bodyB, callback) => {
	const handler = (event) => {
		if (
			(event.body === bodyA && event.target === bodyB) ||
			(event.body === bodyB && event.target === bodyA)
		) {
			callback(event);
		}
	};
	bodyA.addEventListener("collide", handler);
	return handler;
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
		material: _worldMaterial, // Apply world material
	});
	body.addShape(trimesh);
	_world.addBody(body);
	return body;
};

const _MAX_SUBSTEPS = 10; // More substeps for fast-moving objects

const _update = (dt) => {
	if (_paused) return;
	_world.step(_timeStep, dt, _MAX_SUBSTEPS);
};

// Public Physics API
const Physics = {
	init: _init,
	update: _update,
	pause: (p) => {
		_paused = p;
	},
	addBody: _addBody,
	removeBody: _removeBody,
	addContactMaterial: _addContactMaterial,
	onCollision: _onCollision,
	addTrimesh: _addTrimesh,
	getWorld: () => _world,
	getWorldMaterial: () => _worldMaterial,
	COLLISION_GROUPS,
};

export default Physics;
