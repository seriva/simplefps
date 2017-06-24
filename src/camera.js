import { glMatrix, mat4, vec3 } from '../node_modules/gl-matrix/dist/gl-matrix';
import Renderer from './renderer';
import Utils from './utils';
import Input from './input';
import Console from './console';

const view = mat4.create();
const projection = mat4.create();
const viewProjection = mat4.create();
const position = vec3.fromValues(0, 0, 0);
const direction = vec3.fromValues(0, 0, 1);
const rotation = vec3.fromValues(0, 0, 0);
mat4.lookAt(view, position, direction, [0, 1, 0]);

let fov = 45;
let nearPlane = 0.1;
let farPlane = 1000;

window.addEventListener('resize', () => {
    mat4.perspective(projection, glMatrix.toRadian(fov), Renderer.canvas.width / Renderer.canvas.height, nearPlane, farPlane);
}, false);

const Camera = {
    position,
    direction,
    rotation,
    viewProjection,

    setProjection(inFov, inNearPlane, inFarPlane) {
        fov = inFov;
        nearPlane = inNearPlane;
        farPlane = inFarPlane;
        Utils.dispatchEvent('resize');
    },

    setPosition(pos) {
        vec3.copy(position, pos);
    },

    setRotation(rot) {
        vec3.copy(rotation, rot);
    },

    translate(move) {
        vec3.add(position, position, move);
    },

    rotate(rot) {
        vec3.add(rotation, rotation, rot);
    },

    update(frametime) {
        if (Console.visible()) return;

        let move = 0;
        let strafe = 0;

        if (Input.isDown(87)) {
            move = move + 1;
        }
        if (Input.isDown(65)) {
            strafe = strafe - 1;
        }
        if (Input.isDown(68)) {
            strafe = strafe + 1;
        }
        if (Input.isDown(83)) {
            move = move - 1;
        }

        const v = vec3.clone(direction);
        vec3.rotateY(v, v, [0, 0, 0], glMatrix.toRadian(-90));
        move = move * (frametime * 7);
        strafe = strafe * (frametime * 7);
        position[0] = position[0] + (direction[0] * move) + (v[0] * strafe);
        position[1] = position[1] + (direction[1] * move) + (v[1] * strafe);
        position[2] = position[2] + (direction[2] * move) + (v[2] * strafe);

        mat4.lookAt(view, position, [position[0] + direction[0], position[1] + direction[1], position[2] + direction[2]], [0, 1, 0]);
        mat4.mul(viewProjection, projection, view);
    }
};

export { Camera as default };
