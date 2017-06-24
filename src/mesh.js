import Utils from './utils';
import Renderer from './renderer';

const gl = Renderer.gl;

class Mesh {
    constructor(path, onSuccess, onError) {
        const m = this;
        const p = path;

        Utils.loadData(p,
            (data) => {
                const verts = [];
                const vertNormals = [];
                const textures = [];
                const unpacked = {};
                unpacked.verts = [];
                unpacked.norms = [];
                unpacked.textures = [];
                unpacked.hashindices = {};
                unpacked.indices = [];
                unpacked.index = 0;
                const lines = data.split('\n');

                const VERTEX_RE = /^v\s/;
                const NORMAL_RE = /^vn\s/;
                const TEXTURE_RE = /^vt\s/;
                const FACE_RE = /^f\s/;
                const WHITESPACE_RE = /\s+/;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    const elements = line.split(WHITESPACE_RE);
                    elements.shift();

                    if (VERTEX_RE.test(line)) {
                        verts.push.apply(verts, elements);
                    } else if (NORMAL_RE.test(line)) {
                        vertNormals.push.apply(vertNormals, elements);
                    } else if (TEXTURE_RE.test(line)) {
                        textures.push.apply(textures, elements);
                    } else if (FACE_RE.test(line)) {
                        let quad = false;
                        for (let j = 0, eleLen = elements.length; j < eleLen; j++) {
                            if (j === 3 && !quad) {
                                j = 2;
                                quad = true;
                            }
                            if (elements[j] in unpacked.hashindices) {
                                unpacked.indices.push(unpacked.hashindices[elements[j]]);
                            } else {
                                const vertex = elements[j].split('/');
                                // vertex position
                                unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                                unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                                unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);
                                // vertex textures
                                if (textures.length) {
                                    unpacked.textures.push(+textures[(vertex[1] - 1) * 2 + 0]);
                                    unpacked.textures.push(+textures[(vertex[1] - 1) * 2 + 1]);
                                }
                                // vertex normals
                                unpacked.norms.push(+vertNormals[(vertex[2] - 1) * 3 + 0]);
                                unpacked.norms.push(+vertNormals[(vertex[2] - 1) * 3 + 1]);
                                unpacked.norms.push(+vertNormals[(vertex[2] - 1) * 3 + 2]);
                                // add the newly created vertex to the list of indices
                                unpacked.hashindices[elements[j]] = unpacked.index;
                                unpacked.indices.push(unpacked.index);
                                // increment the counter
                                unpacked.index += 1;
                            }
                            if (j === 3 && quad) {
                                // add v0/t0/vn0 onto the second triangle
                                unpacked.indices.push(unpacked.hashindices[elements[0]]);
                            }
                        }
                    }
                }
                m.vertices = unpacked.verts;
                m.vertexNormals = unpacked.norms;
                m.textures = unpacked.textures;
                m.indices = unpacked.indices;

                m.initMeshBuffers();

                onSuccess(p);
            },
            () => {
                onError(p);
            }
        );
    }

    buildBuffer(type, data, itemSize) {
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
        m.normalBuffer = m.buildBuffer(gl.ARRAY_BUFFER, m.vertexNormals, 3);
        m.textureBuffer = m.buildBuffer(gl.ARRAY_BUFFER, m.textures, 2);
        m.vertexBuffer = m.buildBuffer(gl.ARRAY_BUFFER, m.vertices, 3);
        m.indexBuffer = m.buildBuffer(gl.ELEMENT_ARRAY_BUFFER, m.indices, 1);
    }

    deleteMeshBuffers() {
        const m = this;
        gl.deleteBuffer(m.normalBuffer);
        gl.deleteBuffer(m.textureBuffer);
        gl.deleteBuffer(m.vertexBuffer);
        gl.deleteBuffer(m.indexBuffer);
    }

    render() {
        const m = this;

        gl.bindBuffer(gl.ARRAY_BUFFER, m.vertexBuffer);
        gl.vertexAttribPointer(0, m.vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindBuffer(gl.ARRAY_BUFFER, m.textureBuffer);
        gl.vertexAttribPointer(1, m.textureBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);

        gl.bindBuffer(gl.ARRAY_BUFFER, m.normalBuffer);
        gl.vertexAttribPointer(2, m.normalBuffer.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(2);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.indexBuffer);

        gl.drawElements(gl.TRIANGLES, m.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
}

export { Mesh as default };
