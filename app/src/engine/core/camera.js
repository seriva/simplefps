import { glMatrix, mat4, vec3, vec4 } from "../../dependencies/gl-matrix.js";
import Utils from "../utils/utils.js";
import { Context } from "./context.js";
import Settings from "./settings.js";

// Public Camera API
const Camera = {
	position: vec3.fromValues(0, 0, 0),
	rotation: vec3.fromValues(0, 0, 0),
	direction: vec3.fromValues(0, 0, 1),
	view: mat4.create(),
	viewProjection: mat4.create(),
	frustumPlanes: {
		near: vec4.create(),
		far: vec4.create(),
		left: vec4.create(),
		right: vec4.create(),
		top: vec4.create(),
		bottom: vec4.create(),
	},

	setProjection(inFov, inNearPlane, inFarPlane) {
		_fov = inFov;
		_nearPlane = inNearPlane;
		_farPlane = inFarPlane;
		Utils.dispatchEvent("resize");
	},

	setPosition(pos) {
		vec3.copy(this.position, pos);
	},

	setRotation(rot) {
		vec3.copy(this.rotation, rot);
	},

	translate(move) {
		vec3.add(this.position, this.position, move);
	},

	rotate(rot) {
		vec3.add(this.rotation, this.rotation, rot);
		this._updateDirection();
	},

	addRotation(dx, dy) {
		this.rotation[0] += dx;
		this.rotation[1] += dy;

		// Clamp vertical rotation
		const MAX_VERTICAL = 89;
		if (this.rotation[0] > MAX_VERTICAL) this.rotation[0] = MAX_VERTICAL;
		if (this.rotation[0] < -MAX_VERTICAL) this.rotation[0] = -MAX_VERTICAL;

		// Wrap horizontal rotation
		if (this.rotation[1] > 360) this.rotation[1] -= 360;
		if (this.rotation[1] < 0) this.rotation[1] += 360;

		this._updateDirection();
	},

	_updateDirection() {
		vec3.set(this.direction, 0, 0, 1);
		vec3.rotateX(
			this.direction,
			this.direction,
			[0, 0, 0],
			glMatrix.toRadian(this.rotation[0]),
		);
		vec3.rotateY(
			this.direction,
			this.direction,
			[0, 0, 0],
			glMatrix.toRadian(this.rotation[1]),
		);
		vec3.normalize(this.direction, this.direction);
	},

	update() {
		vec3.add(_target, this.position, this.direction);
		mat4.lookAt(this.view, this.position, _target, _upVector);
		mat4.mul(this.viewProjection, _projection, this.view);

		// Extract frustum planes from view-projection matrix
		const m = this.viewProjection;

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
		window.removeEventListener("resize", _handleResize, false);
	},
};

export default Camera;

// Private state
const _projection = mat4.create();
const _upVector = vec3.fromValues(0, 1, 0);
const _target = vec3.create();

let _fov = 45;
let _nearPlane = null;
let _farPlane = null;

// Private functions
const _handleResize = () => {
	mat4.perspective(
		_projection,
		glMatrix.toRadian(_fov),
		Context.aspectRatio(),
		_nearPlane ?? Settings.zNear,
		_farPlane ?? Settings.zFar,
	);
};

window.addEventListener("resize", _handleResize, false);
