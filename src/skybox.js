import { mat4 } from 'gl-matrix';
import Renderer from './renderer';
import Shaders from './shaders';
import Camera from './camera';
import Resources from './resources';

const gl = Renderer.gl;
const matModel = mat4.create();
const matIdentity = mat4.create();
let mesh;
mat4.identity(matIdentity);
mat4.identity(matModel);

const Skydome = {
    setTextures(tex) {
        if (!mesh) {
            mesh = Resources.get('skyboxes/skybox.obj');
        }
        for (let i = 0; i < 6; i++) {
            mesh.indices[i].material = tex[i];
        }
    },

    render() {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        mat4.translate(matModel, matIdentity, Camera.position);
        Shaders.sky.bind();
        Shaders.sky.setMat4('matWorld', matModel);
        Shaders.sky.setMat4('matViewProj', Camera.viewProjection);

        mesh.render();

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
    }
};

export { Skydome as default };
