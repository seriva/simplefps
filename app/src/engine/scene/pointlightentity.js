import { mat4 } from "../../dependencies/gl-matrix.js";
import { BoundingBox } from "../physics/boundingbox.js";
import { Shaders } from "../rendering/shaders.js";
import { Shapes } from "../rendering/shapes.js";
import { Entity, EntityTypes } from "./entity.js";

class PointLightEntity extends Entity {
	static SCALE_FACTOR = 1.0;
	static _tempMatrix = mat4.create();
	static _tempPos = new Float32Array(3);
	static _posRange = new Float32Array(4);
	static _colorIntensity = new Float32Array(4);

	_getTransformMatrix() {
		const m = PointLightEntity._tempMatrix;
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
			PointLightEntity._tempMatrix,
			this.base_matrix,
			this.ani_matrix,
		);
		mat4.getTranslation(
			PointLightEntity._tempPos,
			PointLightEntity._tempMatrix,
		);

		// Get the scaled volume transform for rendering the light volume geometry
		const volumeTransform = this._getTransformMatrix();

		Shaders.pointLight.setMat4("matWorld", volumeTransform);
		const p = PointLightEntity._tempPos;
		const pr = PointLightEntity._posRange;
		pr[0] = p[0];
		pr[1] = p[1];
		pr[2] = p[2];
		pr[3] = this.size;
		Shaders.pointLight.setVec4("pointLight.posRange", pr);
		const ci = PointLightEntity._colorIntensity;
		ci[0] = this.color[0];
		ci[1] = this.color[1];
		ci[2] = this.color[2];
		ci[3] = this.intensity;
		Shaders.pointLight.setVec4("pointLight.colorIntensity", ci);
		Shapes.pointLightVolume.renderSingle();
	}

	renderWireFrame() {
		if (!this.visible) return;
		const m = this._getTransformMatrix();
		Shaders.debug.setMat4("matWorld", m);
		Shapes.pointLightVolume.renderWireFrame();
	}

	updateBoundingVolume() {
		const unitBox = Shapes.pointLightVolume.boundingBox;
		const m = this._getTransformMatrix();
		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}
		unitBox.transformInto(m, this.boundingBox);
	}
}

export { PointLightEntity };
