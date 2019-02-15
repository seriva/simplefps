import Renderer from './renderer.js';
import Texture from './texture.js';

const gl = Renderer.gl;

const g = {
    framebuffer: null,
    position: null,
    normal: null,
    color: null,
    depth: null
};

const l = {
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
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        g.position.texture,
        0
    );

    g.normal = new Texture({
        format: gl.RGBA16F,
        width,
        height
    });
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT1,
        gl.TEXTURE_2D,
        g.normal.texture,
        0
    );

    g.color = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT2,
        gl.TEXTURE_2D,
        g.color.texture,
        0
    );

    g.depth = new Texture({
        format: gl.DEPTH_COMPONENT16,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, g.depth.texture, 0);

    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // **********************************
    // lighting buffer
    // **********************************
    l.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    l.color = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        l.color.texture,
        0
    );

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

const startPostProcessingPass = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    l.color.bind(gl.TEXTURE0);
    g.position.bind(gl.TEXTURE1);
    g.normal.bind(gl.TEXTURE2);
    noise.bind(gl.TEXTURE3);
};

const endPostProcessingPass = () => {
    Texture.unBind(gl.TEXTURE0);
    Texture.unBind(gl.TEXTURE1);
    Texture.unBind(gl.TEXTURE2);
    Texture.unBind(gl.TEXTURE3);
};

const Buffers = {
    init,
    startGeomPass,
    endGeomPass,
    startLightingPass,
    endLightingPass,
    startPostProcessingPass,
    endPostProcessingPass
};

window.addEventListener(
    'resize',
    () => {
        Buffers.init(Renderer.width(), Renderer.height());
    },
    false
);

export { Buffers as default };
