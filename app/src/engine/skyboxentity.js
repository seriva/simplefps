import { mat4 } from '../dependencies/gl-matrix.js';
import { gl } from './context.js';
import { Shaders } from './shaders.js';
import Camera from './camera.js';
import { Entity, EntityTypes } from './entity.js';
import { skybox } from './shapes.js';
import Resources from './resources.js';

class SkyboxEntity extends Entity {
    constructor(id, updateCallback) {
        super([0, 0, 0], updateCallback);
        this.type = EntityTypes.SKYBOX;
        this.skybox = skybox;
        this.skybox.resources = Resources;
        const matlist = [
            `mat_skybox_${id}_front`,
            `mat_skybox_${id}_back`,
            `mat_skybox_${id}_top`,
            `mat_skybox_${id}_bottom`,
            `mat_skybox_${id}_right`,
            `mat_skybox_${id}_left`
        ];
        for (let i = 0; i < matlist.length; i++) {
            this.skybox.indices[i].material = matlist[i];
        }
    }

    render() {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        mat4.translate(this.base_matrix, this.ani_matrix, Camera.position);
        Shaders.geometry.setMat4('matWorld', this.base_matrix);
        Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);

        this.skybox.renderSingle();

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
    }
}

export { SkyboxEntity as default };
