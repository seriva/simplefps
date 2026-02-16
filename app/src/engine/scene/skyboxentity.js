import { mat4 } from "../../dependencies/gl-matrix.js";
import Camera from "../core/camera.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

class SkyboxEntity extends Entity {
	static FACE_NAMES = ["front", "back", "top", "bottom", "right", "left"];

	constructor(id, updateCallback) {
		super(EntityTypes.SKYBOX, updateCallback);
		this.shader = Shaders.geometry;

		// Initialize shape resources once
		if (!Shapes.skyBox.resources) {
			Shapes.skyBox.resources = Resources;
		}

		// Set material names
		for (const [i, index] of Shapes.skyBox.indices.entries()) {
			index.material = `mat_skybox_${id}_${SkyboxEntity.FACE_NAMES[i]}`;
		}
	}

	render() {
		// Update matrix with camera position
		this.#updateMatrix();

		// Set shader uniforms (matViewProj now in FrameData UBO)
		this.shader.setMat4("matWorld", this.base_matrix);
		// Set probe color (ignored by shader for skybox, but required for bind group)
		this.shader.setVec3("uProbeColor", [1, 1, 1]);

		// Render (GL state managed by RenderPasses)
		Shapes.skyBox.renderSingle();
	}

	renderWireFrame() {
		// Update matrix with camera position
		this.#updateMatrix();

		// Set shader uniforms (matViewProj now in FrameData UBO)
		Shaders.debug.setMat4("matWorld", this.base_matrix);

		// Render
		Shapes.skyBox.renderWireFrame();
	}

	// Private method to update matrix with camera position
	#updateMatrix() {
		mat4.translate(this.base_matrix, this.ani_matrix, Camera.position);
	}
}

export default SkyboxEntity;
