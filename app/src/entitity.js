import { mat4 } from './libs/gl-matrix.js';

class Entity {
    constructor() {
        this.matrix = mat4.create();
    }
}

export { Entity as default };
