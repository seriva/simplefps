import { gl } from './context.js';

class Mesh {
    constructor(data, resources) {
        const m = this;

        m.resources = resources;
        m.indices = data.indices;
        m.vertices = data.vertices;
        m.uvs = [];
        if (data.uvs && data.uvs.length > 0) {
            m.uvs = data.uvs;
        }
        m.normals = [];
        if (data.normals && data.normals.length > 0) {
            m.normals = data.normals;
        }
        m.initMeshBuffers();

        m.indices.forEach((indice) => {
            if (indice.material !== 'none') {
                resources.load(indice.material);
            }
        });
    }

    static buildBuffer(type, data, itemSize) {
        const buffer = gl.createBuffer();
        const arrayView = type === gl.ARRAY_BUFFER ? Float32Array : Uint16Array;
        gl.bindBuffer(type, buffer);
        gl.bufferData(type, new arrayView(data), gl.STATIC_DRAW);
        buffer.itemSize = itemSize;
        buffer.numItems = data.length / itemSize;
        return buffer;
    }

    initMeshBuffers() {
        const m = this;
        m.indices.forEach((indexObj) => {
            indexObj.indexBuffer = Mesh.buildBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.array, 1);
        });
        m.vertexBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, m.vertices, 3);
        if (m.uvs.length > 0) {
            m.uvBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, m.uvs, 2);
        }
        if (m.normals.length > 0) {
            m.normalBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, m.normals, 3);
        }
    }

    deleteMeshBuffers() {
        const m = this;
        m.indices.forEach((indexObj) => {
            gl.deleteBuffer(indexObj.indexBuffer);
        });
        gl.deleteBuffer(m.vertexBuffer);
        if (m.uvs.length > 0) {
            gl.deleteBuffer(m.uvBuffer);
        }
        if (m.normals.length > 0) {
            gl.deleteBuffer(m.normalBuffer);
        }
    }

    bind() {
        const m = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, m.vertexBuffer);
        gl.vertexAttribPointer(0, m.vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        if (m.uvs.length > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, m.uvBuffer);
            gl.vertexAttribPointer(1, m.uvBuffer.itemSize, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(1);
        }
        if (m.normals.length > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, m.normalBuffer);
            gl.vertexAttribPointer(2, m.normalBuffer.itemSize, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(2);
        }
    }

    unBind() {
        const m = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.disableVertexAttribArray(0);
        if (m.uvs.length > 0) {
            gl.disableVertexAttribArray(1);
        }
        if (m.normals.length > 0) {
            gl.disableVertexAttribArray(2);
        }
    }

    renderSingle() {
        const m = this;

        m.bind();

        m.indices.forEach((indexObj) => {
            if (indexObj.material !== 'none') {
                const mat = m.resources.get(indexObj.material);
                mat.bind(gl.TEXTURE0);
            }
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
            gl.drawElements(gl.TRIANGLES, indexObj.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
        });

        m.unBind();
    }

    renderMany() {
        const m = this;

        m.indices.forEach((indexObj) => {
            if (indexObj.material !== 'none') {
                const mat = m.resources.get(indexObj.material);
                mat.bind(gl.TEXTURE0);
            }
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
            gl.drawElements(gl.TRIANGLES, indexObj.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
        });
    }
}

export { Mesh as default };
