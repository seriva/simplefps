import { mat4 } from 'gl-matrix';
import Renderer from './renderer';
import Utils from './utils';
import Console from './console';
import Resources from './resources';
import Stats from './stats';
import Camera from './camera';
import Input from './input';

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

if (Utils.isMobile()) {
    document.addEventListener('deviceready', () => {
        Console.log('Platform: ' + cordova.platformId);
        if (cordova.platformId === 'android') {
            window.addEventListener('native.keyboardhide', () => {
                AndroidFullScreen.immersiveMode();
            });
        }
    }, false);
}

Resources.load({
    statue: 'resources/statue.obj',
    texture: 'resources/statue.jpg',
    shader: 'resources/diffuse.shader'
},
    () => {
        let time;
        let frameTime = 0;

        const gl = Renderer.gl;
        const texture = Resources.get('texture');
        // const mesh = Resources.get('statue');
        const shader = Resources.get('shader');

        Camera.setProjection(45, 0.1, 1000);
        Camera.setPosition([0, 1, -5]);
        Input.toggleCursor(false);

        const matModel = mat4.create();
        const matIdentity = mat4.create();
        // let angle = 0;

        mat4.identity(matIdentity);
        mat4.identity(matModel);

        shader.bind();
        shader.setVec3('sun.direction', [3.0, 4.0, -2.0]);
        shader.setVec3('sun.ambient', [0.2, 0.2, 0.2]);
        shader.setVec3('sun.diffuse', [0.9, 0.9, 0.9]);

        const loop = () => {
            // timing
            const now = performance.now();
            frameTime = now - (time || now);
            time = now;

            // update the camera
            Camera.update(frameTime);

            // render the frame
            gl.clear(gl.DEPTH_BUFFER_BIT || gl.COLOR_BUFFER_BIT);
            // angle = angle + (frameTime / 1000);

            // mat4.rotate(matModel, matIdentity, angle, [0, 1, 0]);
            shader.setMat4('matWorld', matModel);
            shader.setMat4('matViewProj', Camera.viewProjection);

            texture.bind(gl.TEXTURE0);
            // mesh.render();
            texture.unBind();

            // update stats
            Stats.update(frameTime);

            // restart the loop
            window.requestAnimationFrame(loop);
        };
        window.requestAnimationFrame(loop);
    }
);
