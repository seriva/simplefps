import { mat4, vec3 } from '../dependencies/gl-matrix.js';
import { Entity, EntityTypes } from './entity.js';
import { Shaders } from './shaders.js';
import { sphere } from './shapes.js';

class PointLightEntity extends Entity {
    constructor(position, size, color, intensity, updateCallback) {
        super(EntityTypes.POINT_LIGHT, updateCallback);
        const t = this;
        t.color = color;
        t.size = size;
        t.intensity = intensity;
        mat4.translate(t.base_matrix, t.base_matrix, position);
    }

    render() {
        const m = mat4.create();
        mat4.multiply(m, this.base_matrix, this.ani_matrix);
        mat4.scale(m, m, [this.size, this.size, this.size]);
        const pos = vec3.create();
        mat4.getTranslation(pos, m);
        Shaders.pointLight.setMat4('matWorld', m);
        Shaders.pointLight.setInt('lightType', 1);
        Shaders.pointLight.setVec3('pointLight.position', pos);
        Shaders.pointLight.setVec3('pointLight.color', this.color);
        Shaders.pointLight.setFloat('pointLight.size', this.size);
        Shaders.pointLight.setFloat('pointLight.intensity', this.intensity);
        sphere.renderSingle();
    }
}

export { PointLightEntity as default };
