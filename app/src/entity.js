import { mat4 } from './libs/gl-matrix.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';

class Entity {
    constructor(pos, name) {
        this.name = name;
        this.mesh = null;
        this.base_matrix = mat4.create();
        this.ani_matrix = mat4.create();
        mat4.identity(this.base_matrix);
        mat4.identity(this.ani_matrix);
        mat4.translate(this.base_matrix, this.base_matrix, pos);
    }

    update(mat) {
        mat4.multiply(this.ani_matrix, this.base_matrix, mat);
    }

    render() {
        Shaders.geometry.setInt('geomType', 1);
        Shaders.geometry.setMat4('matWorld', this.ani_matrix);
        if (this.mesh === null) {
            this.mesh = Resources.get(this.name);
        }
        this.mesh.renderSingle();
    }
}

export { Entity as default };
