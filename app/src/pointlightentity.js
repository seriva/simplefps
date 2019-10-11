import { mat4 } from './libs/gl-matrix.js';
import { Entity, EntityTypes } from './entity.js';

class PointlightEntity extends Entity {
    constructor(position, radius) {
        super(EntityTypes.POINTLIGHT);
        const t = this;
        t.radius = radius;
        mat4.translate(t.base_matrix, t.base_matrix, position);
    }
}

export { PointlightEntity as default };
