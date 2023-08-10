import { mat4, quat } from '../dependencies/gl-matrix.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';
import { Entity, EntityTypes } from './entity.js';

class MeshEntity extends Entity {
    constructor(position, name, updateCallback, scale = 1) {
        super(EntityTypes.MESH, updateCallback);
        const t = this;
        t.mesh = Resources.get(name);
        t.castShadow = false;
        t.shadowHeight = 1;
        mat4.translate(t.base_matrix, t.base_matrix, position);
        mat4.scale(t.base_matrix, t.base_matrix, [scale, scale, scale]);
    }

    render() {
        const t = this;
        if (!t.visible) return;
        const m = mat4.create();
        mat4.multiply(m, t.base_matrix, t.ani_matrix);
        Shaders.geometry.setInt('geomType', 1);
        Shaders.geometry.setMat4('matWorld', m);
        t.mesh.renderSingle();
    }

    renderShadow() {
        const t = this;
        if (!t.visible) return;
        if (!t.castShadow) return;
        const m = mat4.create();
        mat4.copy(m, t.base_matrix);
        const q = quat.create();
        mat4.getRotation(q, t.ani_matrix);
        const rm = mat4.create();
        mat4.fromQuat(rm, q);
        mat4.translate(m, m, [0, t.shadowHeight, 0]);
        mat4.scale(m, m, [1, 0.001, 1]);
        mat4.multiply(m, m, rm);
        Shaders.entityShadows.setMat4('matWorld', m);
        t.mesh.renderSingle(false);
    }
}

export { MeshEntity as default };
