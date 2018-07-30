import Renderer from './renderer';
import Texture from './texture';

const gl = Renderer.gl;

const data = {
    framebuffer: null,
    position: null,
    normal: null,
    color: null,
    depth: null
};

const init = (width, height) => {
    data.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, data.framebuffer);
    gl.activeTexture(gl.TEXTURE0);

    data.position = new Texture({
        format: gl.RGBA16F,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, data.position.texture, 0);

    data.normal = new Texture({
        format: gl.RGBA16F,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, data.normal.texture, 0);

    data.color = new Texture({
        format: gl.RGBA8,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, data.color.texture, 0);

    data.depth = new Texture({
        format: gl.DEPTH_COMPONENT16,
        width,
        height
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, data.depth.texture, 0);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2
    ]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const startGeomPass = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, data.framebuffer);
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
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    data.position.bind(gl.TEXTURE0);
    data.normal.bind(gl.TEXTURE1);
    data.color.bind(gl.TEXTURE2);
};

const endLightingPass = () => {
    data.position.unBind();
    data.normal.unBind();
    data.color.unBind();
};

window.addEventListener('resize', () => {
    GBuffer.init(document.body.clientWidth, document.body.clientHeight);
}, false);

const GBuffer = {
    data,
    init,
    startGeomPass,
    endGeomPass,
    startLightingPass,
    endLightingPass
};

export { GBuffer as default };
