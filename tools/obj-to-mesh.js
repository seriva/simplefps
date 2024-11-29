#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import prettyJSONStringify from 'pretty-json-stringify';

const PATTERNS = Object.freeze({
    VERTEX: /^v\s/,
    NORMAL: /^vn\s/,
    TEXTURE: /^vt\s/,
    FACE: /^f\s/,
    MATERIAL: /^usemtl\s/,
    WHITESPACE: /\s+/
});

// Pre-compile test functions for better performance
const testPatterns = Object.fromEntries(
    Object.entries(PATTERNS).map(([key, regex]) => [key, line => regex.test(line)])
);

// Use TypedArrays for better memory efficiency and performance
const createBuffer = size => new Float32Array(size);

const processFaceElement = (element, unpacked, vertices, uvs, normals, curIndexArray) => {
    if (element in unpacked.hashindices) {
        unpacked.indices[curIndexArray].array.push(unpacked.hashindices[element]);
        return;
    }

    const [vertexIndex, uvIndex, normalIndex] = element.split('/').map(n => n | 0); // Faster than Number()
    const vertexOffset = (vertexIndex - 1) * 3;
    const uvOffset = (uvIndex - 1) * 2;
    const normalOffset = (normalIndex - 1) * 3;

    // Unroll loops for better performance
    unpacked.vertices[unpacked.vertexCount++] = vertices[vertexOffset];
    unpacked.vertices[unpacked.vertexCount++] = vertices[vertexOffset + 1];
    unpacked.vertices[unpacked.vertexCount++] = vertices[vertexOffset + 2];

    if (uvs.length) {
        unpacked.uvs[unpacked.uvCount++] = uvs[uvOffset];
        unpacked.uvs[unpacked.uvCount++] = uvs[uvOffset + 1];
    }

    unpacked.normals[unpacked.normalCount++] = normals[normalOffset];
    unpacked.normals[unpacked.normalCount++] = normals[normalOffset + 1];
    unpacked.normals[unpacked.normalCount++] = normals[normalOffset + 2];

    unpacked.hashindices[element] = unpacked.index;
    unpacked.indices[curIndexArray].array.push(unpacked.index);
    unpacked.index += 1;
};

const convertObjToMesh = () => {
    const [,, input] = process.argv;

    if (!input) {
        throw new Error('Invalid input parameter');
    }

    console.log('Input: ', input);
    const output = `${path.basename(input, '.obj')}.mesh`;
    console.log('Output: ', output);

    // Read file content at once and split into lines
    const data = fs.readFileSync(input, 'utf8').split('\n');

    // Pre-allocate arrays based on file size for better memory efficiency
    const estimatedSize = Math.ceil(data.length * 0.4); // Rough estimate
    const vertices = createBuffer(estimatedSize * 3);
    const normals = createBuffer(estimatedSize * 3);
    const uvs = createBuffer(estimatedSize * 2);

    const unpacked = {
        vertices: createBuffer(estimatedSize * 3),
        normals: createBuffer(estimatedSize * 3),
        uvs: createBuffer(estimatedSize * 2),
        vertexCount: 0,
        normalCount: 0,
        uvCount: 0,
        hashindices: Object.create(null), // Faster than regular object
        indices: [],
        index: 0
    };

    let curIndexArray = 0;
    let vertexCount = 0;
    let normalCount = 0;
    let uvCount = 0;

    // Process lines
    for (const line of data) {
        if (!line.trim()) continue;

        const elements = line.split(PATTERNS.WHITESPACE);
        const firstChar = elements[0];
        elements.shift();

        if (firstChar === 'v') {
            vertices[vertexCount++] = +elements[0];
            vertices[vertexCount++] = +elements[1];
            vertices[vertexCount++] = +elements[2];
        } else if (firstChar === 'vn') {
            normals[normalCount++] = +elements[0];
            normals[normalCount++] = +elements[1];
            normals[normalCount++] = +elements[2];
        } else if (firstChar === 'vt') {
            uvs[uvCount++] = +elements[0];
            uvs[uvCount++] = +elements[1];
        } else if (firstChar === 'f') {
            elements.forEach(element =>
                processFaceElement(element, unpacked, vertices, uvs, normals, curIndexArray)
            );
        } else if (testPatterns.MATERIAL(line)) {
            const [, material] = line.split(' ');
            unpacked.indices.push({ material, array: [] });
            curIndexArray = unpacked.indices.length - 1;
        }
    }

    // Trim arrays to actual size
    const mesh = {
        indices: unpacked.indices,
        vertices: Array.from(unpacked.vertices.slice(0, unpacked.vertexCount)),
        uvs: uvCount ? Array.from(unpacked.uvs.slice(0, unpacked.uvCount)) : [],
        normals: normalCount ? Array.from(unpacked.normals.slice(0, unpacked.normalCount)) : []
    };

    fs.writeFileSync(output, prettyJSONStringify(mesh, {
        spaceAfterComma: '',
        shouldExpand: (object, level, key) =>
            key === 'indices' || (!['array', 'vertices', 'uvs', 'normals'].includes(key))
    }));
};

try {
    convertObjToMesh();
} catch (error) {
    console.error(error);
}
