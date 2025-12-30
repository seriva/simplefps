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

		// Material UBO (Binding Point 1)
		// Layout std140:
		// ivec4 flags;  // 16 bytes (type, doEmissive, doReflection, hasLightmap)
		// vec4 params;  // 16 bytes (reflectionStrength, opacity, pad, pad)
		// Total: 32 bytes
		if (!this.ubo) {
			this.ubo = gl.createBuffer();
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

			gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
			gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW);
			gl.bindBuffer(gl.UNIFORM_BUFFER, null);
		}

		gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, this.ubo);
	}

	unBind() {
		for (const { unit } of Object.values(TEXTURE_SLOTS)) {
			Texture.unBind(gl.TEXTURE0 + unit);
		}
	}
}

export default Material;
