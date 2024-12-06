import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import BoundingBox from "./boundingbox.js";
import { Entity, EntityTypes } from "./entity.js";
import { Shaders } from "./shaders.js";
import { lightSphere } from "./shapes.js";

class PointLightEntity extends Entity {
	constructor(position, size, color, intensity, updateCallback) {
		super(EntityTypes.POINT_LIGHT, updateCallback);
		this.color = color;
		this.size = size;
		this.intensity = intensity;
		mat4.translate(this.base_matrix, this.base_matrix, position);
		
		// Initialize the bounding box
		this.boundingBox = new BoundingBox(
			vec3.fromValues(-size, -size, -size),
			vec3.fromValues(size, size, size)
		);
	}

	render() {
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		mat4.scale(m, m, [this.size, this.size, this.size]);
		const pos = vec3.create();
		mat4.getTranslation(pos, m);
		Shaders.pointLight.setMat4("matWorld", m);
		Shaders.pointLight.setInt("lightType", 1);
		Shaders.pointLight.setVec3("pointLight.position", pos);
		Shaders.pointLight.setVec3("pointLight.color", this.color);
		Shaders.pointLight.setFloat("pointLight.size", this.size);
		Shaders.pointLight.setFloat("pointLight.intensity", this.intensity);
		lightSphere.renderSingle();
	}

	updateBoundingVolume() {
		// Get the final world position including animation
		const pos = vec3.create();
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		mat4.getTranslation(pos, m);
		
		// Create a new box at the light's position
		this.boundingBox = new BoundingBox(
			vec3.fromValues(pos[0] - this.size, pos[1] - this.size, pos[2] - this.size),
			vec3.fromValues(pos[0] + this.size, pos[1] + this.size, pos[2] + this.size)
		);
	}
}

export { PointLightEntity as default };
