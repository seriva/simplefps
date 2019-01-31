import Renderer from './renderer';

const gl = Renderer.gl;

class Mesh {
    constructor(data, resources) {
        const m = this;
        m.resources = resources;

        const vertices = [];
        const normals = [];
        const uvs = [];
        const unpacked = {};
        unpacked.vertices = [];
        unpacked.normals = [];
        unpacked.uvs = [];
        unpacked.hashindices = {};
        unpacked.indices = [];
        unpacked.index = 0;
        const lines = data.split('\n');
        let curIndexArray = 0;

        const VERTEX_RE = /^v\s/;
        const NORMAL_RE = /^vn\s/;
        const TEXTURE_RE = /^vt\s/;
        const FACE_RE = /^f\s/;
        const MAT_RE = /^material\s/;

        const WHITESPACE_RE = /\s+/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const elements = line.split(WHITESPACE_RE);
            elements.shift();

            if (VERTEX_RE.test(line)) {
                vertices.push.apply(vertices, elements);
            } else if (MAT_RE.test(line)) {
                const material = line.match(/(?:"[^"]*"|^[^"]*$)/)[0].replace(/"/g, '');
                if (material !== 'none') {
                    m.resources.load(material);
                }
                unpacked.indices.push({
                    material,
                    array: []
                });
                curIndexArray = unpacked.indices.length - 1;
            } else if (NORMAL_RE.test(line)) {
                normals.push.apply(normals, elements);
            } else if (TEXTURE_RE.test(line)) {
                uvs.push.apply(uvs, elements);
            } else if (FACE_RE.test(line)) {
                let quad = false;
                for (let j = 0, eleLen = elements.length; j < eleLen; j++) {
                    if (j === 3 && !quad) {
                        j = 2;
                        quad = true;
                    }
                    if (elements[j] in unpacked.hashindices) {
                        unpacked.indices[curIndexArray].array.push(
                            unpacked.hashindices[elements[j]]
                        );
                    } else {
                        const vertex = elements[j].split('/');
                        // vertex position
                        unpacked.vertices.push(+vertices[(vertex[0] - 1) * 3 + 0]);
                        unpacked.vertices.push(+vertices[(vertex[0] - 1) * 3 + 1]);
                        unpacked.vertices.push(+vertices[(vertex[0] - 1) * 3 + 2]);
                        // vertex textures
                        if (uvs.length) {
                            unpacked.uvs.push(+uvs[(vertex[1] - 1) * 2 + 0]);
                            unpacked.uvs.push(+uvs[(vertex[1] - 1) * 2 + 1]);
                        }
                        // vertex normals
                        unpacked.normals.push(+normals[(vertex[2] - 1) * 3 + 0]);
                        unpacked.normals.push(+normals[(vertex[2] - 1) * 3 + 1]);
                        unpacked.normals.push(+normals[(vertex[2] - 1) * 3 + 2]);
                        // add the newly created vertex to the list of indices
                        unpacked.hashindices[elements[j]] = unpacked.index;
                        unpacked.indices[curIndexArray].array.push(unpacked.index);
                        // increment the counter
                        unpacked.index += 1;
                    }
                    if (j === 3 && quad) {
                        // add v0/t0/vn0 onto the second triangle
                        unpacked.indices[curIndexArray].array.push(
                            unpacked.hashindices[elements[0]]
                        );
                    }
                }
            }
        }

        m.indices = unpacked.indices;
        m.vertices = unpacked.vertices;
        if (unpacked.uvs.length > 0) {
            m.uvs = unpacked.uvs;
        }
        if (unpacked.normals.length > 0) {
            m.normals = unpacked.normals;
        }
        m.initMeshBuffers();
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

    render() {
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

        m.indices.forEach((indexObj) => {
            if (indexObj.material !== 'none') {
                const mat = m.resources.get(indexObj.material);
                mat.bind(gl.TEXTURE0);
            }
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
            gl.drawElements(gl.TRIANGLES, indexObj.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
        });

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
}

export { Mesh as default };
