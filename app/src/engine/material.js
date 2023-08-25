import { gl } from './context.js';
import { Shaders } from './shaders.js';
import Texture from './texture.js';

class Material {
    constructor(data, resources) {
        const m = this;
        m.resources = resources;
        m.name = data.name;
        m.textures = data.textures;
        m.geomType = data.geomType;
        m.doEmissive = data.doEmissive ? data.doEmissive : 0;
        m.doSEM = data.doSEM ? data.doSEM : 0;
        m.semMult = data.semMult ? data.semMult : 0;
        m.textures.forEach((name) => {
            if (name === 'none') {
                return;
            }
            resources.load(name);
        });
    }

    bind() {
        const m = this;
        Shaders.geometry.setInt('colorSampler', 0);
        Shaders.geometry.setInt('emissiveSampler', 1);
        Shaders.geometry.setInt('semSampler', 2);
        Shaders.geometry.setInt('semApplySampler', 3);
        Shaders.geometry.setInt('geomType', m.geomType);
        Shaders.geometry.setInt('doEmissive', m.doEmissive);
        Shaders.geometry.setInt('doSEM', m.doSEM);
        Shaders.geometry.setFloat('semMult', m.semMult);

        let texUnit = 0;
        m.textures.forEach((name) => {
            if (name === 'none') {
                texUnit++;
                return;
            }
            const tex = m.resources.get(name);
            tex.bind(gl.TEXTURE0 + texUnit);
            // if (m.geomType === 3) {
            //    tex.setTextureWrapMode(gl.CLAMP_TO_EDGE);
            // }
            texUnit++;
        });
    }

    unBind() {
        let texUnit = 0;
        const m = this;
        m.textures.forEach((name) => {
            if (name === 'none') {
                texUnit++;
                return;
            }
            Texture.unBind(gl.TEXTURE0 + texUnit);
            texUnit++;
        });
    }
}

export { Material as default };
