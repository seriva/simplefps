import Renderer from './renderer';
import Texture from './texture';
import Settings from  './settings';

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
    color: null,
};

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

    g.depth = new Texture({
        format: gl.DEPTH_COMPONENT16,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, g.depth.texture, 0);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2
    ]);
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
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, l.color.texture, 0);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0
    ]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    g.position.unBind();
    g.normal.unBind();
    g.color.unBind();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startPostProcessingPass = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    l.color.bind(gl.TEXTURE0);
};

const endPostProcessingPass = () => {
    l.color.unBind();
};

window.addEventListener('resize', () => {
    Buffers.init(Math.floor(gl.canvas.clientWidth * window.devicePixelRatio * Settings.renderscale),
                 Math.floor(gl.canvas.clientHeight * window.devicePixelRatio * Settings.renderscale));
}, false);

const Buffers = {
    init,
    startGeomPass,
    endGeomPass,
    startLightingPass,
    endLightingPass,
    startPostProcessingPass,
    endPostProcessingPass
};

export { Buffers as default };
