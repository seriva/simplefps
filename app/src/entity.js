import { mat4 } from './libs/gl-matrix.js';

const EntityTypes = {
    MESH: 1,
    POINTLIGHT: 2
};

class Entity {
    constructor(type) {
        const t = this;
        t.type = type;
        t.base_matrix = mat4.create();
        t.ani_matrix = mat4.create();
        mat4.identity(t.base_matrix);
        mat4.identity(t.ani_matrix);
    }

    update(mat) {
        mat4.multiply(this.ani_matrix, this.base_matrix, mat);
    }
}

export { Entity, EntityTypes };
