import * as CANNON from "../../dependencies/cannon-es.js";

// Private state
let _world = null;
let _lastCallTime;
const _timeStep = 1 / 120;

// Player physics
let _playerBody = null;
const _PLAYER_RADIUS = 26;
const _PLAYER_HEIGHT = 56;
const _PLAYER_MASS = 80;

// Collision groups for filtering (exported for use in other modules)
const COLLISION_GROUPS = {
	WORLD: 1,
	PLAYER: 2,
	PROJECTILE: 4,
};

// Gravity scale constant
const _GRAVITY_SCALE = 33;

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
	_playerBody = null;
	_gravityBodies.clear();

	// Apply gravity to registered bodies each step
	_world.addEventListener("preStep", () => {
		for (const body of _gravityBodies) {
			body.applyForce(
				new CANNON.Vec3(0, -9.82 * _GRAVITY_SCALE * body.mass, 0),
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

const _createPlayerBody = (position) => {
	if (_playerBody) {
		_world.removeBody(_playerBody);
	}

	// Use a sphere for simple collision
	const shape = new CANNON.Sphere(_PLAYER_RADIUS);
	_playerBody = new CANNON.Body({
		mass: _PLAYER_MASS,
		shape: shape,
		position: new CANNON.Vec3(
			position[0],
			position[1] + _PLAYER_HEIGHT / 2,
			position[2],
		),
		fixedRotation: true,
		linearDamping: 0.9,
	});

	// Prevent player from sleeping
	_playerBody.allowSleep = false;

	_world.addBody(_playerBody);
	return _playerBody;
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

const _setPlayerVelocity = (x, y, z) => {
	if (!_playerBody) return;
	_playerBody.velocity.x = x;
	_playerBody.velocity.y = y;
	_playerBody.velocity.z = z;
};

const _getPlayerPosition = () => {
	if (!_playerBody) return [0, 0, 0];
	const p = _playerBody.position;
	// Offset Y down since body center is at player middle
	return [p.x, p.y - _PLAYER_HEIGHT / 2 + _PLAYER_RADIUS, p.z];
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
	createPlayerBody: _createPlayerBody,
	setPlayerVelocity: _setPlayerVelocity,
	getPlayerPosition: _getPlayerPosition,
	COLLISION_GROUPS,
};

export default Physics;
