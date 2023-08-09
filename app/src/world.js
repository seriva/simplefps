import { mat4, glMatrix } from './dependencies/gl-matrix.js';
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
import PointlightEntity from './pointlightentity.js';

const quad = Resources.get('system/quad.mesh');
const cellSize = 3;
const meshMap = new Map();
meshMap.set(1, 'meshes/wall.mesh');
meshMap.set(2, 'meshes/floor.mesh');
meshMap.set(3, 'meshes/ceiling.mesh');
meshMap.set(4, 'meshes/lamp.mesh');
meshMap.set(128, 'meshes/health.mesh');
meshMap.set(129, 'meshes/armor.mesh');
meshMap.set(130, 'meshes/ammo.mesh');
meshMap.set(150, 'meshes/grenade_launcher.mesh');
meshMap.set(151, 'meshes/minigun.mesh');

let data = [];
let pickups = [];
let ambient = [0.5, 0.5, 0.5];
let spawnPoint = {
    position: [0, 0, 0],
    rotation: [0, 0, 0]
};
let pauseUpdate = false;
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

    // create static map entities
    const wallLight = [0.2, 0.452, 0.862];
    const outer = data.length;
    for (let i = 0; i < outer; i++) {
        const inner = data[i].length;
        for (let j = 0; j < inner; j++) {
            const block = data[i][j];
            let entity = null;
            switch (block) {
            case 1:
                if (i + 1 < outer && data[i + 1][j] > 1) {
                    entity = new MeshEntity([(i * cellSize) + 1.505, 0, j * cellSize], meshMap.get(1));
                    entity.addChild(new PointlightEntity([(i * cellSize) + 1.85, 0.25, (j * cellSize) - 1.25], 2, wallLight, 1.85));
                    entity.addChild(new PointlightEntity([(i * cellSize) + 1.85, 0.25, (j * cellSize) + 1.25], 2, wallLight, 1.85));
                    mat4.fromRotation(entity.ani_matrix, glMatrix.toRadian(-90), [0, 1, 0]);
                    addEntities(entity);
                }
                if (i - 1 >= 0 && data[i - 1][j] > 1) {
                    entity = new MeshEntity([(i * cellSize) - 1.505, 0, j * cellSize], meshMap.get(1));
                    entity.addChild(new PointlightEntity([(i * cellSize) - 1.85, 0.25, (j * cellSize) - 1.25], 2, wallLight, 1.85));
                    entity.addChild(new PointlightEntity([(i * cellSize) - 1.85, 0.25, (j * cellSize) + 1.25], 2, wallLight, 1.85));
                    mat4.fromRotation(entity.ani_matrix, glMatrix.toRadian(90), [0, 1, 0]);
                    addEntities(entity);
                }
                if (j + 1 < inner && data[i][j + 1] > 1) {
                    entity = new MeshEntity([i * cellSize, 0, (j * cellSize) + 1.505], meshMap.get(1));
                    entity.addChild(new PointlightEntity([(i * cellSize) - 1.25, 0.25, (j * cellSize) + 1.85], 2, wallLight, 1.85));
                    entity.addChild(new PointlightEntity([(i * cellSize) + 1.25, 0.25, (j * cellSize) + 1.85], 2, wallLight, 1.85));
                    mat4.fromRotation(entity.ani_matrix, glMatrix.toRadian(180), [0, 1, 0]);
                    addEntities(entity);
                }
                if (j - 1 >= 0 && data[i][j - 1] > 1) {
                    entity = new MeshEntity([i * cellSize, 0, (j * cellSize) - 1.505], meshMap.get(1));
                    entity.addChild(new PointlightEntity([(i * cellSize) - 1.25, 0.25, (j * cellSize) - 1.85], 2, wallLight, 1.85));
                    entity.addChild(new PointlightEntity([(i * cellSize) + 1.25, 0.25, (j * cellSize) - 1.85], 2, wallLight, 1.85));
                    addEntities(entity);
                }
                break;
            case 2:
                addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(2)));
                addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(3)));
                break;
            case cellSize:
                addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(2)));
                addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(3)));
                addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(4)));
                addEntities(new PointlightEntity([i * cellSize, 3, j * cellSize], 8, wallLight, 1.0));
                addEntities(new PointlightEntity([i * cellSize, 1, j * cellSize], 4, wallLight, 6.0));
                break;
            default:
                // code block
            }
        }
    }

    // add dynamic map entities
    pickups.forEach((pickup) => {
        addEntities(Entities.createPickup([(pickup[0] - 1) * cellSize, 0.6, (pickup[1] - 1) * cellSize],
            pickup[2], meshMap.get(pickup[2])));
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
