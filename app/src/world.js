import { mat4 } from './dependencies/gl-matrix.js';
import { gl, Context } from './context.js';
import Camera from './camera.js';
import { EntityTypes } from './entity.js';
import Resources from './resources.js';
import { Shaders, Shader } from './shaders.js';
import Console from './console.js';
import Utils from './utils.js';
import Loading from './loading.js';
import Physics from './physics.js';
import MeshEntity from './meshentity.js';
import Entities from './entities.js';

const quad = Resources.get('system/quad.mesh');
// const sphere = Resources.get('system/sphere.mesh');

let pauseUpdate = false;
const typeMap = new Map();
typeMap.set(1, 'meshes/wall.mesh');
typeMap.set(2, 'meshes/floor_ceiling.mesh');
typeMap.set(128, 'meshes/health.mesh');
typeMap.set(129, 'meshes/armor.mesh');
typeMap.set(130, 'meshes/ammo.mesh');
typeMap.set(150, 'meshes/grenade_launcher.mesh');
typeMap.set(151, 'meshes/minigun.mesh');

const lightMap = new Map();
lightMap.set(1, [0.153, 0.643, 0.871]);
lightMap.set(2, [0.569, 0.267, 0.722]);

let data = [];
let pickups = [];
let ambient = [0.5, 0.5, 0.5];
let spawnPoint = {
    position: [0, 0, 0],
    rotation: [0, 0, 0]
};

let entities = [];

const getAmbient = () => ambient;

const clear = () => {
    data.length = 0;
    pickups.length = 0;
    entities.length = 0;
    Physics.init();
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

const prepare = () => {
    // spawnpoint
    Camera.setPosition(spawnPoint.position);
    Camera.setRotation(spawnPoint.rotation);

    // add static level entities
    for (let i = 0; i < data.length; i++) {
        const innerLength = data[i].length;
        for (let j = 0; j < innerLength; j++) {
            const block = data[i][j];
            if (block > 0) {
                addEntities(new MeshEntity([i * 3, 0, j * 3], typeMap.get(block)));
            }
        }
    }

    // add dynamic map entities
    pickups.forEach((pickup) => {
        addEntities(Entities.createPickup([pickup[0] * 3, 0.6, pickup[1] * 3],
            pickup[2], typeMap.get(pickup[2])));
    });
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
    // pointlights
    gl.cullFace(gl.FRONT);
    Shaders.pointLight.bind();
    Shaders.pointLight.setMat4('matViewProj', Camera.viewProjection);
    Shaders.pointLight.setInt('positionBuffer', 0);
    Shaders.pointLight.setInt('normalBuffer', 1);
    Shaders.pointLight.setInt('shadowBuffer', 2);

    // instanced
    /*
    if (Settings.doRadiosity) {
        const m = mat4.create();
        mat4.identity(m);
        mat4.scale(m, m, [1.25, 1.25, 1.25]);
        Shaders.pointLight.setMat4('matWorld', m);
        Shaders.pointLight.setInt('lightType', 2);
        Shaders.pointLight.setFloat('pointLight.size', 1.35);
        Shaders.pointLight.setFloat('pointLight.intensity', 1.35);
        sphere.bind();
        buffers.forEach((value, key) => {
            Shaders.pointLight.setVec3('pointLight.color', lightMap.get(key));
            gl.bindBuffer(gl.ARRAY_BUFFER, value.id);
            gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 12, 0);
            gl.enableVertexAttribArray(3);
            gl.vertexAttribDivisor(3, 1);
            sphere.renderMany(value.count);
            gl.vertexAttribDivisor(3, 0);
            gl.disableVertexAttribArray(3);
        });
        sphere.unBind();
    }
    */

    // entities
    const pointLightEntities = getEntities(EntityTypes.POINTLIGHT);
    pointLightEntities.forEach((entity) => {
        entity.render();
    });

    Shader.unBind();
    gl.cullFace(gl.BACK);

    // apply shadows
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    Shaders.applyShadows.bind();
    Shaders.applyShadows.setInt('shadowBuffer', 2);
    Shaders.applyShadows.setVec2('viewportSize', [Context.width(), Context.height()]);
    quad.renderSingle();
    Shader.unBind();
};

const load = async (name) => {
    Loading.toggle(true);
    clear();

    const response = await Utils.fetch(`${window.location}resources/maps/${name}`);
    const world = JSON.parse(response);
    Loading.update(0, 2);

    ambient = world.ambient;
    spawnPoint = world.spawnpoint;
    data = world.data;
    pickups = world.pickups;
    Loading.update(1, 2);

    prepare();
    Loading.update(2, 2);
    Loading.toggle(false);
    Console.log(`Loaded: ${name}`);
};

const World = {
    load,
    pause,
    update,
    addEntities,
    getEntities,
    getAmbient,
    renderWorldGeometry,
    renderLighting,
    renderShadows,
    renderFPSGeometry
};

export { World as default };
