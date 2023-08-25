import { mat4 } from '../dependencies/gl-matrix.js';
import Physics from './physics.js';
import { gl, Context } from './context.js';
import { EntityTypes } from './entity.js';
import { Shaders, Shader } from './shaders.js';
import Camera from './camera.js';
import { screenQuad } from './shapes.js';

let entities = [];
let ambient = [0.5, 0.5, 0.5];
let pauseUpdate = false;

const init = () => {
    entities.length = 0;
    Physics.init();
};

const getAmbient = () => ambient;
const setAmbient = (a) => {
    ambient = a;
};

const addEntities = (e) => {
    if (Array.isArray(e)) {
        entities = entities.concat(e);
    } else {
        entities.push(e);
    }
};

const getEntities = (type) => {
    let selection = [];
    entities.forEach((entity) => {
        if (entity.type === type) {
            selection.push(entity);
        }
        selection = selection.concat(entity.getChildren(type));
    });
    return selection;
};
const pause = (doPause) => {
    pauseUpdate = doPause;
};

const update = (frameTime) => {
    if (pauseUpdate) return;
    Physics.update();
    entities.forEach((entity) => {
        entity.update(frameTime);
    });
};

const renderWorldGeometry = () => {
    Shaders.geometry.bind();

    const matModel = mat4.create();
    mat4.identity(matModel);
    Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);
    Shaders.geometry.setMat4('matWorld', matModel);

    const meshEntities = getEntities(EntityTypes.MESH);
    meshEntities.forEach((entity) => {
        entity.render();
    });

    const fpsMeshEntities = getEntities(EntityTypes.FPS_MESH);
    fpsMeshEntities.forEach((entity) => {
        entity.render();
    });

    Shader.unBind();
};

const renderFPSGeometry = () => {
    Shaders.geometry.bind();

    const matModel = mat4.create();
    mat4.identity(matModel);
    Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);
    Shaders.geometry.setMat4('matWorld', matModel);

    const fpsMeshEntities = getEntities(EntityTypes.FPS_MESH);
    fpsMeshEntities.forEach((entity) => {
        entity.render();
    });

    Shader.unBind();
};

const renderShadows = () => {
    Shaders.entityShadows.bind();
    Shaders.entityShadows.setMat4('matViewProj', Camera.viewProjection);
    Shaders.entityShadows.setVec3('ambient', ambient);

    const meshEntities = getEntities(EntityTypes.MESH);
    meshEntities.forEach((entity) => {
        entity.renderShadow();
    });

    Shader.unBind();
};

const renderLighting = () => {
    // directional lights
    Shaders.directionalLight.bind();
    Shaders.directionalLight.setInt('positionBuffer', 0);
    Shaders.directionalLight.setInt('normalBuffer', 1);
    Shaders.directionalLight.setVec2('viewportSize', [Context.width(), Context.height()]);

    const directionalLightEntities = getEntities(EntityTypes.DIRECTIONAL_LIGHT);
    directionalLightEntities.forEach((entity) => {
        entity.render();
    });

    Shader.unBind();

    // pointlights
    gl.cullFace(gl.FRONT);
    Shaders.pointLight.bind();
    Shaders.pointLight.setMat4('matViewProj', Camera.viewProjection);
    Shaders.pointLight.setInt('positionBuffer', 0);
    Shaders.pointLight.setInt('normalBuffer', 1);
    Shaders.pointLight.setInt('shadowBuffer', 2);

    const pointLightEntities = getEntities(EntityTypes.POINT_LIGHT);
    pointLightEntities.forEach((entity) => {
        entity.render();
    });

    Shader.unBind();
    gl.cullFace(gl.BACK);

    // shadows
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    Shaders.applyShadows.bind();
    Shaders.applyShadows.setInt('shadowBuffer', 2);
    Shaders.applyShadows.setVec2('viewportSize', [Context.width(), Context.height()]);
    screenQuad.renderSingle();
    Shader.unBind();
};

const Scene = {
    init,
    pause,
    update,
    getAmbient,
    setAmbient,
    addEntities,
    getEntities,
    renderWorldGeometry,
    renderLighting,
    renderShadows,
    renderFPSGeometry
};

export { Scene as default };
