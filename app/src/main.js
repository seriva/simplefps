import { glMatrix } from '../libs/import.js';
import Settings from './settings.js';
import './console.js';
import './translations.js';
import './hud.js';
import './ui.js';
import './update.js';
import State from './state.js';
import Resources from './resources.js';
import Stats from './stats.js';
import Camera from './camera.js';
import Controls from './controls.js';
import Renderer from './renderer.js';
import { Shaders, Shader } from './shaders.js';
import Buffers from './buffers.js';
import Skybox from './skybox.js';
import DOM from './dom.js';

const glm = glMatrix.glMatrix;
const mat4 = glMatrix.mat4;
const gl = Renderer.gl;

(async () => {
    await Resources.load(['resources.list']);

    State.setState('UI', 'MAIN_MENU');

    let time;
    let frameTime = 0;

    const templeModel = Resources.get('meshes/temple.mesh');
    const terrainModel = Resources.get('meshes/terrain.mesh');
    const statueModel = Resources.get('meshes/statue.mesh');
    const detail1Texture = Resources.get('textures/detail1.jpg');
    const detail2Texture = Resources.get('textures/detail2.jpg');
    Skybox.setTextures(Resources.get('skyboxes/2/2.list'));

    Camera.setProjection(45, Settings.znear, Settings.zfar);
    Camera.setPosition([11, -1, -28]);
    Camera.setRotation([180, 0, 0]);

    const matModel = mat4.create();
    const matIdentity = mat4.create();
    mat4.identity(matIdentity);

    const loop = () => {
        // timing
        const now = performance.now();
        frameTime = now - (time || now);
        time = now;

        // update stats
        Stats.update();

        // update the camera
        Controls.update(frameTime);
        Camera.update();

        // **********************************
        // geometry pass
        // **********************************
        Buffers.startGeomPass();
        Shaders.geometry.bind();
        Shaders.geometry.setInt('colorSampler', 0);
        Shaders.geometry.setInt('geomType', 2);
        Shaders.geometry.setInt('doDetail', 0);
        Skybox.render();

        Shaders.geometry.setInt('doDetail', 1);
        Shaders.geometry.setInt('geomType', 1);
        Shaders.geometry.setInt('detailSampler', 1);
        Shaders.geometry.setFloat('detailMult', 0.55);
        Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);

        mat4.identity(matModel);
        mat4.rotate(matModel, matIdentity, glm.toRadian(180), [0, 1, 0]);
        Shaders.geometry.setMat4('matWorld', matModel);
        Shaders.geometry.setFloat('detailUVMult', 50);
        detail1Texture.bind(gl.TEXTURE1);
        terrainModel.render();

        mat4.identity(matModel);
        mat4.translate(matModel, matModel, [11, -2.1, -35]);
        Shaders.geometry.setMat4('matWorld', matModel);
        Shaders.geometry.setFloat('detailUVMult', 10);
        detail2Texture.bind(gl.TEXTURE1);
        templeModel.render();

        mat4.identity(matModel);
        mat4.translate(matModel, matModel, [11, -1.7, -41.5]);
        Shaders.geometry.setMat4('matWorld', matModel);
        Shaders.geometry.setFloat('detailUVMult', 2);
        detail2Texture.bind(gl.TEXTURE1);
        statueModel.render();

        Shader.unBind();
        Buffers.endGeomPass();

        // **********************************
        // lighting pass
        // **********************************
        Buffers.startLightingPass();

        Shaders.directionalLight.bind();
        Shaders.directionalLight.setInt('positionBuffer', 0);
        Shaders.directionalLight.setInt('normalBuffer', 1);
        Shaders.directionalLight.setInt('colorBuffer', 2);
        Shaders.directionalLight.setVec3('directionalLight.direction', [-3.0, 4.0, 2.0]);
        Shaders.directionalLight.setVec3('directionalLight.diffuse', [
            89 / 255,
            112 / 255,
            145 / 255
        ]);
        Shaders.directionalLight.setVec3('directionalLight.ambient', [
            44 / 255,
            50 / 255,
            64 / 255
        ]);

        Renderer.drawFullscreenQuad();

        Shader.unBind();
        Buffers.endLightingPass();

        // **********************************
        // post processing pass
        // **********************************
        Buffers.startPostProcessingPass();
        Shaders.postProcessing.bind();
        Shaders.postProcessing.setInt('doFXAA', Settings.dofxaa);
        Shaders.postProcessing.setInt('doSSAO', Settings.dossao);
        Shaders.postProcessing.setInt('colorBuffer', 0);
        Shaders.postProcessing.setInt('positionBuffer', 1);
        Shaders.postProcessing.setInt('normalBuffer', 2);
        Shaders.postProcessing.setInt('noiseBuffer', 3);
        Shaders.postProcessing.setVec2('viewportSize', [Renderer.width(), Renderer.height()]);
        Shaders.postProcessing.setFloat('ssao.sampleRadius', Settings.ssaoRadius);
        Shaders.postProcessing.setFloat('ssao.bias', Settings.ssaoBias);
        Shaders.postProcessing.setVec2('ssao.attenuation', Settings.ssaoAttenuation);
        Shaders.postProcessing.setVec2('ssao.depthRange', [Settings.znear, Settings.zfar]);

        Renderer.drawFullscreenQuad();

        Shader.unBind();
        Buffers.endPostProcessingPass();

        // update dom
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();
