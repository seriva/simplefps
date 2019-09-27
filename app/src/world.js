import { gl } from './context.js';
import { mat4 } from './libs/gl-matrix.js';
import Camera from './camera.js';
import Resources from './resources.js';
import Entity from './entity.js';
import { Shaders } from './shaders.js';

let cube = null;
let detail = null;

const dimension = 256;
const mapData = new Uint8Array(dimension * dimension * dimension);
const entities = [];
const offsetBuffer = gl.createBuffer();

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
};

const prepare = () => {
    let offsetData = [];
    for (let i = 0; i < mapData.length; i++) {
        if (mapData[i] === 1) {
            offsetData = offsetData.concat(to3D(i));
        } else if (mapData[i] === 128) {
            entities.push(new Entity(to3D(i), 'meshes/health.mesh'));
        }
    }
    offsetData = new Float32Array(offsetData);
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, offsetData, gl.STATIC_DRAW);
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

    if (cube === null) {
        cube = Resources.get('meshes/cube.mesh');
    }
    if (detail === null) {
        detail = Resources.get('textures/detail1.jpg');
    }

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
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribDivisor(3, 1);
    cube.renderMany(413);
    gl.vertexAttribDivisor(3, 0);
    gl.disableVertexAttribArray(3);
    cube.unBind();

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
                mapData[to1D(i, k, j)] = 1;
            }
        }
    }
    mapData[to1D(6, 1, 6)] = 128;
    prepare();
};

test();

const Map = {
    test,
    update,
    render
};

export { Map as default };
