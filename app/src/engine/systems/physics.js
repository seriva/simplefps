import * as CANNON from "../../dependencies/cannon-es.js";

// Private state
let _world = null;
let _lastCallTime;
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
	_world.addEventListener("preStep", () => {
		for (const body of _gravityBodies) {
			// Use custom gravity scale if defined, otherwise use default (1.0)
			const gravityScale =
				body.gravityScale !== undefined ? body.gravityScale : 1.0;
			body.applyForce(
				new CANNON.Vec3(
					0,
					-9.82 * _GRAVITY_SCALE * body.mass * gravityScale,
					0,
				),
			);
		}
	});
};

const _addBody = (body) => {
	_world.addBody(body);
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

const _setPlayerVelocity = (x, y, z) => {
	if (!_playerBody) return;
	_playerBody.velocity.x = x;
	_playerBody.velocity.y = y;
	_playerBody.velocity.z = z;
};

const _MAX_SUBSTEPS = 10; // More substeps for fast-moving objects

const _update = () => {
	const time = performance.now() / 1000;
	if (!_lastCallTime) {
		_world.step(_timeStep);
	} else {
		// Cap dt to prevent physics glitches when tab loses focus
		const dt = Math.min(time - _lastCallTime, _timeStep * _MAX_SUBSTEPS);
		_world.step(_timeStep, dt, _MAX_SUBSTEPS);
	}
	_lastCallTime = time;
};

// Public Physics API
const Physics = {
	init: _init,
	update: _update,
	addBody: _addBody,
	removeBody: _removeBody,
	addBodyWithGravity: (body) => {
		_world.addBody(body);
		_gravityBodies.add(body);
	},
	addContactMaterial: _addContactMaterial,
	onCollision: _onCollision,
	addTrimesh: _addTrimesh,
	getWorld: () => _world, // Expose world for raycasting
	getWorldMaterial: () => _worldMaterial, // Expose world material
	COLLISION_GROUPS,
};

export default Physics;
