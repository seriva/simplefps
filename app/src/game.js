import CANNON from './dependencies/cannon.js';
import { mat4 } from './dependencies/gl-matrix.js';
import Resources from './resources.js';
import MeshEntity from './meshentity.js';
import PointlightEntity from './pointlightentity.js';
import Camera from './camera.js';
import Physics from './physics.js';

const updatePowerup = (entity, frameTime) => {
    entity.animationTime += frameTime;
    mat4.identity(entity.ani_matrix);
    mat4.fromRotation(entity.ani_matrix, entity.animationTime / 1000, [0, 1, 0]);
    mat4.translate(entity.ani_matrix, entity.ani_matrix,
        [0, (Math.cos(Math.PI * (entity.animationTime / 1000)) * 0.15), 0]);
    entity.children.forEach((e) => {
        mat4.copy(e.ani_matrix, entity.ani_matrix);
        mat4.translate(e.ani_matrix, e.ani_matrix, [0, 0.15, 0]);
    });
};
const createPowerup = (pos, type, mesh) => {
    const powerup = new MeshEntity(pos, mesh, updatePowerup);
    switch (type) {
    case 128:
        powerup.addChild(new PointlightEntity(pos, 1.2, [0.752, 0, 0.035], 1.25));
        break;
    case 129:
        powerup.addChild(new PointlightEntity(pos, 1.2, [0, 0.352, 0.662], 1.25));
        break;
    case 130:
        powerup.addChild(new PointlightEntity(pos, 1.2, [0.623, 0.486, 0.133], 1.25));
        break;
    default:
        // code block
    }
    return powerup;
};

const ballShape = new CANNON.Sphere(0.165);
const updateBall = (entity) => {
    const q = entity.physicsBody.quaternion;
    const p = entity.physicsBody.position;
    mat4.fromRotationTranslation(
        entity.ani_matrix,
        [q.x, q.y, q.z, q.w],
        [p.x, p.y, p.z]
    );
    entity.children.forEach((e) => {
        mat4.fromTranslation(
            e.ani_matrix,
            [p.x, p.y, p.z]
        );
    });
};
const createBall = () => {
    const shoot = Resources.get('sounds/shoot.sfx');
    shoot.play();
    const p = Camera.position;
    const d = Camera.direction;
    const ballEntity = new MeshEntity([0, 0, 0], 'meshes/ball.mesh', updateBall);
    ballEntity.physicsBody = new CANNON.Body({ mass: 1 });
    ballEntity.physicsBody.position.set(p[0], p[1], p[2]);
    ballEntity.physicsBody.addShape(ballShape);
    Physics.addBody(ballEntity.physicsBody);
    ballEntity.physicsBody.velocity.set(
        d[0] * 10,
        d[1] * 10,
        d[2] * 10
    );
    ballEntity.addChild(new PointlightEntity([0, 0, 0], 2.5, [0.988, 0.31, 0.051], 1.5));
    return ballEntity;
};

const Game = {
    createBall,
    createPowerup
};

export { Game as default };
