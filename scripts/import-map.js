#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import prettyJSONStringify from 'pretty-json-stringify';

const MATERIAL_NAME_SIZE = 64;

const WHITESPACE = /\s+/;
const createBuffer = size => new Float32Array(size);

const processFaceElement = (element, mesh, vertices, uvs, normals, materialIndex) => {
    if (element in mesh.hashindices) {
        const idx = mesh.hashindices[element];
        if (materialIndex >= 0 && materialIndex < mesh.indices.length) {
            mesh.indices[materialIndex].array.push(idx);
        }
        return;
    }

    const parts = element.split('/');
    const vertexIndex = parts[0] | 0;
    const uvIndexStr = parts[1];
    const normalIndex = parts[2] | 0;
    
    const vertexOffset = (vertexIndex - 1) * 3;
    const normalOffset = (normalIndex - 1) * 3;

    if (vertexOffset < 0 || vertexOffset + 2 >= vertices.length) {
        console.warn(`Warning: Invalid vertex index ${vertexIndex}`);
        return;
    }
    mesh.vertices[mesh.vertexCount++] = vertices[vertexOffset];
    mesh.vertices[mesh.vertexCount++] = vertices[vertexOffset + 1];
    mesh.vertices[mesh.vertexCount++] = vertices[vertexOffset + 2];

    if (uvs.length && uvIndexStr && (uvIndexStr | 0) > 0) {
        const uvOffset = ((uvIndexStr | 0) - 1) * 2;
        mesh.uvs[mesh.uvCount++] = uvs[uvOffset];
        mesh.uvs[mesh.uvCount++] = uvs[uvOffset + 1];
    } else {
        mesh.uvs[mesh.uvCount++] = 0;
        mesh.uvs[mesh.uvCount++] = 0;
    }

    if (normalIndex > 0 && normalOffset >= 0 && normalOffset + 2 < normals.length) {
        mesh.normals[mesh.normalCount++] = normals[normalOffset];
        mesh.normals[mesh.normalCount++] = normals[normalOffset + 1];
        mesh.normals[mesh.normalCount++] = normals[normalOffset + 2];
    } else {
        mesh.normals[mesh.normalCount++] = 0;
        mesh.normals[mesh.normalCount++] = 1;
        mesh.normals[mesh.normalCount++] = 0;
    }

    const idx = mesh.index++;
    mesh.hashindices[element] = idx;
    if (materialIndex >= 0 && materialIndex < mesh.indices.length) {
        mesh.indices[materialIndex].array.push(idx);
    }
};

const processFace = (faceElements, mesh, vertices, uvs, normals, materialIndex) => {
    const elements = faceElements.filter(el => el.trim().length > 0);
    if (elements.length < 3) return;

    if (elements.length === 3) {
        processFaceElement(elements[0], mesh, vertices, uvs, normals, materialIndex);
        processFaceElement(elements[1], mesh, vertices, uvs, normals, materialIndex);
        processFaceElement(elements[2], mesh, vertices, uvs, normals, materialIndex);
        return;
    }

    const v0 = elements[0];
    for (let i = 1; i < elements.length - 1; i++) {
        processFaceElement(v0, mesh, vertices, uvs, normals, materialIndex);
        processFaceElement(elements[i], mesh, vertices, uvs, normals, materialIndex);
        processFaceElement(elements[i + 1], mesh, vertices, uvs, normals, materialIndex);
    }
};

const createNewMesh = (estimatedSize) => ({
    indices: [],
    vertices: createBuffer(Math.max(estimatedSize * 3, 10000)),
    normals: createBuffer(Math.max(estimatedSize * 3, 10000)),
    uvs: createBuffer(Math.max(estimatedSize * 2, 6667)),
    vertexCount: 0,
    normalCount: 0,
    uvCount: 0,
    hashindices: Object.create(null),
    index: 0,
    currentMaterialIndex: -1
});

const parseMTLFile = (mtlPath) => {
    const materials = [];
    if (!fs.existsSync(mtlPath)) {
        console.warn(`Warning: MTL file not found: ${mtlPath}`);
        return materials;
    }

    const data = fs.readFileSync(mtlPath, 'utf8').split('\n');
    let currentMaterial = null;

    for (const line of data) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const parts = trimmed.split(/\s+/);
        const command = parts[0];

        if (command === 'newmtl') {
            if (currentMaterial) {
                materials.push(currentMaterial);
            }
            currentMaterial = {
                name: parts[1] || 'default',
                textures: []
            };
        } else if (command === 'map_Kd' && currentMaterial) {
            const texturePath = parts.slice(1).join(' ');
            const textureName = path.basename(texturePath, path.extname(texturePath));
            currentMaterial.textures.push(textureName);
        }
    }

    if (currentMaterial) {
        materials.push(currentMaterial);
    }

    return materials;
};

const convertObjToMesh = (inputPath, outputMesh = false, outputBMesh = true, scale = 1.0) => {
    const inputDir = path.dirname(inputPath);
    const inputBase = path.basename(inputPath, '.obj');
    const arenaOutputDir = path.join(inputDir, inputBase);
    fs.mkdirSync(arenaOutputDir, { recursive: true });

    const objLines = fs.readFileSync(inputPath, 'utf8').split('\n');
    
    let materials = [];
    const materialNames = new Set();
    for (const line of objLines) {
        if (line.startsWith('mtllib ')) {
            materials = parseMTLFile(path.join(inputDir, line.slice(7).trim()));
            break;
        }
        if (line.startsWith('usemtl ')) {
            const matName = line.slice(7).trim();
            if (matName) materialNames.add(matName);
        }
    }
    if (materials.length === 0) {
        materials = Array.from(materialNames, name => ({ name, textures: [name] }));
    }

    const estimatedSize = Math.ceil(objLines.length * 0.6);
    const vertices = createBuffer(estimatedSize * 3);
    const normals = createBuffer(estimatedSize * 3);
    const uvs = createBuffer(estimatedSize * 2);

    const meshes = [];
    const meshNames = [];
    let currentMesh = createNewMesh(estimatedSize);
    let currentEntityName = null;
    const chunksDir = ensureChunksDir(arenaOutputDir);

    let vertexCount = 0;
    let normalCount = 0;
    let uvCount = 0;

    const extractEntityName = (name) => name.match(/^(.+?)_brush\d+$/)?.[1] || name;
    for (const line of objLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split(WHITESPACE);
        const firstChar = parts[0];
        const elements = parts.slice(1);

        if (firstChar === 'o') {
            const entityName = extractEntityName(elements[0] || '');
            if (currentEntityName !== null && entityName !== currentEntityName) {
                if (currentMesh.indices.length > 0 || currentMesh.vertexCount > 0) {
                    meshNames.push(saveMesh(currentMesh, currentEntityName, outputMesh, outputBMesh, chunksDir));
                    meshes.push(currentMesh);
                }
                currentMesh = createNewMesh(estimatedSize);
                currentMesh.currentMaterialIndex = -1;
            }
            currentEntityName = entityName;
        } else if (firstChar === 'g' && currentEntityName === null) {
            currentEntityName = elements[0] || `group_${meshes.length}`;
        } else if (firstChar === 'v') {
            vertices[vertexCount++] = (+elements[0]) * scale;
            vertices[vertexCount++] = (+elements[1]) * scale;
            vertices[vertexCount++] = (+elements[2]) * scale;
        } else if (firstChar === 'vn') {
            normals[normalCount++] = +elements[0];
            normals[normalCount++] = +elements[1];
            normals[normalCount++] = +elements[2];
        } else if (firstChar === 'vt') {
            uvs[uvCount++] = +elements[0];
            uvs[uvCount++] = 1.0 - (+elements[1]);
        } else if (firstChar === 'f') {
            if (currentMesh.currentMaterialIndex === -1) {
                currentMesh.indices.push({ material: 'default', array: [] });
                currentMesh.currentMaterialIndex = currentMesh.indices.length - 1;
            }
            processFace(elements, currentMesh, vertices, uvs, normals, currentMesh.currentMaterialIndex);
        } else if (firstChar === 'usemtl') {
            const material = elements[0]?.trim();
            if (material) {
                let idx = currentMesh.indices.findIndex(m => m.material === material);
                if (idx === -1) {
                    currentMesh.indices.push({ material, array: [] });
                    idx = currentMesh.indices.length - 1;
                }
                currentMesh.currentMaterialIndex = idx;
            }
        }
    }

    if (currentMesh.indices.length > 0 || currentMesh.vertexCount > 0) {
        meshNames.push(saveMesh(currentMesh, currentEntityName || 'default', outputMesh, outputBMesh, chunksDir));
        meshes.push(currentMesh);
    }

    if (meshes.length > 0) {
        createArenaStructure(arenaOutputDir, inputBase, meshNames, materials);
    }
    return meshes;
};

const ensureChunksDir = (arenaOutputDir) => {
    const chunksDir = path.join(arenaOutputDir, 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });
    return chunksDir;
};

const saveMesh = (mesh, groupName, outputMesh, outputBMesh, chunksDir) => {
    const finalMesh = {
        indices: mesh.indices.filter(m => m.array.length > 0),
        vertices: Array.from(mesh.vertices.slice(0, mesh.vertexCount)),
        uvs: mesh.uvCount ? Array.from(mesh.uvs.slice(0, mesh.uvCount)) : [],
        normals: mesh.normalCount ? Array.from(mesh.normals.slice(0, mesh.normalCount)) : []
    };

    const baseName = groupName.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/_Mesh$/, '');
    const relativePath = `chunks/${baseName}`;

    if (outputMesh) {
        fs.writeFileSync(path.join(chunksDir, `${baseName}.mesh`), prettyJSONStringify(finalMesh, {
            spaceAfterComma: '',
            shouldExpand: (o, l, k) => k === 'indices' || !['array', 'vertices', 'uvs', 'normals'].includes(k)
        }));
    }
    if (outputBMesh) {
        convertMeshToBMeshData(finalMesh, path.join(chunksDir, `${baseName}.bmesh`));
        return relativePath + '.bmesh';
    }
    return relativePath + '.mesh';
};

const createArenaStructure = (outputDir, arenaName, meshNames, materials) => {
    const matPath = path.join(outputDir, 'materials.mat');
    fs.writeFileSync(matPath, JSON.stringify({
        materials: materials.map(mat => ({
            name: mat.name,
            textures: mat.textures.map(tex => `${arenaName}/${tex}.webp`)
        }))
    }, null, 4));

    // Create config.arena file
    const configData = {
        skybox: 1,
        lighting: {
            ambient: [0.3, 0.3, 0.3],
            directional: [
                {
                    direction: [-0.4, 1, -0.4],
                    color: [0.8, 0.8, 0.8]
                }
            ],
            spot: [],
            point: []
        },
        chunks: meshNames.filter(n => n.endsWith('.bmesh')).map(n => `${arenaName}/${n}`),
        spawnpoint: {
            position: [0, 0, 0],
            rotation: [0, 0, 0]
        },
        pickups: []
    };

    const configPath = path.join(outputDir, 'config.arena');
    fs.writeFileSync(configPath, prettyJSONStringify(configData, {
        spaceAfterComma: '',
        shouldExpand: (o, l, k) => k === 'chunks' || (Array.isArray(o) ? o.length > 3 || o.some(i => typeof i === 'object') : true)
    }));
};


const convertMeshToBMeshData = (meshData, outputPath) => {
    let totalIndicesCount = 0;
    for (const group of meshData.indices) {
        totalIndicesCount += group.array.length;
    }

    const buffer = Buffer.alloc(
        20 +
        meshData.vertices.length * 4 +
        (meshData.uvs?.length || 0) * 4 +
        (meshData.normals?.length || 0) * 4 +
        (meshData.indices.length * MATERIAL_NAME_SIZE) +
        (meshData.indices.length * 4) +
        (totalIndicesCount * 4)
    );

    let offset = 0;
    buffer.writeUInt32LE(1, offset); offset += 4;
    buffer.writeUInt32LE(meshData.vertices.length, offset); offset += 4;
    buffer.writeUInt32LE(meshData.uvs?.length || 0, offset); offset += 4;
    buffer.writeUInt32LE(meshData.normals?.length || 0, offset); offset += 4;
    buffer.writeUInt32LE(meshData.indices.length, offset); offset += 4;

    for (let i = 0; i < meshData.vertices.length; i++) {
        buffer.writeFloatLE(meshData.vertices[i], offset);
        offset += 4;
    }

    if (meshData.uvs?.length) {
        for (let i = 0; i < meshData.uvs.length; i++) {
            buffer.writeFloatLE(meshData.uvs[i], offset);
            offset += 4;
        }
    }

    if (meshData.normals?.length) {
        for (let i = 0; i < meshData.normals.length; i++) {
            buffer.writeFloatLE(meshData.normals[i], offset);
            offset += 4;
        }
    }

    for (const indexGroup of meshData.indices) {
        const materialName = indexGroup.material || '';
        buffer.fill(0, offset, offset + MATERIAL_NAME_SIZE);
        buffer.write(materialName, offset, Math.min(materialName.length, MATERIAL_NAME_SIZE));
        offset += MATERIAL_NAME_SIZE;
        buffer.writeUInt32LE(indexGroup.array.length, offset);
        offset += 4;
        for (let i = 0; i < indexGroup.array.length; i++) {
            buffer.writeUInt32LE(indexGroup.array[i], offset);
            offset += 4;
        }
    }

    fs.writeFileSync(outputPath, buffer);
};


const parseArgs = () => {
    const args = process.argv.slice(2);
    let inputPath = null;
    let outputMesh = false;
    let outputBMesh = true;
    let scale = 1.0;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--mesh' || arg === '-m') {
            outputMesh = true;
        } else if (arg === '--both' || arg === '-a') {
            outputMesh = true;
            outputBMesh = true;
        } else if (arg === '--scale' || arg === '-s') {
            const scaleValue = parseFloat(args[++i]);
            if (isNaN(scaleValue) || scaleValue <= 0) {
                console.error('Scale must be a positive number');
                process.exit(1);
            }
            scale = scaleValue;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: node import-map.js [options] <input.obj>

Options:
  --mesh, -m        Also output .mesh files (default: bmesh only)
  --both, -a        Output both .mesh and .bmesh files
  --scale, -s <n>  Scale all vertices by this factor (default: 1.0)
  --help, -h        Show this help message

Examples:
  node import-map.js model.obj                    # Create map structure with .bmesh files
  node import-map.js --scale 0.1 model.obj        # Scale down to 10% size
  node import-map.js --scale 0.5 --mesh model.obj # Scale to 50% and output .mesh files
            `);
            process.exit(0);
        } else if (!arg.startsWith('-') && !inputPath) {
            inputPath = arg;
        }
    }

    if (!inputPath) {
        console.error('Please provide an input .obj file');
        console.error('Use --help for usage information');
        process.exit(1);
    }

    if (!inputPath.endsWith('.obj')) {
        console.error('Input file must be a .obj file');
        process.exit(1);
    }

    return { inputPath, outputMesh, outputBMesh, scale };
};

try {
    const { inputPath, outputMesh, outputBMesh, scale } = parseArgs();
    convertObjToMesh(inputPath, outputMesh, outputBMesh, scale);
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
}

