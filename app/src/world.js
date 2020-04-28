import prettyJsonStringify from './libs/pretty-json-stringify/index.js';
import { mat4 } from './libs/gl-matrix.js';
import { gl, Context } from './context.js';
import Camera from './camera.js';
import Resources from './resources.js';
import MeshEntity from './meshentity.js';
import PointlightEntity from './pointlightentity.js';
import { Shaders, Shader } from './shaders.js';
import Skybox from './skybox.js';
import Console from './console.js';
import Utils from './utils.js';
import { EntityTypes } from './entity.js';
import Loading from './loading.js';
import Physics from './physics.js';
import CANNON from './libs/cannon/build/cannon.js';

const quad = Resources.get('system/quad.mesh');
const cube = Resources.get('meshes/cube.mesh');

let pauseUpdate = false;
const typeMap = new Map();
typeMap.set(1, 'mat_world_tiles');
typeMap.set(2, 'mat_world_concrete');
typeMap.set(128, 'meshes/health.mesh');
typeMap.set(129, 'meshes/armor.mesh');
typeMap.set(130, 'meshes/ammo.mesh');

const dimension = 256;
let skyBoxId = 1;
let ambient = [0.5, 0.475, 0.5];
let spawnPoint = {
    position: [0, 0, 0],
    rotation: [0, 0, 0]
};
let dirLight = {
    direction: [-3.0, 3.0, -5.0],
    color: [0.65, 0.625, 0.65],
};

const blockData = new Uint8Array(dimension * dimension * dimension);
const entities = [];
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

const updatePowerup = (entity, frameTime) => {
    entity.animationTime += frameTime / 1.75;
    mat4.identity(entity.ani_matrix);
    mat4.fromRotation(entity.ani_matrix, entity.animationTime / 1000, [0, 1, 0]);
    mat4.translate(entity.ani_matrix, entity.ani_matrix,
        [0, (Math.cos(Math.PI * (entity.animationTime / 1000)) * 0.15), 0]);
    mat4.copy(entity.light.ani_matrix, entity.ani_matrix);
    mat4.translate(entity.light.ani_matrix, entity.light.ani_matrix, [0, 0.15, 0]);
};

const updateBall = (entity) => {
    const q = entity.physicsBody.quaternion;
    const p = entity.physicsBody.position;
    mat4.fromRotationTranslation(
        entity.ani_matrix,
        [q.x, q.y, q.z, q.w],
        [p.x, p.y, p.z]
    );
    mat4.fromTranslation(
        entity.light.ani_matrix,
        [p.x, p.y, p.z]
    );
};
const ballShape = new CANNON.Sphere(0.165);
const createBall = () => {
    const shoot = Resources.get('sounds/shoot.sfx');
    shoot.play();
    const p = Camera.position;
    const d = Camera.direction;
    const ballEntity = new MeshEntity([0, 0, 0], 'meshes/ball.mesh', updateBall);
    ballEntity.physicsBody = new CANNON.Body({ mass: 1 });
    ballEntity.physicsBody.position.set(p[0], p[1], p[2]);
    ballEntity.physicsBody.addShape(ballShape);
    Physics.addBody(ballEntity.physicsBody);
    entities.push(ballEntity);
    ballEntity.physicsBody.velocity.set(
        d[0] * 10,
        d[1] * 10,
        d[2] * 10
    );
    const light = new PointlightEntity([0, 0, 0], 2.5, [0.988, 0.31, 0.051], 1.5);
    ballEntity.light = light;
    entities.push(light);
};
window.addEventListener('click', (e) => {
    Console.log(e);
    if (e.button > 0) return;
    if ((e.target.tagName.toUpperCase() !== 'BODY') && !Utils.isMobile()) return;
    if ((e.target.id !== 'look') && Utils.isMobile()) return;
    createBall();
});


const prepare = () => {
    gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);

    // set skydome
    Skybox.set(skyBoxId);

    // spawnpoint
    Camera.setPosition(spawnPoint.position);
    Camera.setRotation(spawnPoint.rotation);

    // prepare map data and entities
    blockData.forEach((block, i) => {
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
            buffer.data = buffer.data.concat(pos);
            Physics.addWorldCube(pos[0], pos[1], pos[2]);
            buffer.count++;
        } else if (block >= 128) {
            const powerup = new MeshEntity(to3D(i), typeMap.get(block), updatePowerup);
            entities.push(powerup);
            switch (block) {
            case 128:
                powerup.light = new PointlightEntity(to3D(i), 1.2, [0.752, 0, 0.035], 1.25);
                break;
            case 129:
                powerup.light = new PointlightEntity(to3D(i), 1.2, [0, 0.352, 0.662], 1.25);
                break;
            case 130:
                powerup.light = new PointlightEntity(to3D(i), 1.2, [0.623, 0.486, 0.133], 1.25);
                break;
            default:
                  // code block
            }
            entities.push(powerup);
            entities.push(powerup.light);
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

    const meshEntities = entities.filter((entity) => entity.type === EntityTypes.MESH);
    meshEntities.forEach((entity) => {
        entity.render();
    });
};

const renderLights = () => {
    // directionallight
    Shaders.directionalLight.bind();
    Shaders.directionalLight.setInt('positionBuffer', 0);
    Shaders.directionalLight.setInt('normalBuffer', 1);
    Shaders.directionalLight.setVec3('directionalLight.direction', dirLight.direction);
    Shaders.directionalLight.setVec3('directionalLight.color', dirLight.color);
    Shaders.directionalLight.setVec2('viewportSize', [Context.width(), Context.height()]);
    quad.renderSingle();
    Shader.unBind();

    // pointlights
    Shaders.pointLight.bind();
    Shaders.pointLight.setMat4('matViewProj', Camera.viewProjection);
    Shaders.pointLight.setInt('positionBuffer', 0);
    Shaders.pointLight.setInt('normalBuffer', 1);
    const pointLightEntities = entities.filter((entity) => entity.type === EntityTypes.POINTLIGHT);
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
    dirLight = world.lights.directional;

    for (let i = 0; i < world.data.length - 1; i += 2) {
        blockData[world.data[i]] = world.data[i + 1];
    }

    world.lights.pointlights.forEach((pl) => {
        entities.push(new PointlightEntity(pl.position, pl.size, pl.color, pl.intensity));
    });
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

    const pointLights = [];
    const pointLightEntities = entities.filter((entity) => entity.type === EntityTypes.POINTLIGHT);
    pointLightEntities.forEach((entity) => {
        pointLights.push({
            position: entity.position,
            size: entity.size,
            color: entity.color,
            intensity: entity.intensity
        });
    });

    Utils.download(prettyJsonStringify({
        skybox: skyBoxId,
        spawnpoint: spawnPoint,
        ambient,
        lights: {
            directional: dirLight,
            pointlights: pointLights
        },
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
    renderGeometry,
    renderLights
};

export { World as default };
