import { mat4 } from './libs/gl-matrix.js';
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
import { gl } from './context.js';
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

    const cube = Resources.get('meshes/cube.mesh');
    const detail = Resources.get('textures/detail1.jpg');
    Skybox.setTextures(Resources.get('skyboxes/1/1.list'));

    Camera.setProjection(45, Settings.znear, Settings.zfar);
    Camera.setPosition([0, 2, -5]);
    Camera.setRotation([0, 0, 0]);

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
        Shaders.geometry.setFloat('detailMult', 0.7);
        Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);

        mat4.identity(matModel);
        Shaders.geometry.setMat4('matWorld', matModel);
        Shaders.geometry.setFloat('detailUVMult', 3);
        detail.bind(gl.TEXTURE1);
        cube.render();

        for (let i = -6; i <= 6; i++) {
            for (let j = -6; j <= 6; j++) {
                mat4.identity(matModel);
                mat4.translate(matModel, matModel, [i, 0, j]);
                Shaders.geometry.setMat4('matWorld', matModel);
                cube.render();
            }
        }

        for (let i = -6; i <= 6; i += 3) {
            for (let j = -6; j <= 6; j += 3) {
                for (let k = 1; k <= 3; k++) {
                    mat4.identity(matModel);
                    mat4.translate(matModel, matModel, [i, k, j]);
                    Shaders.geometry.setMat4('matWorld', matModel);
                    cube.render();
                }
            }
        }

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
