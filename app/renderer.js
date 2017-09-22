import Utils from './utils';
import Console from './console';

Utils.addCSS(
    `
    #viewport {
        background: #000;
        width: 100vw; height: 100vh;
        display: block;
        z-index : 100;
    }
    `
);

const canvas = Utils.addElement('canvas', 'viewport');
let gl = canvas.getContext('webgl2', {
    antialias: true
});
if (!gl) {
    gl = canvas.getContext('experimental-webgl2', {
        antialias: true
    });
}
if (!gl) {
    Console.error('Failed to initialize WebGL 2.0 context');
}

gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.clearDepth(1.0);
gl.enable(gl.DEPTH_TEST);
gl.cullFace(gl.BACK);
gl.enable(gl.CULL_FACE);
gl.depthFunc(gl.LEQUAL);

Console.log('Initialized renderer');
Console.log('Renderer: ' + gl.getParameter(gl.RENDERER));
Console.log('Vendor: ' + gl.getParameter(gl.VENDOR));
Console.log('WebGL version: ' + gl.getParameter(gl.VERSION));
Console.log('GLSL version: ' + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));

window.addEventListener('resize', () => {
    gl.canvas.width = document.body.clientWidth;
    gl.canvas.height = document.body.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}, false);

window.dispatchEvent(new Event('resize'));

const Renderer = {
    gl,
    canvas
};

export { Renderer as default };
