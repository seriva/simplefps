import prettyJsonStringify from './libs/pretty-json-stringify/index.js';
import { mat4 } from './libs/gl-matrix.js';
import { gl, Context } from './context.js';
import Camera from './camera.js';
import { EntityTypes } from './entity.js';
import Resources from './resources.js';
import { Shaders, Shader } from './shaders.js';
import Skybox from './skybox.js';
import Console from './console.js';
import Utils from './utils.js';
import Loading from './loading.js';
import Physics from './physics.js';
import Settings from './settings.js';
import Game from './game.js';

const quad = Resources.get('system/quad.mesh');
const cube = Resources.get('meshes/cube.mesh');
const sphere = Resources.get('system/sphere.mesh');

let pauseUpdate = false;
const typeMap = new Map();
typeMap.set(1, 'mat_world_tiles');
typeMap.set(2, 'mat_world_concrete');
typeMap.set(128, 'meshes/health.mesh');
typeMap.set(129, 'meshes/armor.mesh');
typeMap.set(130, 'meshes/ammo.mesh');

const lightMap = new Map();
lightMap.set(1, [0.153, 0.643, 0.871]);
lightMap.set(2, [0.569, 0.267, 0.722]);

const dimension = 256;
let skyBoxId = 1;
let ambient = [0.5, 0.475, 0.5];
let spawnPoint = {
    position: [0, 0, 0],
    rotation: [0, 0, 0]
};
let mainLight = {
    direction: [-3.0, 3.0, -5.0],
    color: [0.65, 0.625, 0.65],
};

const blockData = new Uint8Array(dimension * dimension * dimension);
let entities = [];
const buffers = new Map();

// const to1D = (x, y, z) => (z * dimension * dimension) + (y * dimension) + x;
const to3D = (i) => {
    const x = Math.floor(i % dimension);
    const y = Math.floor((i / dimension) % dimension);
    const z = Math.floor(i / (dimension * dimension));
    return [x, y, z];
};

const clear = () => {
    skyBoxId = 1;
    blockData.fill(0);
    entities.length = 0;
    buffers.forEach((value) => {
        gl.deleteBuffer(value.id);
    });
    buffers.clear();
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
    gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);

    // set skydome
    Skybox.set(skyBoxId);

    // spawnpoint
    Camera.setPosition(spawnPoint.position);
    Camera.setRotation(spawnPoint.rotation);

    // prepare map data and entities
    blockData.forEach((block, i) => {
        // map blocks
        if (block >= 1 && block < 128) {
            if (!buffers.has(block)) {
                buffers.set(block, {
                    id: gl.createBuffer(),
                    count: 0,
                    data: []
                });
            }
            const buffer = buffers.get(block);
            const pos = to3D(i);
            buffer.data.push(...pos);
            Physics.addWorldCube(pos[0], pos[1], pos[2]);
            buffer.count++;
        // entities
        } else if (block >= 128) {
            addEntities(Game.createPowerup(to3D(i), block, typeMap.get(block)));
        }
    });

    buffers.forEach((value) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, value.id);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(value.data), gl.STATIC_DRAW);
        value.data = [];
    });
};

const pause = (doPause) => {
    pauseUpdate = doPause;
};

const update = (frameTime) => {
    if (pauseUpdate) return;
    Physics.update(frameTime);
    entities.forEach((entity) => {
        entity.update(frameTime);
    });
};

const renderGeometry = () => {
    Skybox.render();

    const matModel = mat4.create();
    mat4.identity(matModel);
    Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);
    Shaders.geometry.setMat4('matWorld', matModel);

    cube.bind();
    buffers.forEach((value, key) => {
        cube.indices[0].material = typeMap.get(key);
        gl.bindBuffer(gl.ARRAY_BUFFER, value.id);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribDivisor(3, 1);
        cube.renderMany(value.count);
        gl.vertexAttribDivisor(3, 0);
        gl.disableVertexAttribArray(3);
    });
    cube.unBind();

    const meshEntities = getEntities(EntityTypes.MESH);
    meshEntities.forEach((entity) => {
        entity.render();
    });
};

const renderLights = () => {
    // directional light
    Shaders.directionalLight.bind();
    Shaders.directionalLight.setInt('positionBuffer', 0);
    Shaders.directionalLight.setInt('normalBuffer', 1);
    Shaders.directionalLight.setVec3('directionalLight.direction', mainLight.direction);
    Shaders.directionalLight.setVec3('directionalLight.color', mainLight.color);
    Shaders.directionalLight.setVec2('viewportSize', [Context.width(), Context.height()]);
    quad.renderSingle();
    Shader.unBind();

    // pointlights
    Shaders.pointLight.bind();
    Shaders.pointLight.setMat4('matViewProj', Camera.viewProjection);
    Shaders.pointLight.setInt('positionBuffer', 0);
    Shaders.pointLight.setInt('normalBuffer', 1);

    // instanced
    if (Settings.doEmissiveLighting) {
        const m = mat4.create();
        mat4.identity(m);
        mat4.scale(m, m, [1.25, 1.25, 1.25]);
        Shaders.pointLight.setMat4('matWorld', m);
        Shaders.pointLight.setInt('lightType', 2);
        Shaders.pointLight.setFloat('pointLight.size', 1.25);
        Shaders.pointLight.setFloat('pointLight.intensity', 1.25);
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

    // entities
    const pointLightEntities = getEntities(EntityTypes.POINTLIGHT);
    pointLightEntities.forEach((entity) => {
        entity.render();
    });

    Shader.unBind();
};

const load = async (name) => {
    Loading.toggle(true);
    clear();

    const response = await Utils.fetch(`${window.location}resources/maps/${name}`);
    const world = JSON.parse(response);
    Loading.update(0, 2);

    skyBoxId = world.skybox;
    ambient = world.ambient;
    spawnPoint = world.spawnpoint;
    mainLight = world.mainlight;

    for (let i = 0; i < world.data.length - 1; i += 2) {
        blockData[world.data[i]] = world.data[i + 1];
    }
    Loading.update(1, 2);

    prepare();
    Loading.update(2, 2);
    Loading.toggle(false);
    Console.log(`Loaded: ${name}`);
};

const save = (name) => {
    const data = [];
    blockData.forEach((block, i) => {
        if (block >= 1) {
            data.push(i, block);
        }
    });

    Utils.download(prettyJsonStringify({
        skybox: skyBoxId,
        spawnpoint: spawnPoint,
        ambient,
        mainlight: mainLight,
        data
    }, {
        spaceAfterComma: '',
        shouldExpand: (object, level, key) => {
            if (key === 'data') return false;
            if (key === 'position') return false;
            if (key === 'rotation') return false;
            if (key === 'direction') return false;
            if (key === 'color') return false;
            if (key === 'ambient') return false;
            return true;
        }
    }),
    name, 'application/json');
    Console.log(`Saved: ${name}`);
};
Console.registerCmd('saveworld', save);

const World = {
    load,
    pause,
    update,
    addEntities,
    getEntities,
    renderGeometry,
    renderLights
};

export { World as default };
