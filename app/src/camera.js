import { glMatrix, mat4, vec3 } from './dependencies/gl-matrix.js';
import { Context } from './context.js';
import Utils from './utils.js';

const view = mat4.create();
const projection = mat4.create();
const viewProjection = mat4.create();
const position = vec3.fromValues(0, 0, 0);
const rotation = vec3.fromValues(0, 0, 0);
const direction = vec3.fromValues(0, 0, 1);
mat4.lookAt(view, position, [0, 0, 1], [0, 1, 0]);

let fov = 45;
let nearPlane = 0.1;
let farPlane = 1000;

window.addEventListener(
    'resize',
    () => {
        mat4.perspective(projection, glMatrix.toRadian(fov), Context.aspectRatio(), nearPlane, farPlane);
    },
    false
);

const Camera = {
    position,
    rotation,
    direction,
    view,
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

    update() {
        mat4.lookAt(
            view,
            position,
            [position[0] + direction[0], position[1] + direction[1], position[2] + direction[2]],
            [0, 1, 0]
        );
        mat4.mul(viewProjection, projection, view);
    }
};

export { Camera as default };
