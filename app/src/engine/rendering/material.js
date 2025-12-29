import { gl } from "../core/context.js";
import { Shaders } from "./shaders.js";
import Texture from "./texture.js";

// Texture slot definitions: maps slot name → texture unit + shader sampler
const TEXTURE_SLOTS = {
	albedo: { unit: 0, sampler: "colorSampler" },
	emissive: { unit: 1, sampler: "emissiveSampler" },
	sem: { unit: 2, sampler: "semSampler" },
	semApply: { unit: 3, sampler: "semApplySampler" },
	lightmap: { unit: 4, sampler: "lightmapSampler" },
};

class Material {
	constructor(data, resources) {
		if (!data || !resources) {
			throw new Error("Material requires data and resources");
		}

		this.resources = resources;
		this.name = data.name;
		this.textures = data.textures || {};
		this.geomType = data.geomType || 1;
		this.doEmissive = data.doEmissive || 0;
		this.doSEM = data.doSEM || 0;
		this.semMult = data.semMult || 0;
		this.translucent = data.translucent || false;
		this.opacity = data.opacity !== undefined ? data.opacity : 1.0;

		// Load all referenced textures
		for (const texturePath of Object.values(this.textures)) {
			if (texturePath) {
				resources.load([texturePath]);
			}
		}
	}

	bind(shader = Shaders.geometry) {
		if (!shader) shader = Shaders.geometry;

		// Bind textures using the slot definitions
		for (const [slotName, { unit, sampler }] of Object.entries(TEXTURE_SLOTS)) {
			const texturePath = this.textures[slotName];
			if (texturePath) {
				shader.setInt(sampler, unit);
				this.resources.get(texturePath).bind(gl.TEXTURE0 + unit);
			}
		}

		// Material-specific uniforms
		shader.setInt("doSEM", this.doSEM);
		shader.setFloat("semMult", this.semMult);

		if (shader !== Shaders.glass) {
			shader.setInt("geomType", this.geomType);
			shader.setInt("doEmissive", this.doEmissive);
			shader.setInt("hasLightmap", this.textures.lightmap ? 1 : 0);
		} else {
			shader.setFloat("opacity", this.opacity);
		}
	}

	unBind() {
		for (const { unit } of Object.values(TEXTURE_SLOTS)) {
			Texture.unBind(gl.TEXTURE0 + unit);
		}
	}
}

export default Material;
