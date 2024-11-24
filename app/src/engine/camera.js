import { glMatrix, mat4, vec3, vec4 } from "../dependencies/gl-matrix.js";
import { Context } from "./context.js";
import Utils from "./utils.js";

const view = mat4.create();
const projection = mat4.create();
const viewProjection = mat4.create();
const position = vec3.fromValues(0, 0, 0);
const rotation = vec3.fromValues(0, 0, 0);
const direction = vec3.fromValues(0, 0, 1);
const upVector = vec3.fromValues(0, 1, 0);
const target = vec3.create();

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

const handleResize = () => {
	mat4.perspective(
		projection,
		glMatrix.toRadian(fov),
		Context.aspectRatio(),
		nearPlane,
		farPlane,
	);
};

window.addEventListener("resize", handleResize, false);

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
		Utils.dispatchEvent("resize");
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
		vec3.set(direction, 0, 0, 1);
		vec3.rotateX(direction, direction, [0, 0, 0], rotation[0]);
		vec3.rotateY(direction, direction, [0, 0, 0], rotation[1]);
		vec3.rotateZ(direction, direction, [0, 0, 0], rotation[2]);
		vec3.normalize(direction, direction);
	},

	update() {
		vec3.add(target, position, direction);
		mat4.lookAt(view, position, target, upVector);
		mat4.mul(viewProjection, projection, view);

		const m = viewProjection;
		const extractPlane = (out, a, b, c, d) => {
			out[0] = m[a];
			out[1] = m[b];
			out[2] = m[c];
			out[3] = m[d];
			vec4.normalize(out, out);
		};

		extractPlane(frustumPlanes.left, 3 + 0, 7 + 4, 11 + 8, 15 + 12);
		extractPlane(frustumPlanes.right, 3 - 0, 7 - 4, 11 - 8, 15 - 12);
		extractPlane(frustumPlanes.bottom, 3 + 1, 7 + 5, 11 + 9, 15 + 13);
		extractPlane(frustumPlanes.top, 3 - 1, 7 - 5, 11 - 9, 15 - 13);
		extractPlane(frustumPlanes.near, 3 + 2, 7 + 6, 11 + 10, 15 + 14);
		extractPlane(frustumPlanes.far, 3 - 2, 7 - 6, 11 - 10, 15 - 14);
	},

	destroy() {
		window.removeEventListener("resize", handleResize, false);
	},
};

export default Camera;
