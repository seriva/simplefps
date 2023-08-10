import * as CANNON from '../dependencies/cannon-es.js';

let world = null;
let lastCallTime;
const timeStep = 1 / 60;

const init = () => {
    world = new CANNON.World();
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
    });
    world.quatNormalizeSkip = 0;
    world.quatNormalizeFast = false;
    const solver = new CANNON.GSSolver();
    solver.iterations = 15;
    solver.tolerance = 0.2;
    world.solver = new CANNON.SplitSolver(solver);
    world.broadphase = new CANNON.NaiveBroadphase();
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
    addBody
};

export { Physics as default };
