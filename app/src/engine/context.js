import Console from './console.js';
import Settings from './settings.js';
import DOM from './dom.js';
import Utils from './utils.js';

DOM.css({
    '#context': {
        background: '#000',
        width: '100vw',
        height: '100vh',
        display: 'block',
        zIndex: 0
    }
});

const canvas = DOM.h('canvas#context');
DOM.append(() => canvas);

const gl = canvas.domNode.getContext('webgl2', {
    premultipliedAlpha: false,
    antialias: false
});
if (!gl) {
    Console.error('Failed to initialize WebGL 2.0 context');
}
if (!gl.getExtension('EXT_color_buffer_float')) {
    Console.error(' Extension EXT_color_buffer_float is required to run');
}

const afExt = gl.getExtension('EXT_texture_filter_anisotropic')
    || gl.getExtension('MOZ_EXT_texture_filter_anisotropic')
    || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
if (!afExt) {
    Console.warn('Extension EXT_texture_filter_anisotropic is not present');
}

gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.clearDepth(1.0);
gl.enable(gl.DEPTH_TEST);
gl.cullFace(gl.BACK);
gl.enable(gl.CULL_FACE);
gl.depthFunc(gl.LEQUAL);

Console.log('Initialized context');
Console.log(`Renderer: ${gl.getParameter(gl.RENDERER)}`);
Console.log(`Vendor: ${gl.getParameter(gl.VENDOR)}`);
Console.log(`WebGL version: ${gl.getParameter(gl.VERSION)}`);
Console.log(`GLSL version: ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`);
Console.log(
    `Max anisotropic filtering: ${afExt ? gl.getParameter(afExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 'Not supported'}`
);

/* eslint-disable */
const width = () => Math.floor(gl.canvas.clientWidth * window.devicePixelRatio * Settings.renderScale);
const height = () => Math.floor(gl.canvas.clientHeight * window.devicePixelRatio * Settings.renderScale);
/* eslint-enable */

const aspectRatio = () => width() / height();

const resize = () => {
    gl.canvas.width = width();
    gl.canvas.height = height();
    gl.viewport(0, 0, width(), height());
};

Console.registerCmd('rscale', (scale) => {
    Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
    Utils.dispatchEvent('resize');
});

const Context = {
    canvas,
    width,
    height,
    aspectRatio,
    resize,
};

export { gl, afExt, Context };
