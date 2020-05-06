import { gl, Context } from './context.js';
import Texture from './texture.js';

const g = {
    framebuffer: null,
    position: null,
    normal: null,
    color: null,
    emissive: null,
    depth: null
};

const l = {
    framebuffer: null,
    light: null
};

const b = {
    framebuffer: null,
    color: null
};

let noise = null;

const init = (width, height) => {
    // **********************************
    // geometry buffer
    // **********************************
    g.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    g.position = new Texture({
        format: gl.RGBA16F,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.position.texture, 0);

    g.normal = new Texture({
        format: gl.RGBA16F,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, g.normal.texture, 0);

    g.color = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, g.color.texture, 0);

    g.emissive = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, g.emissive.texture, 0);

    g.depth = new Texture({
        format: gl.DEPTH_COMPONENT16,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, g.depth.texture, 0);

    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // lighting buffer
    // **********************************
    l.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    l.light = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, l.light.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // gaussianblur buffer
    // **********************************
    b.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    b.color = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.color.texture, 0);

    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // ssao noise buffer
    // **********************************
    const numNoisePixels = gl.drawingBufferWidth * gl.drawingBufferHeight;
    const noiseTextureData = new Float32Array(numNoisePixels * 2);
    for (let i = 0; i < numNoisePixels; ++i) {
        const index = i * 2;
        noiseTextureData[index] = Math.random() * 2.0 - 1.0;
        noiseTextureData[index + 1] = Math.random() * 2.0 - 1.0;
    }

    noise = new Texture({
        format: gl.RG16F,
        width,
        height,
        pformat: gl.RG,
        ptype: gl.FLOAT,
        pdata: noiseTextureData
    });
};

const startGeomPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

const endGeomPass = () => {
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startBlurPass = (texture) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    texture.bind(gl.TEXTURE0);
};

const endBlurPass = () => {
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, Context.width(), Context.height());
    Texture.unBind(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startLightingPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    g.position.bind(gl.TEXTURE0);
    g.normal.bind(gl.TEXTURE1);
    g.color.bind(gl.TEXTURE2);
};

const endLightingPass = () => {
    Texture.unBind(gl.TEXTURE0);
    Texture.unBind(gl.TEXTURE1);
    Texture.unBind(gl.TEXTURE2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};


const startBlurLightingPass = () => {
    startBlurPass(l.light);
};

const endBlurLightingPass = () => {
    endBlurPass();
};


const startBlurEmissivePass = () => {
    startBlurPass(g.emissive);
};

const endBlurEmissivePass = () => {
    endBlurPass();
};

const startPostProcessingPass = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    g.color.bind(gl.TEXTURE0);
    l.light.bind(gl.TEXTURE1);
    g.position.bind(gl.TEXTURE2);
    g.normal.bind(gl.TEXTURE3);
    g.emissive.bind(gl.TEXTURE4);
    noise.bind(gl.TEXTURE5);
};

const endPostProcessingPass = () => {
    Texture.unBind(gl.TEXTURE0);
    Texture.unBind(gl.TEXTURE1);
    Texture.unBind(gl.TEXTURE2);
    Texture.unBind(gl.TEXTURE3);
    Texture.unBind(gl.TEXTURE4);
    Texture.unBind(gl.TEXTURE5);
};

const Buffers = {
    init,
    startGeomPass,
    endGeomPass,
    startLightingPass,
    endLightingPass,
    startBlurLightingPass,
    endBlurLightingPass,
    startBlurEmissivePass,
    endBlurEmissivePass,
    startPostProcessingPass,
    endPostProcessingPass
};

window.addEventListener(
    'resize',
    () => {
        Buffers.init(Context.width(), Context.height());
    },
    false
);

export { Buffers as default };
