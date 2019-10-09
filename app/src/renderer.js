import { Shaders, Shader } from './shaders.js';
import Resources from './resources.js';
import Buffers from './buffers.js';
import Settings from './settings.js';
import World from './world.js';
import { Context } from './context.js';

const quad = Resources.get('system/quad.mesh');

const doGeomPass = () => {
    Buffers.startGeomPass();
    Shaders.geometry.bind();

    World.render();

    Shader.unBind();
    Buffers.endGeomPass();
};

const doLightingPass = () => {
    Buffers.startLightingPass();

    Shaders.directionalLight.bind();
    Shaders.directionalLight.setInt('positionBuffer', 0);
    Shaders.directionalLight.setInt('normalBuffer', 1);
    Shaders.directionalLight.setInt('colorBuffer', 2);
    Shaders.directionalLight.setVec3('directionalLight.direction', [-3.0, 3.0, -5.0]);
    Shaders.directionalLight.setVec3('directionalLight.diffuse', [0.65, 0.625, 0.65]);
    Shaders.directionalLight.setVec3('directionalLight.ambient', [0.5, 0.475, 0.5]);

    quad.renderSingle();

    Shader.unBind();
    Buffers.endLightingPass();
};

const doEmissiveBlurPass = () => {
    for (let i = 0; i < Settings.bloomIteration; i++) {
        Buffers.startBlurEmissivePass();

        Shaders.gaussianBlur.bind();
        Shaders.gaussianBlur.setInt('colorBuffer', 0);
        Shaders.gaussianBlur.setVec2('viewportSize', [Context.width(), Context.height()]);
        Shaders.gaussianBlur.setVec2('direction', i % 2 === 0 ? [Settings.bloomOffset, 0] : [0, Settings.bloomOffset]);

        quad.renderSingle();

        Shader.unBind();
        Buffers.endBlurEmissivePass();
    }
};

const doPostProcessingPass = () => {
    Buffers.startPostProcessingPass();
    Shaders.postProcessing.bind();
    Shaders.postProcessing.setInt('doFXAA', Settings.dofxaa);
    Shaders.postProcessing.setInt('doSSAO', Settings.dossao);
    Shaders.postProcessing.setInt('doEmissive', Settings.doemissive);
    Shaders.postProcessing.setInt('colorBuffer', 0);
    Shaders.postProcessing.setInt('positionBuffer', 1);
    Shaders.postProcessing.setInt('normalBuffer', 2);
    Shaders.postProcessing.setInt('noiseBuffer', 3);
    Shaders.postProcessing.setInt('emissiveBuffer', 4);
    Shaders.postProcessing.setVec2('viewportSize', [Context.width(), Context.height()]);
    Shaders.postProcessing.setFloat('ssao.sampleRadius', Settings.ssaoRadius);
    Shaders.postProcessing.setFloat('ssao.bias', Settings.ssaoBias);
    Shaders.postProcessing.setVec2('ssao.attenuation', Settings.ssaoAttenuation);
    Shaders.postProcessing.setVec2('ssao.depthRange', [Settings.znear, Settings.zfar]);
    Shaders.postProcessing.setFloat('bloomMult', Settings.bloomMult);

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
