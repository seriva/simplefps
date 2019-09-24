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
import Map from './map.js';
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

    // position data for indexed rendering test
    const offsetData = new Float32Array(413 * 3);
    let l = 0;
    for (let i = -6; i <= 6; i++) {
        for (let j = -6; j <= 6; j++) {
            offsetData[l] = i;
            offsetData[l + 1] = 0;
            offsetData[l + 2] = j;
            l += 3;

            offsetData[l] = i;
            offsetData[l + 1] = 4;
            offsetData[l + 2] = j;
            l += 3;
        }
    }
    for (let i = -6; i <= 6; i += 3) {
        for (let j = -6; j <= 6; j += 3) {
            for (let k = 1; k <= 3; k++) {
                offsetData[l] = i;
                offsetData[l + 1] = k;
                offsetData[l + 2] = j;
                l += 3;
            }
        }
    }
    const offsetBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, offsetData, gl.STATIC_DRAW);

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

        // update the map
        Map.update(frameTime);

        // **********************************
        // geometry pass
        // **********************************
        Buffers.startGeomPass();
        Shaders.geometry.bind();
        Shaders.geometry.setInt('colorSampler', 0);
        Shaders.geometry.setInt('geomType', 3);
        Shaders.geometry.setInt('doDetail', 0);
        Skybox.render();

        Shaders.geometry.setInt('colorSampler', 0);
        Shaders.geometry.setInt('detailSampler', 1);
        Shaders.geometry.setInt('geomType', 2);
        Shaders.geometry.setInt('doDetail', 1);
        Shaders.geometry.setFloat('detailMult', 0.85);
        Shaders.geometry.setFloat('detailUVMult', 3);
        Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);
        mat4.identity(matModel);
        Shaders.geometry.setMat4('matWorld', matModel);
        detail.bind(gl.TEXTURE1);

        // Shaders.geometry.setInt('geomType', 1);
        // mat4.identity(matModel);
        // mat4.translate(matModel, matModel, [0, 2, -5]);
        // Shaders.geometry.setMat4('matWorld', matModel);
        // cube.renderSingle();

        cube.bind();
        gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribDivisor(3, 1);
        cube.renderMany(413);
        gl.vertexAttribDivisor(3, 0);
        gl.disableVertexAttribArray(3);
        cube.unBind();

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
