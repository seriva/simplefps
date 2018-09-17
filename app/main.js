import { glMatrix, mat4 } from 'gl-matrix';
import Settings from './settings';
import Utils from './utils';
import Resources from './resources';
import './update';
import Stats from './stats';
import Camera from './camera';
import Controls from './controls';
import Renderer from './renderer';
import Shaders from './shaders';
import Buffers from './buffers';
import Input from './input';
import Skybox from './skybox';
import DOM from './dom';

Utils.addCSS(
    `
    html { 
        height: 100%; 
    }

    body { 
        background: #000; 
        min-height: 100%; 
        margin: 0; 
        padding: 0; 
        position: relative; 
        overflow: hidden; 
        font-family: Consolas, monaco, monospace; font-weight: bold;
    }
    `
);

(async () => {
    await Resources.load(
        [
            'skyboxes/skybox.obj',
            'meshes/statue.obj',
            'meshes/floor.obj',
            'skyboxes/1/1.list'
        ]
    );

    let time;
    let frameTime = 0;

    const statueModel = Resources.get('meshes/statue.obj');
    const floorModel = Resources.get('meshes/floor.obj');
    Skybox.setTextures(Resources.get('skyboxes/1/1.list'));

    Camera.setProjection(45, Settings.znear, Settings.zfar);
    Camera.setPosition([0, 1, -5]);
    Input.toggleCursor(false);

    const matModel = mat4.create();
    const matIdentity = mat4.create();
    mat4.identity(matIdentity);

    const loop = () => {
        // timing
        const now = performance.now();
        frameTime = now - (time || now);
        time = now;

        // update the camera
        Controls.update(frameTime);
        Camera.update();

        // **********************************
        // geometry pass
        // **********************************
        Buffers.startGeomPass();
        Shaders.geometry.bind();

        Shaders.geometry.setInt('geomType', 2);
        Skybox.render();

        Shaders.geometry.setInt('geomType', 1);
        Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);
        mat4.identity(matModel);
        mat4.rotate(matModel, matIdentity, glMatrix.toRadian(180), [0, 1, 0]);
        Shaders.geometry.setMat4('matWorld', matModel);
        floorModel.render();

        const startPos = -2.6;
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                mat4.identity(matModel);
                mat4.rotate(matModel, matIdentity, glMatrix.toRadian(180), [0, 1, 0]);
                mat4.translate(matModel, matModel, [startPos + i * 1.3, 0, startPos + j * 1.3]);
                Shaders.geometry.setMat4('matWorld', matModel);
                statueModel.render();
            }
        }

        Shaders.geometry.unBind();
        Buffers.endGeomPass();

        // **********************************
        // lighting pass
        // **********************************
        Buffers.startLightingPass();
        Shaders.directionalLight.bind();
        Shaders.directionalLight.setInt('positionBuffer', 0);
        Shaders.directionalLight.setInt('normalBuffer', 1);
        Shaders.directionalLight.setInt('colorBuffer', 2);
        Shaders.directionalLight.setVec3('sun.direction', [-3.0, 4.0, -2.0]);
        Shaders.directionalLight.setVec3('sun.ambient', [0.2, 0.2, 0.2]);
        Shaders.directionalLight.setVec3('sun.diffuse', [0.9, 0.9, 0.9]);

        Renderer.drawFullscreenQuad();

        Shaders.directionalLight.unBind();
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
        Shaders.postProcessing.setVec2('viewportSize', [Renderer.canvas.width, Renderer.canvas.height]);
        Shaders.postProcessing.setFloat('ssao.sampleRadius', Settings.ssaoRadius);
        Shaders.postProcessing.setFloat('ssao.bias', Settings.ssaoBias);
        Shaders.postProcessing.setVec2('ssao.attenuation', Settings.ssaoAttenuation);
        Shaders.postProcessing.setVec2('ssao.depthRange', [Settings.znear, Settings.zfar]);

        Renderer.drawFullscreenQuad();

        Shaders.postProcessing.unBind();
        Buffers.endPostProcessingPass();

        // update stats
        Stats.update(frameTime);

        // update html gui
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();

