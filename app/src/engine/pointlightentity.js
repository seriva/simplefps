import { mat4, vec3 } from "../dependencies/gl-matrix.js";
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
}

export { PointLightEntity as default };
