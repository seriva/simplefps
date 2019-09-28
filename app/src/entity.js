import { mat4 } from './libs/gl-matrix.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';

class Entity {
    constructor(pos, name) {
        const t = this;
        t.mesh = Resources.get(name);
        t.base_matrix = mat4.create();
        t.ani_matrix = mat4.create();
        mat4.identity(t.base_matrix);
        mat4.identity(t.ani_matrix);
        mat4.translate(t.base_matrix, t.base_matrix, pos);
    }

    update(mat) {
        mat4.multiply(this.ani_matrix, this.base_matrix, mat);
    }

    render() {
        Shaders.geometry.setInt('geomType', 1);
        Shaders.geometry.setMat4('matWorld', this.ani_matrix);
        this.mesh.renderSingle();
    }
}

export { Entity as default };
