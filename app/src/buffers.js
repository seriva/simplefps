import { gl, Context } from './context.js';
import Texture from './texture.js';
import World from './world.js';
import Console from './console.js';

let noise = null;
let depth = null;

const BlurSourceType = {
    LIGHTING: 1,
    EMISSIVE: 2
};

const BufferType = {
    GEOMETRY: 1,
    SHADOW: 2,
    LIGHT: 3,
    BLUR: 4
};

const g = {
    framebuffer: null,
    position: null,
    normal: null,
    color: null,
    emissive: null,
    width: 0,
    height: 0
};

const s = {
    framebuffer: null,
    shadow: null,
    width: 0,
    height: 0
};

const l = {
    framebuffer: null,
    light: null,
    width: 0,
    height: 0
};

const b = {
    framebuffer: null,
    blur: null,
    source: null,
    width: 0,
    height: 0
};

const checkFramebufferStatus = (fbo) => {
    const status = gl.checkFramebufferStatus(fbo);
    switch (status) {
    case gl.FRAMEBUFFER_COMPLETE:
        break;
    case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        Console.error('FRAMEBUFFER_INCOMPLETE_ATTACHMENT');
        break;
    case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        Console.error('FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT');
        break;
    case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        Console.error('FRAMEBUFFER_INCOMPLETE_DIMENSIONS');
        break;
    case gl.FRAMEBUFFER_UNSUPPORTED:
        Console.error('FRAMEBUFFER_UNSUPPORTED');
        break;
    default:
        break;
    }
};

const getBufferSize = (fbo) => {
    switch (fbo) {
    case BufferType.GEOMETRY:
        return [g.width, g.height];
    case BufferType.SHADOW:
        return [s.width, s.height];
    case BufferType.LIGHT:
        return [l.width, l.height];
    case BufferType.BLUR:
        return [b.width, b.height];
    default:
        return [];
    }
};

const init = (width, height) => {
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

    // **********************************
    // depth buffer
    // **********************************
    depth = new Texture({
        format: gl.DEPTH_COMPONENT16,
        width,
        height
    });

    // **********************************
    // geometry buffer
    // **********************************
    g.width = width;
    g.height = height;
    g.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    g.position = new Texture({
        format: gl.RGBA16F,
        width: g.width,
        height: g.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.position.texture, 0);

    g.normal = new Texture({
        format: gl.RGBA16F,
        width: g.width,
        height: g.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, g.normal.texture, 0);

    g.color = new Texture({
        format: gl.RGBA8,
        width: g.width,
        height: g.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, g.color.texture, 0);

    g.emissive = new Texture({
        format: gl.RGBA8,
        width: g.width,
        height: g.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, g.emissive.texture, 0);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth.texture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    checkFramebufferStatus(g.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // shadow buffer
    // **********************************
    s.width = width;
    s.height = height;
    s.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    s.shadow = new Texture({
        format: gl.RGBA8,
        width: s.width,
        height: s.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.shadow.texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth.texture, 0);
    checkFramebufferStatus(s.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // lighting buffer
    // **********************************
    l.width = width; // Math.round(width * 0.5);
    l.height = height; // Math.round(height * 0.5);
    l.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    l.light = new Texture({
        format: gl.RGBA8,
        width: l.width,
        height: l.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, l.light.texture, 0);
    checkFramebufferStatus(l.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // gaussianblur buffer
    // **********************************
    b.width = width;
    b.height = height;
    b.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    b.blur = new Texture({
        format: gl.RGBA8,
        width: b.width,
        height: b.height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.blur.texture, 0);
    checkFramebufferStatus(b.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const setWorldClearColor = () => {
    const ambient = World.getAmbient();
    gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
};

const startBlurPass = (blurSource) => {
    switch (blurSource) {
    case BlurSourceType.SHADOW:
        b.source = s.shadow;
        break;
    case BlurSourceType.LIGHTING:
        b.source = l.light;
        break;
    case BlurSourceType.EMISSIVE:
        b.source = g.emissive;
        break;
    default:
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
};

const endBlurPass = () => {
    Texture.unBind(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const swapBlur = (i) => {
    if (i % 2 === 0) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.blur.texture, 0);
        b.source.bind(gl.TEXTURE0);
    } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.source.texture, 0);
        b.blur.bind(gl.TEXTURE0);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
};

const startGeomPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
    gl.viewport(0, 0, g.width, g.height);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    setWorldClearColor();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

const endGeomPass = () => {
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startShadowPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
    gl.viewport(0, 0, s.width, s.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
};

const endShadowPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startLightingPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
    gl.viewport(0, 0, l.width, l.height);
    setWorldClearColor();
    gl.clear(gl.COLOR_BUFFER_BIT);
    g.position.bind(gl.TEXTURE0);
    g.normal.bind(gl.TEXTURE1);
    s.shadow.bind(gl.TEXTURE2);
};

const endLightingPass = () => {
    Texture.unBind(gl.TEXTURE0);
    Texture.unBind(gl.TEXTURE1);
    Texture.unBind(gl.TEXTURE2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startPostProcessingPass = () => {
    gl.viewport(0, 0, g.width, g.height);
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
    startShadowPass,
    endShadowPass,
    startLightingPass,
    endLightingPass,
    startBlurPass,
    endBlurPass,
    swapBlur,
    startPostProcessingPass,
    endPostProcessingPass,
    getBufferSize
};

window.addEventListener(
    'resize',
    () => {
        Buffers.init(Context.width(), Context.height());
    },
    false
);

export { Buffers, BlurSourceType, BufferType };
