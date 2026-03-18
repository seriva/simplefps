import { mat4, quat, vec3 } from "../../dependencies/gl-matrix.js";
import { BoundingBox } from "../physics/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import { Shapes } from "../rendering/shapes.js";
import { Entity, EntityTypes } from "./entity.js";

// Reusable temp matrix to avoid allocations
const _tempMatrix = mat4.create();

class SpotLightEntity extends Entity {
	// Private fields — single source of truth for position/direction
	#position;
	#direction;

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
		this.#position = vec3.clone(position);
		this.#direction = vec3.normalize(vec3.create(), direction);

		// Build transformation matrix from private fields
		this.base_matrix = this.#buildTransformMatrix();

		// Create the bounding box with initial values
		this.boundingBox = new BoundingBox(
			vec3.clone(this.#position),
			vec3.clone(this.#position),
		);
		this.updateBoundingVolume();
	}

	// Read-only accessors — callers must use setPosition/setDirection to mutate
	get position() {
		return this.#position;
	}

	get direction() {
		return this.#direction;
	}

	setPosition(position) {
		vec3.copy(this.#position, position);
		this.base_matrix = this.#buildTransformMatrix();
		this.updateBoundingVolume();
	}

	setDirection(direction) {
		vec3.normalize(this.#direction, direction);
		this.base_matrix = this.#buildTransformMatrix();
		this.updateBoundingVolume();
	}

	// Private method to build the transformation matrix from current private state
	#buildTransformMatrix() {
		const defaultDir = vec3.fromValues(0, 0, -1);

		// Calculate rotation using quaternion
		const rotationQuat = quat.rotationTo(
			quat.create(),
			defaultDir,
			this.#direction,
		);
		const rotationMat = mat4.fromQuat(mat4.create(), rotationQuat);

		const matrix = mat4.create();

		// T * R * S
		mat4.translate(matrix, matrix, this.#position);
		mat4.multiply(matrix, matrix, rotationMat);

		const radius = Math.tan((this.angle * Math.PI) / 180) * this.range;
		mat4.scale(matrix, matrix, [radius, radius, this.range]);

		return matrix;
	}

	// Private helper to get world transform matrix
	#getWorldMatrix() {
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		return _tempMatrix;
	}

	render() {
		if (!this.visible) return;

		const m = this.#getWorldMatrix();

		// Set shader uniforms (shader already bound by RenderPasses)
		Shaders.spotLight.setMat4("matWorld", m);
		Shaders.spotLight.setVec3("spotLight.position", this.#position);
		Shaders.spotLight.setVec3("spotLight.direction", this.#direction);
		Shaders.spotLight.setVec3("spotLight.color", this.color);
		Shaders.spotLight.setFloat("spotLight.intensity", this.intensity);
		Shaders.spotLight.setFloat("spotLight.cutoff", this.cutoff);
		Shaders.spotLight.setFloat("spotLight.range", this.range);

		Shapes.spotlightVolume.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = this.#getWorldMatrix();
		Shaders.debug.setMat4("matWorld", m);
		Shapes.spotlightVolume.renderWireFrame();
	}

	updateBoundingVolume() {
		const unitBox = Shapes.spotlightVolume.boundingBox;
		const m = this.#getWorldMatrix();
		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}
		unitBox.transformInto(m, this.boundingBox);
	}
}

export { SpotLightEntity };
