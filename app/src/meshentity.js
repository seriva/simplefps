import { mat4 } from './libs/gl-matrix.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';
import { Entity, EntityTypes } from './entity.js';

class MeshEntity extends Entity {
    constructor(position, name) {
        super(EntityTypes.MESH);
        const t = this;
        t.mesh = Resources.get(name);
        mat4.translate(t.base_matrix, t.base_matrix, position);
    }

    render() {
        Shaders.geometry.setInt('geomType', 1);
        Shaders.geometry.setMat4('matWorld', this.ani_matrix);
        this.mesh.renderSingle();
    }
}

export { MeshEntity as default };
