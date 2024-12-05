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

const processFaceElement = (element, mesh, vertices, uvs, normals) => {
    if (element in mesh.hashindices) {
        if (!mesh.indices[0]) {
            mesh.indices[0] = { material: 'default', array: [] };
        }
        mesh.indices[0].array.push(mesh.hashindices[element]);
        return;
    }

    const [vertexIndex, uvIndex, normalIndex] = element.split('/').map(n => n | 0);
    const vertexOffset = (vertexIndex - 1) * 3;
    const uvOffset = (uvIndex - 1) * 2;
    const normalOffset = (normalIndex - 1) * 3;

    // Add vertex data
    mesh.vertices[mesh.vertexCount++] = vertices[vertexOffset];
    mesh.vertices[mesh.vertexCount++] = vertices[vertexOffset + 1];
    mesh.vertices[mesh.vertexCount++] = vertices[vertexOffset + 2];

    if (uvs.length && uvIndex) {
        mesh.uvs[mesh.uvCount++] = uvs[uvOffset];
        mesh.uvs[mesh.uvCount++] = uvs[uvOffset + 1];
    }

    if (normalIndex) {
        mesh.normals[mesh.normalCount++] = normals[normalOffset];
        mesh.normals[mesh.normalCount++] = normals[normalOffset + 1];
        mesh.normals[mesh.normalCount++] = normals[normalOffset + 2];
    }

    mesh.hashindices[element] = mesh.index;
    if (!mesh.indices[0]) {
        mesh.indices[0] = { material: 'default', array: [] };
    }
    mesh.indices[0].array.push(mesh.index);
    mesh.index += 1;
};

const convertObjToMesh = () => {
    const [,, input] = process.argv;

    if (!input) {
        throw new Error('Invalid input parameter');
    }

    console.log('Input: ', input);
    const baseOutputName = path.basename(input, '.obj');
    console.log('Base output name: ', baseOutputName);

    // Read file content at once and split into lines
    const data = fs.readFileSync(input, 'utf8').split('\n');

    // Pre-allocate arrays based on file size for better memory efficiency
    const estimatedSize = Math.ceil(data.length * 0.4); // Rough estimate
    const vertices = createBuffer(estimatedSize * 3);
    const normals = createBuffer(estimatedSize * 3);
    const uvs = createBuffer(estimatedSize * 2);

    const meshes = [];
    const meshNames = [];
    let currentMesh = createNewMesh(estimatedSize);
    let currentGroupName = 'default';

    let vertexCount = 0;
    let normalCount = 0;
    let uvCount = 0;

    // Process lines
    for (const line of data) {
        if (!line.trim()) continue;

        const elements = line.split(PATTERNS.WHITESPACE);
        const firstChar = elements[0];
        elements.shift();

        if (firstChar === 'g') {
            if (currentMesh.indices.length > 0) {
                const meshName = saveMesh(currentMesh, baseOutputName, currentGroupName);
                meshNames.push(meshName);
                meshes.push(currentMesh);
            }
            currentGroupName = elements[0] || `group_${meshes.length}`;
            currentMesh = createNewMesh(estimatedSize);
        } else if (firstChar === 'v') {
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
                processFaceElement(element, currentMesh, vertices, uvs, normals)
            );
        } else if (testPatterns.MATERIAL(line)) {
            const [, material] = line.split(' ');
            currentMesh.indices.push({ material, array: [] });
        }
    }

    // Save the last mesh if it has data
    if (currentMesh.indices.length > 0) {
        const meshName = saveMesh(currentMesh, baseOutputName, currentGroupName);
        meshNames.push(meshName);
        meshes.push(currentMesh);
    }

    // Save the list of mesh names to a text file
    const meshListFile = `${baseOutputName}_mesh_list.txt`;
    const formattedList = meshNames
        .map((name, index) => 
            index === meshNames.length - 1 ? name : `${name},`)
        .join('\n');
    fs.writeFileSync(meshListFile, formattedList);
    console.log(`Mesh list saved to: ${meshListFile}`);

    console.log(`Successfully created ${meshes.length} mesh files`);
};

const createNewMesh = (estimatedSize) => ({
    indices: [],
    vertices: createBuffer(estimatedSize * 3),
    normals: createBuffer(estimatedSize * 3),
    uvs: createBuffer(estimatedSize * 2),
    vertexCount: 0,
    normalCount: 0,
    uvCount: 0,
    hashindices: Object.create(null),
    index: 0
});

const saveMesh = (mesh, baseOutputName, groupName) => {
    // Trim arrays to actual size
    const finalMesh = {
        indices: mesh.indices,
        vertices: Array.from(mesh.vertices.slice(0, mesh.vertexCount)),
        uvs: mesh.uvCount ? Array.from(mesh.uvs.slice(0, mesh.uvCount)) : [],
        normals: mesh.normalCount ? Array.from(mesh.normals.slice(0, mesh.normalCount)) : []
    };

    // Sanitize group name and remove "_Mesh" suffix if present
    let sanitizedGroupName = groupName.replace(/[^a-zA-Z0-9-_]/g, '_');
    sanitizedGroupName = sanitizedGroupName.replace(/_Mesh$/, '');
    const output = `${sanitizedGroupName}.mesh`;
    
    console.log(`Saving mesh: ${output}`);
    
    fs.writeFileSync(output, prettyJSONStringify(finalMesh, {
        spaceAfterComma: '',
        shouldExpand: (object, level, key) =>
            key === 'indices' || (!['array', 'vertices', 'uvs', 'normals'].includes(key))
    }));

    return output;
};

try {
    convertObjToMesh();
} catch (error) {
    console.error(error);
}
