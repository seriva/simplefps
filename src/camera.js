import { glMatrix, mat4, vec3 } from 'gl-matrix';
import Renderer from './renderer';
import Utils from './utils';
import Input from './input';
import Console from './console';

const view = mat4.create();
const projection = mat4.create();
const viewProjection = mat4.create();
const position = vec3.fromValues(0, 0, 0);
const rotation = vec3.fromValues(0, 0, 0);
mat4.lookAt(view, position, [0, 0, 1], [0, 1, 0]);

let fov = 45;
let nearPlane = 0.1;
let farPlane = 1000;

window.addEventListener('resize', () => {
    mat4.perspective(projection, glMatrix.toRadian(fov), Renderer.canvas.width / Renderer.canvas.height, nearPlane, farPlane);
}, false);

const Camera = {
    position,
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

        const ft = frametime / 1000;
        const direction = vec3.fromValues(0, 0, 1);

        // look
        const mpos = Input.cursorMovement();
        rotation[0] = rotation[0] - (mpos.x/15);
        rotation[1] = rotation[1] + (mpos.y/15);
        if (rotation[1]>89) { rotation[1] = 89; }
        if (rotation[1]<-89) { rotation[1] = -89; }
        if (rotation[0]<0) { rotation[0] = 360; }
        if (rotation[0]>360) { rotation[0] = 0; }
        direction[0] = 0; direction[1] = 0; direction[2] = 1;
        vec3.rotateX(direction, direction, [0, 0, 0], glMatrix.toRadian(rotation[1]));
        vec3.rotateY(direction, direction, [0, 0, 0], glMatrix.toRadian(rotation[0]));
        console.log(rotation);

        // movement
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
        v[1] = 0;
        vec3.rotateY(v, v, [0, 0, 0], glMatrix.toRadian(-90));
        move = move * (ft * 7);
        strafe = strafe * (ft * 7);
        position[0] = position[0] + (direction[0] * move) + (v[0] * strafe);
        position[1] = position[1] + (direction[1] * move) + (v[1] * strafe);
        position[2] = position[2] + (direction[2] * move) + (v[2] * strafe);

        mat4.lookAt(view, position, [position[0] + direction[0], position[1] + direction[1], position[2] + direction[2]], [0, 1, 0]);
        mat4.mul(viewProjection, projection, view);
    }
};

export { Camera as default };
