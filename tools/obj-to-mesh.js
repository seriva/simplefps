const fs = require('fs');
const path = require('path');

try {
    if (!process.argv[2]) {
        throw new Error('Invalid input parameter');
    }

    const input = process.argv[2];
    console.log('Input: ', input);

    const output = `${path.basename(input, '.obj')}.mesh`;
    console.log('Output: ', output);

    const VERTEX_RE = /^v\s/;
    const NORMAL_RE = /^vn\s/;
    const TEXTURE_RE = /^vt\s/;
    const FACE_RE = /^f\s/;
    const MAT_RE = /^material\s/;
    const WHITESPACE_RE = /\s+/;

    const vertices = [];
    const normals = [];
    const uvs = [];
    const unpacked = {
        vertices: [],
        normals: [],
        uvs: [],
        hashindices: {},
        indices: [],
        index: 0
    };
    let curIndexArray = 0;

    const data = fs.readFileSync(input).toString().split('\n');
    data.forEach((line) => {
        const elements = line.split(WHITESPACE_RE);
        elements.shift();

        if (VERTEX_RE.test(line)) {
            vertices.push.apply(vertices, elements);
        } else if (MAT_RE.test(line)) {
            const material = line.match(/(?:"[^"]*"|^[^"]*$)/)[0].replace(/"/g, '');
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
            for (let j = 0, eleLen = elements.length; j < eleLen; j++) {
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
            }
        }
    });

    const mesh = {
        indices: unpacked.indices,
        vertices: unpacked.vertices,
        uvs: [],
        normals: []
    };

    if (unpacked.uvs.length > 0) {
        mesh.uvs = unpacked.uvs;
    }
    if (unpacked.normals.length > 0) {
        mesh.normals = unpacked.normals;
    }

    fs.writeFileSync(output, JSON.stringify(mesh /*, null, 4 */ ));
} catch (e) {
    console.error(e);
}
