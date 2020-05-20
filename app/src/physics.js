import CANNON from './dependencies/cannon.js';

let world = null;
const worldCube = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));

const init = () => {
    world = new CANNON.World();
    world.quatNormalizeSkip = 0;
    world.quatNormalizeFast = false;
    const solver = new CANNON.GSSolver();
    world.defaultContactMaterial.contactEquationStiffness = 1e9;
    world.defaultContactMaterial.contactEquationRelaxation = 4;
    solver.iterations = 7;
    solver.tolerance = 0.1;
    world.solver = new CANNON.SplitSolver(solver);
    world.gravity.set(0, -9.8, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    const physicsMaterial = new CANNON.Material('slipperyMaterial');
    const physicsContactMaterial = new CANNON.ContactMaterial(physicsMaterial,
        physicsMaterial,
        0,
        0.2);
    world.addContactMaterial(physicsContactMaterial);
};

const addWorldCube = (x, y, z) => {
    const worldCubeBody = new CANNON.Body({ mass: 0 });
    worldCubeBody.addShape(worldCube);
    world.addBody(worldCubeBody);
    worldCubeBody.position.set(x, y, z);
};

const addBody = (body) => {
    world.addBody(body);
};

const update = (frameTime) => {
    world.step(frameTime / 1000);
};

const Physics = {
    init,
    update,
    addWorldCube,
    addBody
};

export { Physics as default };
