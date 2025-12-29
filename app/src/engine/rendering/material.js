import { gl } from "../core/context.js";
import { Shaders } from "./shaders.js";
import Texture from "./texture.js";

class Material {
	constructor(data, resources) {
		if (!data || !resources) {
			throw new Error("Material requires data and resources");
		}

		this.resources = resources;
		this.name = data.name;
		this.textures = data.textures; // Index 4 is lightmap if present
		this.geomType = data.geomType || 1;
		this.doEmissive = data.doEmissive || 0;
		this.doSEM = data.doSEM || 0;
		this.semMult = data.semMult || 0;
		this.translucent = data.translucent || false;
		this.opacity = data.opacity !== undefined ? data.opacity : 1.0;

		for (const name of this.textures.filter((name) => name !== "none")) {
			resources.load([name]);
		}
	}

	bind(shader = Shaders.geometry) {
		if (!shader) shader = Shaders.geometry;
		shader.setInt("colorSampler", 0);

		// Common uniforms for both Geometry and Glass shaders
		shader.setInt("semSampler", 2);
		shader.setInt("semApplySampler", 3);
		shader.setInt("doSEM", this.doSEM);
		shader.setFloat("semMult", this.semMult);

		if (shader !== Shaders.glass) {
			shader.setInt("emissiveSampler", 1);
			shader.setInt("lightmapSampler", 4);
			shader.setInt("geomType", this.geomType);
			shader.setInt("doEmissive", this.doEmissive);

			// Check if lightmap present at index 4
			// Materials with <5 textures or "none" at index 4 have no lightmap
			const hasLightmap = this.textures[4] && this.textures[4] !== "none";
			shader.setInt("hasLightmap", hasLightmap ? 1 : 0);
		} else {
			shader.setFloat("opacity", this.opacity);
		}

		for (let i = 0; i < this.textures.length; i++) {
			const name = this.textures[i];
			if (name === "none") continue;
			const textureUnit = gl.TEXTURE0 + i;
			this.resources.get(name).bind(textureUnit);
		}
	}

	unBind() {
		for (let i = 0; i < this.textures.length; i++) {
			const _name = this.textures[i];
			//if (name === "none") continue;
			Texture.unBind(gl.TEXTURE0 + i);
		}
	}
}

export default Material;
