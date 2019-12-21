import CANNON from './libs/cannon/build/cannon.js';

let world = null;

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
        0.0,
        0.3);
    world.addContactMaterial(physicsContactMaterial);
};

const addWorldCube = (x, y, z) => {
    const halfExtents = new CANNON.Vec3(1.0, 1.0, 1.0);
    const boxShape = new CANNON.Box(halfExtents);
    const boxBody = new CANNON.Body({ mass: 0 });
    boxBody.addShape(boxShape);
    world.addBody(boxBody);
    boxBody.position.set(x, y, z);
};

const update = (frameTime) => {
    world.step(frameTime);
};


const Physics = {
    init,
    update,
    addWorldCube
};

export { Physics as default };
