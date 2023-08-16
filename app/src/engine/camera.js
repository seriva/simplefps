import {
    glMatrix, mat4, vec3, vec4
} from '../dependencies/gl-matrix.js';
import { Context } from './context.js';
import Utils from './utils.js';

const view = mat4.create();
const projection = mat4.create();
const viewProjection = mat4.create();
const position = vec3.fromValues(0, 0, 0);
const rotation = vec3.fromValues(0, 0, 0);
const direction = vec3.fromValues(0, 0, 1);
mat4.lookAt(view, position, [0, 0, 1], [0, 1, 0]);

const frustumPlanes = {
    left: vec4.create(),
    right: vec4.create(),
    bottom: vec4.create(),
    top: vec4.create(),
    near: vec4.create(),
    far: vec4.create(),
};

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

        // calculate frustum
        // Left plane
        frustumPlanes.left[0] = viewProjection[3] + viewProjection[0];
        frustumPlanes.left[1] = viewProjection[7] + viewProjection[4];
        frustumPlanes.left[2] = viewProjection[11] + viewProjection[8];
        frustumPlanes.left[3] = viewProjection[15] + viewProjection[12];

        // Right plane
        frustumPlanes.right[0] = viewProjection[3] - viewProjection[0];
        frustumPlanes.right[1] = viewProjection[7] - viewProjection[4];
        frustumPlanes.right[2] = viewProjection[11] - viewProjection[8];
        frustumPlanes.right[3] = viewProjection[15] - viewProjection[12];

        // Bottom plane
        frustumPlanes.bottom[0] = viewProjection[3] + viewProjection[1];
        frustumPlanes.bottom[1] = viewProjection[7] + viewProjection[5];
        frustumPlanes.bottom[2] = viewProjection[11] + viewProjection[9];
        frustumPlanes.bottom[3] = viewProjection[15] + viewProjection[13];

        // Top plane
        frustumPlanes.top[0] = viewProjection[3] - viewProjection[1];
        frustumPlanes.top[1] = viewProjection[7] - viewProjection[5];
        frustumPlanes.top[2] = viewProjection[11] - viewProjection[9];
        frustumPlanes.top[3] = viewProjection[15] - viewProjection[13];

        // Near plane
        frustumPlanes.near[0] = viewProjection[3] + viewProjection[2];
        frustumPlanes.near[1] = viewProjection[7] + viewProjection[6];
        frustumPlanes.near[2] = viewProjection[11] + viewProjection[10];
        frustumPlanes.near[3] = viewProjection[15] + viewProjection[14];

        // Far plane
        frustumPlanes.far[0] = viewProjection[3] - viewProjection[2];
        frustumPlanes.far[1] = viewProjection[7] - viewProjection[6];
        frustumPlanes.far[2] = viewProjection[11] - viewProjection[10];
        frustumPlanes.far[3] = viewProjection[15] - viewProjection[14];

        // Normalize the frustum plane normals
        /* eslint-disable */
        for (const plane in frustumPlanes) {
            if (Object.hasOwn(frustumPlanes, plane)) {
                vec4.normalize(frustumPlanes[plane], frustumPlanes[plane]);
            }
        }
        /* eslint-enable */
    }
};

export { Camera as default };
