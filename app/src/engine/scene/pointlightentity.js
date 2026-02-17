import { mat4 } from "../../dependencies/gl-matrix.js";
import BoundingBox from "../physics/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import { Entity, EntityTypes } from "./entity.js";

class PointLightEntity extends Entity {
	static SCALE_FACTOR = 0.625;
	static #tempMatrix = mat4.create();
	static #tempPos = new Float32Array(3);

	#getTransformMatrix() {
		const m = PointLightEntity.#tempMatrix;
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
		if (!this.visible) return;

		// Get the actual light position (without volume scaling)
		mat4.multiply(
			PointLightEntity.#tempMatrix,
			this.base_matrix,
			this.ani_matrix,
		);
		mat4.getTranslation(
			PointLightEntity.#tempPos,
			PointLightEntity.#tempMatrix,
		);

		// Get the scaled volume transform for rendering the light volume geometry
		const volumeTransform = this.#getTransformMatrix();

		Shaders.pointLight.setMat4("matWorld", volumeTransform);
		Shaders.pointLight.setVec3(
			"pointLight.position",
			PointLightEntity.#tempPos,
		);
		Shaders.pointLight.setVec3("pointLight.color", this.color);
		Shaders.pointLight.setFloat("pointLight.size", this.size);
		Shaders.pointLight.setFloat("pointLight.intensity", this.intensity);
		Shapes.pointLightVolume.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = this.#getTransformMatrix();
		Shaders.debug.setMat4("matWorld", m);
		Shapes.pointLightVolume.renderWireFrame();
	}

	updateBoundingVolume() {
		const unitBox = Shapes.pointLightVolume.boundingBox;
		const m = this.#getTransformMatrix();
		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}
		unitBox.transformInto(m, this.boundingBox);
	}
}

export default PointLightEntity;
