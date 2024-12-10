import * as CANNON from "../dependencies/cannon-es.js";

let world = null;
let lastCallTime;
const timeStep = 1 / 60;

const init = () => {
	world = new CANNON.World();
	world.broadphase = new CANNON.NaiveBroadphase();
	world.gravity.set(0, -9.82, 0);
	world.quatNormalizeSkip = 0;
	world.quatNormalizeFast = false;
	world.solver.tolerance = 0.001;
	world.solver.iterations = 15;
};

const addBody = (body) => {
	world.addBody(body);
};

const update = () => {
	const time = performance.now() / 1000;
	if (!lastCallTime) {
		world.step(timeStep);
	} else {
		const dt = time - lastCallTime;
		world.step(timeStep, dt);
	}
	lastCallTime = time;
};

const Physics = {
	init,
	update,
	addBody,
};

export default Physics;		