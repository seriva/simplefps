import { Shaders, Shader } from './shaders.js';
import Resources from './resources.js';
import { Buffers, BlurSourceType, BufferType } from './buffers.js';
import Settings from './settings.js';
import World from './world.js';
import { gl, Context } from './context.js';

const quad = Resources.get('system/quad.mesh');

const blurImage = (source, iterations, radius) => {
    Shaders.gaussianBlur.bind();
    Buffers.startBlurPass(source);
    for (let i = 0; i < iterations; i++) {
        Buffers.swapBlur(i);

        Shaders.gaussianBlur.setInt('colorBuffer', 0);
        Shaders.gaussianBlur.setVec2('viewportSize', [Context.width(), Context.height()]);
        Shaders.gaussianBlur.setVec2('direction', i % 2 === 0 ? [radius, 0] : [0, radius]);

        quad.renderSingle();
    }
    Buffers.endBlurPass();
    Shader.unBind();
};

const geomPass = () => {
    Buffers.startGeomPass();

    World.renderGeometry();

    Buffers.endLightingPass();
};

const shadowPass = () => {
    Buffers.startShadowPass();

    World.renderShadows();

    Buffers.endShadowPass();

    blurImage(BlurSourceType.SHADOW, 3, 2);
};

const lightingPass = () => {
    Buffers.startLightingPass();

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    World.renderLights();

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    Buffers.endLightingPass();

    blurImage(BlurSourceType.LIGHTING, 3, 1.5);
};

const emissiveBlurPass = () => {
    blurImage(BlurSourceType.EMISSIVE, Settings.emissiveIteration, Settings.emissiveOffset);
};

const postProcessingPass = () => {
    Buffers.startPostProcessingPass();
    Shaders.postProcessing.bind();
    Shaders.postProcessing.setInt('doFXAA', Settings.doFXAA);
    Shaders.postProcessing.setInt('doSSAO', Settings.doSSAO);
    Shaders.postProcessing.setInt('colorBuffer', 0);
    Shaders.postProcessing.setInt('lightBuffer', 1);
    Shaders.postProcessing.setInt('positionBuffer', 2);
    Shaders.postProcessing.setInt('normalBuffer', 3);
    Shaders.postProcessing.setInt('emissiveBuffer', 4);
    Shaders.postProcessing.setInt('shadowBuffer', 5);
    Shaders.postProcessing.setInt('noiseBuffer', 6);
    Shaders.postProcessing.setVec2('viewportSize', [Context.width(), Context.height()]);
    Shaders.postProcessing.setFloat('ssao.sampleRadius', Settings.ssaoRadius);
    Shaders.postProcessing.setFloat('ssao.bias', Settings.ssaoBias);
    Shaders.postProcessing.setVec2('ssao.attenuation', Settings.ssaoAttenuation);
    Shaders.postProcessing.setVec2('ssao.depthRange', [Settings.zNear, Settings.zFar]);
    Shaders.postProcessing.setFloat('emissiveMult', Settings.emissiveMult);
    Shaders.postProcessing.setFloat('gamma', Settings.gamma);

    quad.renderSingle();

    Shader.unBind();
    Buffers.endPostProcessingPass();
};

const Renderer = {
    render() {
        geomPass();
        shadowPass();
        lightingPass();
        emissiveBlurPass();
        postProcessingPass();
    }
};

export { Renderer as default };
