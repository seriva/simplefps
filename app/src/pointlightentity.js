import { mat4 } from './libs/gl-matrix.js';
import { Entity, EntityTypes } from './entity.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';

const mesh = Resources.get('system/sphere.mesh');

class PointlightEntity extends Entity {
    constructor(position, size, color, intensity) {
        super(EntityTypes.POINTLIGHT);
        const t = this;
        t.position = position;
        t.size = size;
        t.color = color;
        t.intensity = intensity;
        mat4.translate(t.base_matrix, t.base_matrix, position);
        mat4.scale(t.base_matrix, t.base_matrix, [size, size, size]);
    }

    render() {
        Shaders.pointLight.setMat4('matWorld', this.base_matrix);
        Shaders.pointLight.setVec3('pointLight.position', this.position);
        Shaders.pointLight.setVec3('pointLight.color', this.color);
        Shaders.pointLight.setFloat('pointLight.size', this.size);
        Shaders.pointLight.setFloat('pointLight.intensity', this.intensity);
        mesh.renderSingle();
    }
}

export { PointlightEntity as default };
