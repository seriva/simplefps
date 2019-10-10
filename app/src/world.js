import prettyJsonStringify from './libs/pretty-json-stringify/index.js';
import { mat4 } from './libs/gl-matrix.js';
import { gl } from './context.js';
import Camera from './camera.js';
import Resources from './resources.js';
import Entity from './entity.js';
import { Shaders } from './shaders.js';
import Skybox from './skybox.js';
import Console from './console.js';
import Utils from './utils.js';

const cube = Resources.get('meshes/cube.mesh');

const typeMap = new Map();
typeMap.set(1, 'mat_world_tiles');
typeMap.set(2, 'mat_world_concrete');
typeMap.set(3, 'mat_world_concrete_spot');
typeMap.set(128, 'meshes/health.mesh');
typeMap.set(129, 'meshes/armor.mesh');
typeMap.set(130, 'meshes/ammo.mesh');

const dimension = 256;
let skyBoxId = 1;
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
};

const prepare = () => {
    // set skydome
    Skybox.set(skyBoxId);

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
            buffer.data = buffer.data.concat(to3D(i));
            buffer.count++;
        } else if (block >= 128) {
            entities.push(new Entity(to3D(i), typeMap.get(block)));
        }
    });

    buffers.forEach((value) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, value.id);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(value.data), gl.STATIC_DRAW);
        value.data = [];
    });
};

const update = () => {
    const m = mat4.create();
    mat4.fromRotation(m, performance.now() / 1000, [0, 1, 0]);
    mat4.translate(m, m, [0, (Math.cos(Math.PI * (performance.now() / 1000)) * 0.15), 0]);
    entities.forEach((entity) => {
        entity.update(m);
    });
};

const render = () => {
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

    entities.forEach((entity) => {
        entity.render();
    });
};

const load = async (path) => {
    clear();

    const response = await Utils.fetch(path);
    const world = JSON.parse(response);

    skyBoxId = world.skybox;
    for (let i = 0; i < world.data.length - 1; i += 2) {
        blockData[world.data[i]] = world.data[i + 1];
    }

    prepare();
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
        data
    }, {
        spaceAfterComma: '',
        shouldExpand: (object, level, key) => {
            if (key === 'data') return false;
            return true;
        }
    }),
    name, 'application/json');
};
Console.registerCmd('saveworld', save);

// Leave this for now since we cant edit maps jet.
/*
const test = () => {
    clear();
    for (let i = 0; i <= 12; i++) {
        for (let j = 0; j <= 12; j++) {
            blockData[to1D(i, 0, j)] = 1;
            blockData[to1D(i, 4, j)] = 1;
        }
    }
    for (let i = 0; i <= 12; i += 3) {
        for (let j = 0; j <= 12; j += 3) {
            if (i === 6 && j === 6) {
                continue;
            }
            for (let k = 1; k <= 3; k++) {
                if (k === 1) {
                    blockData[to1D(i, k, j)] = 3;
                } else {
                    blockData[to1D(i, k, j)] = 2;
                }
            }
        }
    }
    blockData[to1D(5, 1, 6)] = 129;
    blockData[to1D(6, 1, 6)] = 128;
    blockData[to1D(7, 1, 6)] = 130;
    prepare();
};
test();
*/

const World = {
    load,
    update,
    render
};

export { World as default };
