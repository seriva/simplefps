import { Backend } from "./backend.js";
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
		this.doubleSided = data.doubleSided || false;
		this.opacity = data.opacity !== undefined ? data.opacity : 1.0;
		this.ubo = null;

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
			if (texturePath && this.resources.has(texturePath)) {
				shader.setInt(sampler, unit);
				// bind() in Texture.js calls backend.bindTexture(unit)
				// We pass 'unit' (0,1,2...), which Texture.js passes to Backend.
				// Backend is now fixed to handle 0,1,2 correctly.
				this.resources.get(texturePath).bind(unit);
			}
		}

		// Material UBO (Binding Point 1)
		if (!this.ubo) {
			this._createUBO();
		}

		Backend.bindUniformBuffer(this.ubo);

		// Handle double-sided materials
		if (this.doubleSided) {
			Backend.setCullState(false);
		} else if (!this.translucent) {
			Backend.setCullState(true, "back");
		}
	}

	_createUBO() {
		// Layout std140:
		// ivec4 flags;  // 16 bytes (geomType, doEmissive, doReflection, hasLightmap)
		// vec4 params;  // 16 bytes (reflectionStrength, opacity, pad, pad)
		// Total: 32 bytes

		const data = new Int32Array(8); // 32 bytes
		// Flags
		data[0] = this.geomType;
		data[1] = this.textures.emissive ? 1 : 0;
		data[2] = this.textures.reflection ? 1 : 0;
		data[3] = this.textures.lightmap ? 1 : 0;

		// Params (cast to float view)
		const floatView = new Float32Array(data.buffer);
		floatView[4] = this.reflectionStrength;
		floatView[5] = this.opacity;

		// Create UBO via backend (size 32 bytes, binding point 1)
		// We create it first
		this.ubo = Backend.createUBO(32, 1);

		// Then update logic
		Backend.updateUBO(this.ubo, data);
	}

	unBind() {
		for (const { unit } of Object.values(TEXTURE_SLOTS)) {
			Texture.unBind(unit);
		}
	}
}

export default Material;
