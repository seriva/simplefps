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

    const gl = Renderer.gl;
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

        // Render the gbuffer
        Renderer.startGBufferPass();
        Shaders.gbuffer.bind();
        Shaders.gbuffer.setMat4('matWorld', matModel);
        Shaders.gbuffer.setMat4('matViewProj', Camera.viewProjection);

        statueModel.render();
        floorModel.render();

        Shaders.gbuffer.unBind();
        Renderer.endGBufferPass();

        // Render the offscreen color buffer for now
        gl.clear(gl.DEPTH_BUFFER_BIT || gl.COLOR_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, Renderer.gBuffer.color);

        Shaders.colorBuffer.bind();

        Renderer.drawFullscreenQuad();

        Shaders.colorBuffer.unBind();

        // update stats
        Stats.update(frameTime);

        // update html gui
        GUI.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();

