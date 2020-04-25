import { mat4, vec3 } from './libs/gl-matrix.js';
import { Entity, EntityTypes } from './entity.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';

const mesh = Resources.get('system/sphere.mesh');

class PointlightEntity extends Entity {
    constructor(position, size, color, intensity, updateCallback) {
        super(EntityTypes.POINTLIGHT, updateCallback);
        const t = this;
        t.size = size;
        t.color = color;
        t.intensity = intensity;
        mat4.translate(t.base_matrix, t.base_matrix, position);
        mat4.scale(t.base_matrix, t.base_matrix, [size, size, size]);
    }

    render() {
        const m = mat4.create();
        mat4.multiply(m, this.base_matrix, this.ani_matrix);
        const pos = vec3.create();
        mat4.getTranslation(pos, m);
        Shaders.pointLight.setMat4('matWorld', m);
        Shaders.pointLight.setVec3('pointLight.position', pos);
        Shaders.pointLight.setVec3('pointLight.color', this.color);
        Shaders.pointLight.setFloat('pointLight.size', this.size);
        Shaders.pointLight.setFloat('pointLight.intensity', this.intensity);
        mesh.renderSingle();
    }
}

export { PointlightEntity as default };
