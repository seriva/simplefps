// import { glMatrix, mat4 } from './libs/gl-matrix.js';
import Settings from './settings.js';
import './console.js';
import './translations.js';
import './hud.js';
import './ui.js';
import './update.js';
import Resources from './resources.js';
import Stats from './stats.js';
import Camera from './camera.js';
import Controls from './controls.js';
// import { gl } from './context.js';
import { Shaders, Shader } from './shaders.js';
import Buffers from './buffers.js';
import Skybox from './skybox.js';
import DOM from './dom.js';
import Utils from './utils.js';
import World from './world.js';
import Renderer from './renderer.js';

(async () => {
    await Resources.load(['resources.list']);

    Utils.dispatchCustomEvent('changestate', {
        state: 'MENU',
        menu: 'MAIN_MENU'
    });

    let time;
    let frameTime = 0;

    // const templeModel = Resources.get('meshes/temple.mesh');
    Skybox.setTextures(Resources.get('skyboxes/1/1.list'));

    Camera.setProjection(45, Settings.znear, Settings.zfar);
    Camera.setPosition([11, -1, -28]);
    Camera.setRotation([180, 0, 0]);

    // const matModel = mat4.create();
    // const matIdentity = mat4.create();
    // mat4.identity(matIdentity);

    const loop = () => {
        // timing
        const now = performance.now();
        frameTime = now - (time || now);
        time = now;

        // update stats
        Stats.update();

        // update controls
        Controls.update(frameTime);

        // update camera
        Camera.update();

        // update the world
        World.update(frameTime);

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

        // mat4.identity(matModel);
        // mat4.rotate(matModel, matIdentity, glMatrix.toRadian(180), [0, 1, 0]);
        // Shaders.geometry.setMat4('matWorld', matModel);
        // Shaders.geometry.setFloat('detailUVMult', 50);
        // detail1Texture.bind(gl.TEXTURE1);
        // terrainModel.render();

        Shader.unBind();
        Buffers.endGeomPass();

        // render the actual frame
        Renderer.render();

        // update dom
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();
