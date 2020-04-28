import { mat4 } from './libs/gl-matrix.js';

const EntityTypes = {
    MESH: 1,
    POINTLIGHT: 2
};

class Entity {
    constructor(type, updateCallback) {
        const t = this;
        t.type = type;
        t.animationTime = 0;
        t.updateCallback = updateCallback;
        t.base_matrix = mat4.create();
        t.ani_matrix = mat4.create();
        mat4.identity(t.base_matrix);
        mat4.identity(t.ani_matrix);
    }

    update(frametime) {
        if (this.updateCallback) {
            this.updateCallback(this, frametime);
        }
    }
}

export { Entity, EntityTypes };
