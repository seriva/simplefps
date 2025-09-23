import { mat4, quat, vec3 } from "../dependencies/gl-matrix.js";
import BoundingBox from "./boundingbox.js";
import { Entity, EntityTypes } from "./entity.js";
import { Shaders } from "./shaders.js";
import { spotlightVolume } from "./shapes.js";

class SpotLightEntity extends Entity {
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

		this.position = position;
		this.direction = vec3.normalize(vec3.create(), direction);
		this.color = color;
		this.intensity = intensity;
		this.angle = angle;
		this.range = range;

		// Calculate cosine of cutoff angle for efficient spotlight calculations
		this.cutoff = Math.cos((angle * Math.PI) / 180);

		// Create base transform for the light volume
		const defaultDir = vec3.fromValues(0, 0, -1);

		// Calculate rotation using quaternion
		const rotationQuat = quat.rotationTo(
			quat.create(),
			defaultDir,
			this.direction,
		);
		const rotationMat = mat4.fromQuat(mat4.create(), rotationQuat);

		// Build transformation matrix in correct order:
		// 1. Start with identity matrix
		this.base_matrix = mat4.create();

		// 2. Apply translation first
		mat4.translate(this.base_matrix, this.base_matrix, position);

		// 3. Apply rotation
		mat4.multiply(this.base_matrix, this.base_matrix, rotationMat);

		// 4. Apply scale last
		const radius = Math.tan((angle * Math.PI) / 180) * range;
		mat4.scale(this.base_matrix, this.base_matrix, [radius, radius, range]);

		// Create the bounding box with initial values
		this.boundingBox = new BoundingBox(
			vec3.clone(position),
			vec3.clone(position),
		);
		this.updateBoundingVolume();
	}

	render() {
		if (!this.visible) return;

		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);

		// Render light volume
		Shaders.spotLight.bind();
		Shaders.spotLight.setMat4("matWorld", m);
		Shaders.spotLight.setVec3("spotLight.position", this.position);
		Shaders.spotLight.setVec3("spotLight.direction", this.direction);
		Shaders.spotLight.setVec3("spotLight.color", this.color);
		Shaders.spotLight.setFloat("spotLight.intensity", this.intensity);
		Shaders.spotLight.setFloat("spotLight.cutoff", this.cutoff);
		Shaders.spotLight.setFloat("spotLight.range", this.range);

		spotlightVolume.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		Shaders.debug.setMat4("matWorld", m);
		spotlightVolume.renderWireFrame();
	}

	updateBoundingVolume() {
		const unitBox = spotlightVolume.boundingBox;
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		this.boundingBox = unitBox.transform(m);
	}
}

export default SpotLightEntity;
