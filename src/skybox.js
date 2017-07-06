import { mat4 } from 'gl-matrix';
import Renderer from './renderer';
import Shaders from './shaders';
import Camera from './camera';
import Resources from './resources';

const gl = Renderer.gl;

const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
const vertices = [
    // Front face
    -1.0, -1.0, 1.0,
    1.0, -1.0, 1.0,
    1.0, 1.0, 1.0,
    -1.0, 1.0, 1.0,

    // Back face
    -1.0, -1.0, -1.0,
    -1.0, 1.0, -1.0,
    1.0, 1.0, -1.0,
    1.0, -1.0, -1.0,

    // Top face
    -1.0, 1.0, -1.0,
    -1.0, 1.0, 1.0,
    1.0, 1.0, 1.0,
    1.0, 1.0, -1.0,

    // Bottom face
    -1.0, -1.0, -1.0,
    1.0, -1.0, -1.0,
    1.0, -1.0, 1.0,
    -1.0, -1.0, 1.0,

    // Right face
    1.0, -1.0, -1.0,
    1.0, 1.0, -1.0,
    1.0, 1.0, 1.0,
    1.0, -1.0, 1.0,

    // Left face
    -1.0, -1.0, -1.0,
    -1.0, -1.0, 1.0,
    -1.0, 1.0, 1.0,
    -1.0, 1.0, -1.0,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
vertexBuffer.itemSize = 3;
vertexBuffer.numItems = 24;

const textureBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
const textures = [
    // Front face
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,

    // Back face
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,

    // Top face
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,

    // Bottom face
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,

    // Right face
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,

    // Left face
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textures), gl.STATIC_DRAW);
textureBuffer.itemSize = 2;
textureBuffer.numItems = 24;


const indicesArray = [
    [2, 1, 0, 3, 2, 0], // Front face
    [6, 5, 4, 7, 6, 4],  // Back face
    [10, 9, 8, 11, 10, 8], // Top face
    [14, 13, 12, 15, 14, 12], // Bottom face
    [18, 17, 16, 19, 18, 16], // Right face
    [22, 21, 20, 23, 22, 20]  // Left face
];
const indexBuffers = [];
indicesArray.forEach((indices) => {
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    indexBuffer.itemSize = 1;
    indexBuffer.numItems = 6;
    indexBuffers.push({ buffer: indexBuffer });
});

const matModel = mat4.create();
const matIdentity = mat4.create();
mat4.identity(matIdentity);
mat4.identity(matModel);

const Skydome = {
    initTextures(tex) {
        for (let i = 0; i < 6; i++) {
            indexBuffers[i].texture = Resources.get(tex[i]);
        }
    },

    render() {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        mat4.translate(matModel, matIdentity, Camera.position);
        Shaders.sky.bind();
        Shaders.sky.setMat4('matWorld', matModel);
        Shaders.sky.setMat4('matViewProj', Camera.viewProjection);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(0, vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
        gl.vertexAttribPointer(1, textureBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);

        indexBuffers.forEach((indexBuffer) => {
            indexBuffer.texture.bind(gl.TEXTURE0);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
            gl.drawElements(gl.TRIANGLES, indexBuffer.buffer.numItems, gl.UNSIGNED_SHORT, 0);
        });

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
    }
};

export { Skydome as default };
