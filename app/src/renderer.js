import { Shaders, Shader } from './shaders.js';
import Resources from './resources.js';
import Buffers from './buffers.js';
import Settings from './settings.js';
import World from './world.js';
import { gl, Context } from './context.js';

const quad = Resources.get('system/quad.mesh');

const doGeomPass = () => {
    Buffers.startGeomPass();
    Shaders.geometry.bind();

    World.renderGeometry();

    Shader.unBind();
    Buffers.endGeomPass();
};

const doLightingPass = () => {
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    Buffers.startLightingPass();

    World.renderLights();

    Buffers.endLightingPass();
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

    for (let i = 0; i < 2; i++) {
        Buffers.startBlurLightingPass();

        Shaders.gaussianBlur.bind();
        Shaders.gaussianBlur.setInt('colorBuffer', 0);
        Shaders.gaussianBlur.setVec2('viewportSize', [Context.width(), Context.height()]);
        Shaders.gaussianBlur.setVec2('direction', i % 2 === 0 ? [1.5, 0] : [0, 1.5]);

        quad.renderSingle();

        Shader.unBind();
        Buffers.endBlurLightingPass();
    }
};

const doEmissiveBlurPass = () => {
    for (let i = 0; i < Settings.emissiveIteration; i++) {
        Buffers.startBlurEmissivePass();

        Shaders.gaussianBlur.bind();
        Shaders.gaussianBlur.setInt('colorBuffer', 0);
        Shaders.gaussianBlur.setVec2('viewportSize', [Context.width(), Context.height()]);
        Shaders.gaussianBlur.setVec2('direction',
            i % 2 === 0 ? [Settings.emissiveOffset, 0] : [0, Settings.emissiveOffset]);

        quad.renderSingle();

        Shader.unBind();
        Buffers.endBlurEmissivePass();
    }
};

const doPostProcessingPass = () => {
    Buffers.startPostProcessingPass();
    Shaders.postProcessing.bind();
    Shaders.postProcessing.setInt('doFXAA', Settings.doFXAA);
    Shaders.postProcessing.setInt('doSSAO', Settings.doSSAO);
    Shaders.postProcessing.setInt('doEmissive', Settings.doEmissive);
    Shaders.postProcessing.setInt('colorBuffer', 0);
    Shaders.postProcessing.setInt('lightBuffer', 1);
    Shaders.postProcessing.setInt('positionBuffer', 2);
    Shaders.postProcessing.setInt('normalBuffer', 3);
    Shaders.postProcessing.setInt('emissiveBuffer', 4);
    Shaders.postProcessing.setInt('noiseBuffer', 5);
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
        doGeomPass();
        doLightingPass();
        doEmissiveBlurPass();
        doPostProcessingPass();
    }
};

export { Renderer as default };
