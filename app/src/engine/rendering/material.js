import { gl } from "../core/context.js";
import { Shaders } from "./shaders.js";
import Texture from "./texture.js";

// Texture slot definitions: maps slot name → texture unit + shader sampler
const TEXTURE_SLOTS = {
	albedo: { unit: 0, sampler: "colorSampler" },
	emissive: { unit: 1, sampler: "emissiveSampler" },
	reflection: { unit: 2, sampler: "reflectionSampler" },
	reflectionMask: { unit: 3, sampler: "reflectionMaskSampler" },
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
		this.reflectionStrength = data.reflectionStrength ?? 1.0;
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

		// Infer flags from texture presence
		const hasReflection = this.textures.reflection ? 1 : 0;
		const hasEmissive = this.textures.emissive ? 1 : 0;

		// Material-specific uniforms
		shader.setInt("doReflection", hasReflection);
		shader.setFloat("reflectionStrength", this.reflectionStrength);

		if (shader !== Shaders.glass) {
			shader.setInt("geomType", this.geomType);
			shader.setInt("doEmissive", hasEmissive);
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
