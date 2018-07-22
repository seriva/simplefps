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
const gl = canvas.getContext('webgl2', {
    antialias: true
});
if (!gl) {
    Console.error('Failed to initialize WebGL 2.0 context');
}
if (!gl.getExtension('EXT_color_buffer_float')) {
    Console.error('EXT_color_buffer_float is required to run');
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

const screenQuadVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, screenQuadVBO);
gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([
        -1.0, -1.0,
        1.0, 1.0,
        -1.0, 1.0,
        -1.0, -1.0,
        1.0, -1.0,
        1.0, 1.0]),
    gl.STATIC_DRAW);

const drawFullscreenQuad = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, screenQuadVBO);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
};

const gBuffer = {
    framebuffer: null,
    position: null,
    normal: null,
    color: null,
    depth: null
};

const createGBuffer = (width, height) => {
    // Clear the framebuffer
    gl.deleteFramebuffer(gBuffer.framebuffer);
    gl.deleteTexture(gBuffer.position);
    gl.deleteTexture(gBuffer.normal);
    gl.deleteTexture(gBuffer.color);
    gl.deleteTexture(gBuffer.depth);

    // Create the framebuffer
    gBuffer.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer.framebuffer);
    gl.activeTexture(gl.TEXTURE0);
    gBuffer.position = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.position);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gBuffer.position, 0);
    gBuffer.normal = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.normal);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, gBuffer.normal, 0);
    gBuffer.color = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.color);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, gBuffer.color, 0);
    gBuffer.depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.depth);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, gBuffer.depth, 0);
    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2
    ]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startGBufferPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer.framebuffer);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

const endGBufferPass = () => {
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startLightingPass = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.position);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.normal);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.color);
};

const endLightingPass = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
};

window.addEventListener('resize', () => {
    gl.canvas.width = document.body.clientWidth;
    gl.canvas.height = document.body.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    createGBuffer(canvas.width, canvas.height);
}, false);

window.dispatchEvent(new Event('resize'));

const Renderer = {
    gl,
    canvas,
    gBuffer,
    startGBufferPass,
    endGBufferPass,
    startLightingPass,
    endLightingPass,
    drawFullscreenQuad
};

export { Renderer as default };
