import { mat4, vec3, glMatrix } from './dependencies/gl-matrix.js';
import Camera from './camera.js';
import MeshEntity from './meshentity.js';
import World from './world.js';
import Physics from './physics.js';
import CANNON from './dependencies/cannon.js';
import Resources from './resources.js';
import PointlightEntity from './pointlightentity.js';
import FpsMeshEntity from './fpsmeshentity.js';

let grenadeLauncher = null;
let firing = false;
let firingStart = 0;
let firingTimer = 0;

const grenadeShape = new CANNON.Sphere(0.2);
const updateGrenade = (entity) => {
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
const shootGrenade = () => {
    if (firing) return;
    firing = true;
    firingStart = performance.now();
    firingTimer = 0;
    const shoot = Resources.get('sounds/shoot.sfx');
    shoot.play();
    const p = vec3.create();
    mat4.getTranslation(p, grenadeLauncher.ani_matrix);
    const d = Camera.direction;
    const ballEntity = new MeshEntity([0, 0, 0], 'meshes/ball.mesh', updateGrenade);
    ballEntity.physicsBody = new CANNON.Body({ mass: 0.5 });
    ballEntity.physicsBody.position.set(p[0] + d[0], p[1] + d[1] + 0.2, p[2] + d[2]);
    ballEntity.physicsBody.addShape(grenadeShape);
    Physics.addBody(ballEntity.physicsBody);
    ballEntity.physicsBody.velocity.set(
        d[0] * 20,
        d[1] * 20,
        d[2] * 20
    );
    ballEntity.addChild(new PointlightEntity([0, 0, 0], 2.5, [0.988, 0.31, 0.051], 1.75));
    World.addEntities(ballEntity);
};

const load = () => {
    const updateGrenadeLauncher = (entity, frameTime) => {
        entity.animationTime += frameTime;
        let fireAnim = 0;
        if (firing) {
            const dt = performance.now() - firingStart;
            firingTimer += frameTime;
            console.log(dt, firingStart,);
            if (dt > 500) {
                firing = false;
            }
            fireAnim = (Math.cos(Math.PI * (firingTimer / 1000)) * 0.12);
        }
        const dir = vec3.create();
        const pos = vec3.create();
        vec3.copy(dir, Camera.direction);
        vec3.copy(pos, Camera.position);
        mat4.identity(entity.ani_matrix);
        mat4.lookAt(
            entity.ani_matrix,
            pos,
            [pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2]],
            [0, 1, 0]
        );
        mat4.invert(entity.ani_matrix, entity.ani_matrix);
        mat4.translate(entity.ani_matrix, entity.ani_matrix, [
            0.15 + (Math.cos(Math.PI * (entity.animationTime / 1500)) * 0.005),
            -0.20 + (Math.sin(Math.PI * (entity.animationTime / 1400)) * 0.01),
            -0.3 + fireAnim]);
        mat4.rotateY(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(180));
        mat4.rotateX(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(-2.5));
    };
    grenadeLauncher = new FpsMeshEntity([0, 0, 0],
        'meshes/grenade_launcher.mesh',
        updateGrenadeLauncher);
    World.addEntities(grenadeLauncher);
};

const Weapons = {
    load,
    shootGrenade
};

export { Weapons as default };
