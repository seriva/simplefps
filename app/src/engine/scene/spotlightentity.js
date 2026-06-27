import { mat4, quat, vec3 } from "../../dependencies/gl-matrix.js";
import { BoundingBox } from "../physics/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import { Shapes } from "../rendering/shapes.js";
import { Entity, EntityTypes } from "./entity.js";

// Reusable temp matrix and scratch vec4s to avoid allocations
const _tempMatrix = mat4.create();
const _posRange = new Float32Array(4);
const _colorIntensity = new Float32Array(4);
const _dirCutoff = new Float32Array(4);

class SpotLightEntity extends Entity {
	// Private fields — single source of truth for position/direction
	_position;
	_direction;

	constructor(
		position,
		direction,
		color,
		intensity = 1.0,
		angle = 45,
		range = 10,
		updateCallback = null,
	) {
		super(EntityTypes.SPOT_LIGHT, updateCallback);

		this.color = color;
		this.intensity = intensity;
		this.angle = angle;
		this.range = range;

		// Calculate cosine of cutoff angle for efficient spotlight calculations
		this.cutoff = Math.cos((angle * Math.PI) / 180);

		// Store position/direction as private fields — base_matrix is derived, never the source
		this._position = vec3.clone(position);
		this._direction = vec3.normalize(vec3.create(), direction);

		// Build transformation matrix from private fields
		this.base_matrix = this._buildTransformMatrix();

		// Create the bounding box with initial values
		this.boundingBox = new BoundingBox(
			vec3.clone(this._position),
			vec3.clone(this._position),
		);
		this.updateBoundingVolume();
	}

	// Read-only accessors — callers must use setPosition/setDirection to mutate
	get position() {
		return this._position;
	}

	get direction() {
		return this._direction;
	}

	setPosition(position) {
		vec3.copy(this._position, position);
		this.base_matrix = this._buildTransformMatrix();
		this.updateBoundingVolume();
	}

	setDirection(direction) {
		vec3.normalize(this._direction, direction);
		this.base_matrix = this._buildTransformMatrix();
		this.updateBoundingVolume();
	}

	// Private method to build the transformation matrix from current private state
	_buildTransformMatrix() {
		const defaultDir = vec3.fromValues(0, 0, -1);

		// Calculate rotation using quaternion
		const rotationQuat = quat.rotationTo(
			quat.create(),
			defaultDir,
			this._direction,
		);
		const rotationMat = mat4.fromQuat(mat4.create(), rotationQuat);

		const matrix = mat4.create();

		// T * R * S
		mat4.translate(matrix, matrix, this._position);
		mat4.multiply(matrix, matrix, rotationMat);

		const radius = Math.tan((this.angle * Math.PI) / 180) * this.range;
		mat4.scale(matrix, matrix, [radius, radius, this.range]);

		return matrix;
	}

	// Private helper to get world transform matrix
	_getWorldMatrix() {
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		return _tempMatrix;
	}

	render() {
		if (!this.visible) return;

		const m = this._getWorldMatrix();

		// Set shader uniforms (shader already bound by RenderPasses)
		Shaders.spotLight.setMat4("matWorld", m);
		_posRange[0] = this._position[0];
		_posRange[1] = this._position[1];
		_posRange[2] = this._position[2];
		_posRange[3] = this.range;
		Shaders.spotLight.setVec4("spotLight.posRange", _posRange);
		_colorIntensity[0] = this.color[0];
		_colorIntensity[1] = this.color[1];
		_colorIntensity[2] = this.color[2];
		_colorIntensity[3] = this.intensity;
		Shaders.spotLight.setVec4("spotLight.colorIntensity", _colorIntensity);
		_dirCutoff[0] = this._direction[0];
		_dirCutoff[1] = this._direction[1];
		_dirCutoff[2] = this._direction[2];
		_dirCutoff[3] = this.cutoff;
		Shaders.spotLight.setVec4("spotLight.dirCutoff", _dirCutoff);

		Shapes.spotlightVolume.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = this._getWorldMatrix();
		Shaders.debug.setMat4("matWorld", m);
		Shapes.spotlightVolume.renderWireFrame();
	}

	updateBoundingVolume() {
		const unitBox = Shapes.spotlightVolume.boundingBox;
		const m = this._getWorldMatrix();
		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}
		unitBox.transformInto(m, this.boundingBox);
	}
}

export { SpotLightEntity };
