import * as CANNON from "../dependencies/cannon-es.js";

// Private state
let _world = null;
let _lastCallTime;
const _timeStep = 1 / 60;

// Private functions
const _init = () => {
	_world = new CANNON.World();
	_world.broadphase = new CANNON.NaiveBroadphase();
	_world.gravity.set(0, -9.82, 0);
	_world.quatNormalizeSkip = 0;
	_world.quatNormalizeFast = false;
	_world.solver.tolerance = 0.001;
	_world.solver.iterations = 15;
};

const _addBody = (body) => {
	_world.addBody(body);
};

const _update = () => {
	const time = performance.now() / 1000;
	if (!_lastCallTime) {
		_world.step(_timeStep);
	} else {
		const dt = time - _lastCallTime;
		_world.step(_timeStep, dt);
	}
	_lastCallTime = time;
};

// Public Physics API
const Physics = {
	init: _init,
	update: _update,
	addBody: _addBody,
};

export default Physics;
