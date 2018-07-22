import { glMatrix, mat4 } from 'gl-matrix';
import Utils from './utils';
import Resources from './resources';
import Stats from './stats';
import Camera from './camera';
import Controls from './controls';
import Renderer from './renderer';
import Shaders from './shaders';
import Input from './input';
import Skybox from './skybox';
import GUI from './gui';

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

    Camera.setProjection(45, 0.1, 1000);
    Camera.setPosition([0, 1, -5]);
    Input.toggleCursor(false);

    const matModel = mat4.create();
    const matIdentity = mat4.create();
    mat4.identity(matIdentity);
    mat4.identity(matModel);
    mat4.rotate(matModel, matIdentity, glMatrix.toRadian(180), [0, 1, 0]);

    const loop = () => {
        // timing
        const now = performance.now();
        frameTime = now - (time || now);
        time = now;

        // update the camera
        Controls.update(frameTime);
        Camera.update();

        // Fill the gbuffer
        Renderer.startGBufferPass();
        Shaders.gbuffer.bind();
        Shaders.gbuffer.setMat4('matWorld', matModel);
        Shaders.gbuffer.setMat4('matViewProj', Camera.viewProjection);

        statueModel.render();
        floorModel.render();

        Shaders.gbuffer.unBind();
        Renderer.endGBufferPass();

        // Render the lights
        Renderer.startLightingPass();
        Shaders.directionalLight.bind();
        Shaders.directionalLight.setInt('positionBuffer', 0);
        Shaders.directionalLight.setInt('normalBuffer', 1);
        Shaders.directionalLight.setInt('colorBuffer', 2);
        Shaders.directionalLight.setVec3('sun.direction', [-3.0, 4.0, -2.0]);
        Shaders.directionalLight.setVec3('sun.ambient', [0.2, 0.2, 0.2]);
        Shaders.directionalLight.setVec3('sun.diffuse', [0.9, 0.9, 0.9]);

        Renderer.drawFullscreenQuad();

        Shaders.directionalLight.unBind();
        Renderer.endLightingPass();

        // update stats
        Stats.update(frameTime);

        // update html gui
        GUI.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();

