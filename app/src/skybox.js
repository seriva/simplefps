import { mat4 } from './dependencies/gl-matrix.js';
import { gl } from './context.js';
import { Shaders } from './shaders.js';
import Camera from './camera.js';
import Resources from './resources.js';

const matModel = mat4.create();
const matIdentity = mat4.create();
mat4.identity(matIdentity);
mat4.identity(matModel);

const mesh = Resources.get('skyboxes/skybox.mesh');

const Skydome = {
    set(id) {
        const matlist = [
            `mat_skybox_${id}_front`,
            `mat_skybox_${id}_back`,
            `mat_skybox_${id}_top`,
            `mat_skybox_${id}_bottom`,
            `mat_skybox_${id}_right`,
            `mat_skybox_${id}_left`
        ];
        for (let i = 0; i < matlist.length; i++) {
            mesh.indices[i].material = matlist[i];
        }
    },

    render() {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        mat4.translate(matModel, matIdentity, Camera.position);
        Shaders.geometry.setMat4('matWorld', matModel);
        Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);

        mesh.renderSingle();

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
    }
};

export { Skydome as default };
