import prettyJsonStringify from './dependencies/pretty-json-stringify.js';
import { mat4, vec3 } from './dependencies/gl-matrix.js';
import { gl, Context } from './context.js';
import CANNON from './dependencies/cannon.js';
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
import Entities from './entities.js';

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
typeMap.set(150, 'meshes/grenade_launcher.mesh');
typeMap.set(151, 'meshes/minigun.mesh');

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
const shadowAmbient = [1, 1, 1];

const blocks = new Uint8Array(dimension * dimension * dimension);
const blockified = new Array(dimension * dimension * dimension);
blockified.fill(false);
let entities = [];
const buffers = new Map();

const to1D = (x, y, z) => (z * dimension * dimension) + (y * dimension) + x;
const to3D = (i) => {
    const x = Math.floor(i % dimension);
    const y = Math.floor((i / dimension) % dimension);
    const z = Math.floor(i / (dimension * dimension));
    return [x, y, z];
};

const getBlockIndex = (x, y, z) => {
    if (x >= 0 && x < dimension
        && y >= 0 && y < dimension
        && z >= 0 && z < dimension) {
        return x + dimension * y + dimension * dimension * z;
    }
    return -1;
};

const isFilled = (x, y, z) => {
    const i = getBlockIndex(x, y, z);
    if (i !== -1) return (blocks[i] >= 1 && blocks[i] < 128);
    return false;
};

const isBlockified = (x, y, z) => {
    const i = getBlockIndex(x, y, z);
    if (i !== -1) return blockified[i] > 0;
    return false;
};

const setBlockified = (x, y, z, value) => {
    blockified[getBlockIndex(x, y, z)] = !!value;
};

const getAmbient = () => ambient;

const calcShadowAmbient = () => {
    const up = vec3.fromValues(0, 1, 0);
    const ld = vec3.fromValues(mainLight.direction[0], mainLight.direction[1], mainLight.direction[2]);
    vec3.inverse(ld, ld);
    vec3.normalize(ld, ld);
    const dot = Math.max(vec3.dot(up, ld), 0);
    shadowAmbient[0] = (mainLight.color[0] * dot) + ambient[0];
    shadowAmbient[1] = (mainLight.color[1] * dot) + ambient[1];
    shadowAmbient[2] = (mainLight.color[2] * dot) + ambient[2];
};

const clear = () => {
    skyBoxId = 1;
    blocks.fill(0);
    blockified.fill(false);
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
    // set skydome
    Skybox.set(skyBoxId);

    // spawnpoint
    Camera.setPosition(spawnPoint.position);
    Camera.setRotation(spawnPoint.rotation);

    // prepare map data and entities
    blocks.forEach((block, i) => {
        // map blocks
        const pos = to3D(i);
        if (block >= 1 && block < 128) {
            if (!buffers.has(block)) {
                buffers.set(block, {
                    id: gl.createBuffer(),
                    count: 0,
                    data: []
                });
            }
            const buffer = buffers.get(block);
            buffer.data.push(...pos);
            buffer.count++;
        // entities
        } else if (block >= 128) {
            addEntities(Entities.createPickup(pos, block, typeMap.get(block)));
        }
    });

    buffers.forEach((value) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, value.id);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(value.data), gl.STATIC_DRAW);
        value.data = [];
    });

    // shadow ambient
    calcShadowAmbient();

    // prepare physics bodies
    const boxes = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
        let box;

        // 1. Get a filled box that we haven't boxified yet
        for (let i = 0; !box && i < dimension; i++) {
            for (let j = 0; !box && j < dimension; j++) {
                for (let k = 0; !box && k < dimension; k++) {
                    if (isFilled(i, j, k) && !isBlockified(i, j, k)) {
                        box = new CANNON.Body({ mass: 0 });
                        box.xi = i; // Position
                        box.yi = j;
                        box.zi = k;
                        box.nx = 0; // Size
                        box.ny = 0;
                        box.nz = 0;
                        boxes.push(box);
                    }
                }
            }
        }

        // 2. Check if we can merge it with its neighbors
        if (box) {
            // Check what can be merged
            const { xi } = box;
            const { yi } = box;
            const { zi } = box;
            box.nx = dimension; // merge=1 means merge just with the self box
            box.ny = dimension;
            box.nz = dimension;

            // Merge in x
            for (let i = xi; i < dimension + 1; i++) {
                if (!isFilled(i, yi, zi) || (isBlockified(i, yi, zi) && getBlockIndex(i, yi, zi) !== -1)) {
                    // Can't merge this box. Make sure we limit the merging
                    box.nx = i - xi;
                    break;
                }
            }

            // Merge in y
            let found = false;
            for (let i = xi; !found && i < xi + box.nx; i++) {
                for (let j = yi; !found && j < dimension + 1; j++) {
                    if (!isFilled(i, j, zi) || (isBlockified(i, j, zi) && getBlockIndex(i, j, zi) !== -1)) {
                        // Can't merge this box. Make sure we limit the merging
                        if (box.ny > j - yi) box.ny = j - yi;
                    }
                }
            }

            // Merge in z
            found = false;
            for (let i = xi; !found && i < xi + box.nx; i++) {
                for (let j = yi; !found && j < yi + box.ny; j++) {
                    for (let k = zi; k < dimension + 1; k++) {
                        if (!isFilled(i, j, k) || (isBlockified(i, j, k) && getBlockIndex(i, j, k) !== -1)) {
                            // Can't merge this box. Make sure we limit the merging
                            if (box.nz > k - zi) box.nz = k - zi;
                        }
                    }
                }
            }

            if (box.nx === 0) box.nx = 1;
            if (box.ny === 0) box.ny = 1;
            if (box.nz === 0) box.nz = 1;

            // Set the merged boxes as boxified
            for (let i = xi; i < xi + box.nx; i++) {
                for (let j = yi; j < yi + box.ny; j++) {
                    for (let k = zi; k < zi + box.nz; k++) {
                        if (i >= xi && i <= xi + box.nx
                            && j >= yi && j <= yi + box.ny
                            && k >= zi && k <= zi + box.nz) {
                            setBlockified(i, j, k, true);
                        }
                    }
                }
            }

            box = false;
        } else {
            break;
        }
    }

    // Set box positions
    for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        b.position.set(
            (b.xi + b.nx * 0.5) - 0.5,
            (b.yi + b.ny * 0.5) - 0.5,
            (b.zi + b.nz * 0.5) - 0.5
        );
        b.addShape(new CANNON.Box(new CANNON.Vec3(b.nx * 0.5, b.ny * 0.5, b.nz * 0.5)));
        Physics.addBody(b);
    }
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

const renderWorldGeometry = () => {
    Shaders.geometry.bind();

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
    Shaders.entityShadows.setVec3('shadowAmbient', shadowAmbient);

    const meshEntities = getEntities(EntityTypes.MESH);
    meshEntities.forEach((entity) => {
        entity.renderShadow();
    });

    Shader.unBind();
};

const renderLighting = () => {
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
    gl.cullFace(gl.FRONT);
    Shaders.pointLight.bind();
    Shaders.pointLight.setMat4('matViewProj', Camera.viewProjection);
    Shaders.pointLight.setInt('positionBuffer', 0);
    Shaders.pointLight.setInt('normalBuffer', 1);
    Shaders.pointLight.setInt('shadowBuffer', 2);

    // instanced
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

    skyBoxId = world.skybox;
    ambient = world.ambient;
    spawnPoint = world.spawnpoint;
    mainLight = world.mainlight;

    for (let i = 0; i < world.data.length - 1; i += 2) {
        blocks[world.data[i]] = world.data[i + 1];
    }
    Loading.update(1, 2);

    prepare();
    Loading.update(2, 2);
    Loading.toggle(false);
    Console.log(`Loaded: ${name}`);
};

const save = (name) => {
    const data = [];
    blocks.forEach((block, i) => {
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
    getAmbient,
    renderWorldGeometry,
    renderLighting,
    renderShadows,
    renderFPSGeometry
};

export { World as default };
