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
		this.textures = data.textures;
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

		if (shader !== Shaders.glass) {
			shader.setInt("emissiveSampler", 1);
			shader.setInt("semSampler", 2);
			shader.setInt("semApplySampler", 3);
			shader.setInt("lightmapSampler", 4);
			shader.setInt("geomType", this.geomType);
			shader.setInt("doEmissive", this.doEmissive);
			shader.setInt("doSEM", this.doSEM);
			// hasLightmap is set globally by Scene, don't override it here
			shader.setFloat("semMult", this.semMult);
		} else {
			shader.setFloat("opacity", this.opacity);
		}

		let index = 0;
		for (const name of this.textures) {
			if (name === "none") continue;
			const textureUnit = gl.TEXTURE0 + index;
			this.resources.get(name).bind(textureUnit);
			index++;
		}
	}

	unBind() {
		let index = 0;
		for (const name of this.textures) {
			if (name === "none") continue;
			Texture.unBind(gl.TEXTURE0 + index);
			index++;
		}
	}
}

export default Material;
