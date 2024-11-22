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
        this.skybox.indices.forEach((index, i) => {
            index.material = `mat_skybox_${id}_${['front', 'back', 'top', 'bottom', 'right', 'left'][i]}`;
        });
    }

    render() {
        const depthTest = gl.getParameter(gl.DEPTH_TEST);
        const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        mat4.translate(this.base_matrix, this.ani_matrix, Camera.position);

        const shader = Shaders.geometry;
        shader.setMat4('matWorld', this.base_matrix);
        shader.setMat4('matViewProj', Camera.viewProjection);

        this.skybox.renderSingle();

        if (depthTest) gl.enable(gl.DEPTH_TEST);
        if (depthMask) gl.depthMask(true);
    }
}

export { SkyboxEntity as default };
