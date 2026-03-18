import { glMatrix, mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Backend } from "../rendering/backend.js";
import { Settings } from "./settings.js";

// ============================================================================
// Private state
// ============================================================================

const _projection = mat4.create();
const _target = vec3.create();

let _fov = 45;
let _nearPlane = null;
let _farPlane = null;
const _origin = [0, 0, 0];

// ============================================================================
// Public Camera API
// ============================================================================

const _frustumPlanes = {
	near: new Float32Array(4),
	far: new Float32Array(4),
	left: new Float32Array(4),
	right: new Float32Array(4),
	top: new Float32Array(4),
	bottom: new Float32Array(4),
};

const _frustumPlanesArray = [
	_frustumPlanes.left,
	_frustumPlanes.right,
	_frustumPlanes.bottom,
	_frustumPlanes.top,
	_frustumPlanes.near,
	_frustumPlanes.far,
];

const Camera = {
	position: vec3.fromValues(0, 0, 0),
	rotation: vec3.fromValues(0, 0, 0),
	direction: vec3.fromValues(0, 0, 1),
	upVector: vec3.fromValues(0, 1, 0),
	view: mat4.create(),
	viewProjection: mat4.create(),
	inverseViewProjection: mat4.create(),

	frustumPlanes: _frustumPlanes,
	frustumPlanesArray: _frustumPlanesArray,

	get projection() {
		return _projection;
	},

	setProjection(inFov, inNearPlane, inFarPlane) {
		_fov = inFov;
		_nearPlane = inNearPlane;
		_farPlane = inFarPlane;
		this.updateProjection();
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
		// Limit to 88 degrees to avoid gimbal lock singularity at 90
		const MAX_VERTICAL = 88.0;
		if (this.rotation[0] > MAX_VERTICAL) this.rotation[0] = MAX_VERTICAL;
		if (this.rotation[0] < -MAX_VERTICAL) this.rotation[0] = -MAX_VERTICAL;

		// Wrap horizontal rotation
		this.rotation[1] = ((this.rotation[1] % 360) + 360) % 360;

		this._updateDirection();
	},

	_updateDirection() {
		vec3.set(this.direction, 0, 0, 1);
		vec3.rotateX(
			this.direction,
			this.direction,
			_origin,
			glMatrix.toRadian(this.rotation[0]),
		);
		vec3.rotateY(
			this.direction,
			this.direction,
			_origin,
			glMatrix.toRadian(this.rotation[1]),
		);
		vec3.normalize(this.direction, this.direction);
	},

	update() {
		vec3.add(_target, this.position, this.direction);
		mat4.lookAt(this.view, this.position, _target, this.upVector);
		mat4.mul(this.viewProjection, _projection, this.view);

		// Extract and normalize frustum planes inline (avoids 12 function calls per frame)
		const m = this.viewProjection;
		const planes = _frustumPlanesArray;
		let p, len;

		// Left plane
		p = planes[0];
		p[0] = m[3] + m[0];
		p[1] = m[7] + m[4];
		p[2] = m[11] + m[8];
		p[3] = m[15] + m[12];
		len = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
		p[0] *= len;
		p[1] *= len;
		p[2] *= len;
		p[3] *= len;

		// Right plane
		p = planes[1];
		p[0] = m[3] - m[0];
		p[1] = m[7] - m[4];
		p[2] = m[11] - m[8];
		p[3] = m[15] - m[12];
		len = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
		p[0] *= len;
		p[1] *= len;
		p[2] *= len;
		p[3] *= len;

		// Bottom plane
		p = planes[2];
		p[0] = m[3] + m[1];
		p[1] = m[7] + m[5];
		p[2] = m[11] + m[9];
		p[3] = m[15] + m[13];
		len = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
		p[0] *= len;
		p[1] *= len;
		p[2] *= len;
		p[3] *= len;

		// Top plane
		p = planes[3];
		p[0] = m[3] - m[1];
		p[1] = m[7] - m[5];
		p[2] = m[11] - m[9];
		p[3] = m[15] - m[13];
		len = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
		p[0] *= len;
		p[1] *= len;
		p[2] *= len;
		p[3] *= len;

		// Near plane
		p = planes[4];
		p[0] = m[3] + m[2];
		p[1] = m[7] + m[6];
		p[2] = m[11] + m[10];
		p[3] = m[15] + m[14];
		len = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
		p[0] *= len;
		p[1] *= len;
		p[2] *= len;
		p[3] *= len;

		// Far plane
		p = planes[5];
		p[0] = m[3] - m[2];
		p[1] = m[7] - m[6];
		p[2] = m[11] - m[10];
		p[3] = m[15] - m[14];
		len = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
		p[0] *= len;
		p[1] *= len;
		p[2] *= len;
		p[3] *= len;

		mat4.invert(this.inverseViewProjection, this.viewProjection);
	},

	updateProjection() {
		if (Backend.name === "WebGPU") {
			mat4.perspectiveZO(
				_projection,
				glMatrix.toRadian(_fov),
				Backend.getAspectRatio(),
				_nearPlane ?? Settings.zNear,
				_farPlane ?? Settings.zFar,
			);
		} else {
			mat4.perspective(
				_projection,
				glMatrix.toRadian(_fov),
				Backend.getAspectRatio(),
				_nearPlane ?? Settings.zNear,
				_farPlane ?? Settings.zFar,
			);
		}
	},
};

export { Camera };
