import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Shaders } from "../rendering/shaders.js";
import { pointLightVolume } from "../rendering/shapes.js";
import { Entity, EntityTypes } from "./entity.js";

class PointLightEntity extends Entity {
	static SCALE_FACTOR = 0.625;

	#getTransformMatrix() {
		const m = mat4.create();
		mat4.multiply(m, this.base_matrix, this.ani_matrix);
		const size = this.size * PointLightEntity.SCALE_FACTOR;
		mat4.scale(m, m, [size, size, size]);
		return m;
	}

	constructor(position, size, color, intensity, updateCallback) {
		super(EntityTypes.POINT_LIGHT, updateCallback);
		this.color = color;
		this.size = size;
		this.intensity = intensity;
		mat4.translate(this.base_matrix, this.base_matrix, position);
	}

	render() {
		// Get the actual light transform (without volume scaling) for accurate position
		const lightTransform = mat4.create();
		mat4.multiply(lightTransform, this.base_matrix, this.ani_matrix);
		const pos = vec3.create();
		mat4.getTranslation(pos, lightTransform);

		// Get the scaled volume transform for rendering the light volume geometry
		const volumeTransform = this.#getTransformMatrix();

		Shaders.pointLight.setMat4("matWorld", volumeTransform);
		Shaders.pointLight.setVec3("pointLight.position", pos);
		Shaders.pointLight.setVec3("pointLight.color", this.color);
		Shaders.pointLight.setFloat("pointLight.size", this.size);
		Shaders.pointLight.setFloat("pointLight.intensity", this.intensity);
		pointLightVolume.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = this.#getTransformMatrix();
		Shaders.debug.setMat4("matWorld", m);
		pointLightVolume.renderWireFrame();
	}

	updateBoundingVolume() {
		const unitBox = pointLightVolume.boundingBox;
		const m = this.#getTransformMatrix();
		this.boundingBox = unitBox.transform(m);
	}
}

export default PointLightEntity;
