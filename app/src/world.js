import { gl } from './context.js';
import { mat4 } from './libs/gl-matrix.js';
import Camera from './camera.js';
import Resources from './resources.js';
import Entity from './entity.js';
import { Shaders } from './shaders.js';

const cube = Resources.get('meshes/cube.mesh');
const detail = Resources.get('textures/detail1.jpg');

const typeMap = new Map();
typeMap.set(1, 'meshes/tiles.jpg');
typeMap.set(2, 'meshes/concrete.jpg');
typeMap.set(128, 'meshes/health.mesh');
typeMap.set(129, 'meshes/armor.mesh');
typeMap.set(130, 'meshes/ammo.mesh');

const dimension = 256;
const mapData = new Uint8Array(dimension * dimension * dimension);
const entities = [];
const buffers = new Map();

const to1D = (x, y, z) => (z * dimension * dimension) + (y * dimension) + x;
const to3D = (i) => {
    const x = Math.floor(i % dimension);
    const y = Math.floor((i / dimension) % dimension);
    const z = Math.floor(i / (dimension * dimension));
    return [x, y, z];
};

const clear = () => {
    mapData.fill(0);
    entities.length = 0;
    buffers.forEach((value) => {
        gl.deleteBuffer(value.id);
    });
    buffers.clear();
};

const prepare = () => {
    for (let i = 0; i < mapData.length; i++) {
        if (mapData[i] >= 1 && mapData[i] < 128) {
            if (!buffers.has(mapData[i])) {
                buffers.set(mapData[i], {
                    id: gl.createBuffer(),
                    count: 0,
                    data: []
                });
            }
            const buffer = buffers.get(mapData[i]);
            buffer.data = buffer.data.concat(to3D(i));
            buffer.count++;
        } else if (mapData[i] >= 128) {
            entities.push(new Entity(to3D(i), typeMap.get(mapData[i])));
        }
    }

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
    const matModel = mat4.create();
    mat4.identity(matModel);

    Shaders.geometry.setInt('colorSampler', 0);
    Shaders.geometry.setInt('detailSampler', 1);
    Shaders.geometry.setInt('geomType', 2);
    Shaders.geometry.setInt('doDetail', 1);
    Shaders.geometry.setFloat('detailMult', 0.85);
    Shaders.geometry.setFloat('detailUVMult', 3);
    Shaders.geometry.setMat4('matViewProj', Camera.viewProjection);
    Shaders.geometry.setMat4('matWorld', matModel);
    detail.bind(gl.TEXTURE1);

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

    Shaders.geometry.setInt('doDetail', 0);
    entities.forEach((entity) => {
        entity.render();
    });
};

const test = () => {
    clear();
    for (let i = 0; i <= 12; i++) {
        for (let j = 0; j <= 12; j++) {
            mapData[to1D(i, 0, j)] = 1;
            mapData[to1D(i, 4, j)] = 1;
        }
    }
    for (let i = 0; i <= 12; i += 3) {
        for (let j = 0; j <= 12; j += 3) {
            if (i === 6 && j === 6) {
                continue;
            }
            for (let k = 1; k <= 3; k++) {
                mapData[to1D(i, k, j)] = 2;
            }
        }
    }
    mapData[to1D(5, 1, 6)] = 129;
    mapData[to1D(6, 1, 6)] = 128;
    mapData[to1D(7, 1, 6)] = 130;
    prepare();
};

test();

const World = {
    update,
    render
};

export { World as default };
