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
	frustumPlanes: {
		near: vec4.create(),
		far: vec4.create(),
		left: vec4.create(),
		right: vec4.create(),
		top: vec4.create(),
		bottom: vec4.create(),
	},

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

		// Extract frustum planes from view-projection matrix
		const m = viewProjection;

		// Left plane
		vec4.set(
			this.frustumPlanes.left,
			m[3] + m[0],
			m[7] + m[4],
			m[11] + m[8],
			m[15] + m[12],
		);
		vec4.normalize(this.frustumPlanes.left, this.frustumPlanes.left);

		// Right plane
		vec4.set(
			this.frustumPlanes.right,
			m[3] - m[0],
			m[7] - m[4],
			m[11] - m[8],
			m[15] - m[12],
		);
		vec4.normalize(this.frustumPlanes.right, this.frustumPlanes.right);

		// Bottom plane
		vec4.set(
			this.frustumPlanes.bottom,
			m[3] + m[1],
			m[7] + m[5],
			m[11] + m[9],
			m[15] + m[13],
		);
		vec4.normalize(this.frustumPlanes.bottom, this.frustumPlanes.bottom);

		// Top plane
		vec4.set(
			this.frustumPlanes.top,
			m[3] - m[1],
			m[7] - m[5],
			m[11] - m[9],
			m[15] - m[13],
		);
		vec4.normalize(this.frustumPlanes.top, this.frustumPlanes.top);

		// Near plane
		vec4.set(
			this.frustumPlanes.near,
			m[3] + m[2],
			m[7] + m[6],
			m[11] + m[10],
			m[15] + m[14],
		);
		vec4.normalize(this.frustumPlanes.near, this.frustumPlanes.near);

		// Far plane
		vec4.set(
			this.frustumPlanes.far,
			m[3] - m[2],
			m[7] - m[6],
			m[11] - m[10],
			m[15] - m[14],
		);
		vec4.normalize(this.frustumPlanes.far, this.frustumPlanes.far);
	},

	destroy() {
		window.removeEventListener("resize", handleResize, false);
	},
};

export default Camera;
