import { mat4, vec3, glMatrix } from './dependencies/gl-matrix.js';
import Camera from './camera.js';
import MeshEntity from './meshentity.js';
import World from './world.js';

const load = () => {
    const updateGrenadeLauncher = (entity, frameTime) => {
        entity.animationTime += frameTime;
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
        mat4.translate(entity.ani_matrix, entity.ani_matrix, [0.15, -0.20, -0.3]);
        mat4.rotateY(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(180));
    };
    World.addEntities(new MeshEntity([0, 0, 0],
        'meshes/grenade_launcher.mesh',
        updateGrenadeLauncher));
};

const Weapons = {
    load
};

export { Weapons as default };
