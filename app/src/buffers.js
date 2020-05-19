import { gl, Context } from './context.js';
import Texture from './texture.js';
import World from './world.js';
import Console from './console.js';

let depth = null;

const BlurSourceType = {
    LIGHTING: 1,
    EMISSIVE: 2
};

const g = {
    framebuffer: null,
    position: null,
    normal: null,
    color: null,
    emissive: null
};

const s = {
    framebuffer: null,
    shadow: null
};

const l = {
    framebuffer: null,
    light: null
};

const b = {
    framebuffer: null,
    blur: null,
    source: null
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

const init = (width, height) => {
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

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth.texture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    checkFramebufferStatus(g.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // shadow buffer
    // **********************************
    s.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    s.shadow = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.shadow.texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth.texture, 0);
    checkFramebufferStatus(s.framebuffer);
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
    checkFramebufferStatus(l.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // gaussianblur buffer
    // **********************************
    b.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    b.blur = new Texture({
        format: gl.RGBA8,
        width,
        height
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
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
};

const endShadowPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startLightingPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
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
    g.color.bind(gl.TEXTURE0);
    l.light.bind(gl.TEXTURE1);
    g.position.bind(gl.TEXTURE2);
    g.normal.bind(gl.TEXTURE3);
    g.emissive.bind(gl.TEXTURE4);
};

const endPostProcessingPass = () => {
    Texture.unBind(gl.TEXTURE0);
    Texture.unBind(gl.TEXTURE1);
    Texture.unBind(gl.TEXTURE2);
    Texture.unBind(gl.TEXTURE3);
    Texture.unBind(gl.TEXTURE4);
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
    endPostProcessingPass
};

window.addEventListener(
    'resize',
    () => {
        Buffers.init(Context.width(), Context.height());
    },
    false
);

export { Buffers, BlurSourceType };
