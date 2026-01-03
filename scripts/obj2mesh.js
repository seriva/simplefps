#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import stringify from 'pretty-json-stringify';

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
    const elements = faceElements.filter(el => el.length > 0);
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
    const outputDir = path.join(inputDir, inputBase);
    fs.mkdirSync(outputDir, { recursive: true });

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
    const meshOutputDir = outputDir;

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
                    meshNames.push(saveMesh(currentMesh, currentEntityName, outputMesh, outputBMesh, meshOutputDir));
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
        meshNames.push(saveMesh(currentMesh, currentEntityName || 'default', outputMesh, outputBMesh, meshOutputDir));
        meshes.push(currentMesh);
    }

    if (meshes.length > 0) {
        writeMaterialsFile(outputDir, materials, inputDir);
    }
    return meshes;
};

const saveMesh = (mesh, groupName, outputMesh, outputBMesh, meshOutputDir) => {
    const finalMesh = {
        indices: mesh.indices.filter(m => m.array.length > 0),
        vertices: Array.from(mesh.vertices.slice(0, mesh.vertexCount)),
        uvs: mesh.uvCount ? Array.from(mesh.uvs.slice(0, mesh.uvCount)) : [],
        normals: mesh.normalCount ? Array.from(mesh.normals.slice(0, mesh.normalCount)) : []
    };

    const baseName = groupName.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/_Mesh$/, '').toLowerCase();

    if (outputMesh) {
        fs.writeFileSync(path.join(meshOutputDir, `${baseName}.mesh`), JSON.stringify(finalMesh, null, 4));
    }
    if (outputBMesh) {
        convertMeshToBMeshData(finalMesh, path.join(meshOutputDir, `${baseName}.bmesh`));
        return baseName + '.bmesh';
    }
    return baseName + '.mesh';
};

const convertSingleTexture = (srcFile, destFile) => {
    try {
        execSync(`convert "${srcFile}" -quality 90 -define webp:lossless=true "${destFile}"`);
        return true;
    } catch (e) {
        console.error(`Failed to convert ${srcFile}:`, e.message);
        return false;
    }
};

const findAndConvertTexture = (textureBaseName, textureDir, outputDir) => {
    const extensions = ['.tga', '.jpg', '.jpeg', '.png'];
    const lowerBaseName = textureBaseName.toLowerCase();
    const destFile = path.join(outputDir, `${lowerBaseName}.webp`);

    for (const ext of extensions) {
        let srcFile = path.join(textureDir, textureBaseName + ext);
        if (fs.existsSync(srcFile)) {
            convertSingleTexture(srcFile, destFile);
            return { found: true, destName: `${lowerBaseName}.webp` };
        }

        srcFile = path.join(textureDir, 'textures', textureBaseName + ext);
        if (fs.existsSync(srcFile)) {
            convertSingleTexture(srcFile, destFile);
            return { found: true, destName: `${lowerBaseName}.webp` };
        }
    }

    console.warn(`Texture not found: ${textureBaseName} (searched in ${textureDir})`);
    return { found: false };
};

const writeMaterialsFile = (outputDir, materials, inputDir) => {
    // Map texture suffixes to engine texture slots
    const suffixToSlot = {
        '_diffuse': 'albedo',
        '_albedo': 'albedo',
        '_basecolor': 'albedo',
        '_normal': 'normal',
        '_bump': 'normal',
        '_emissive': 'emissive',
        '_emission': 'emissive',
        '_glow': 'emissive',
        '_sem': 'reflectionMask',
        '_reflection': 'reflectionMask',
        '_roughness': 'roughness',
        '_metallic': 'metallic',
        '_spec': 'specular'
    };

    const getTextureSlot = (texName) => {
        const lower = texName.toLowerCase();
        for (const [suffix, slot] of Object.entries(suffixToSlot)) {
            if (lower.includes(suffix)) return slot;
        }
        return 'albedo'; // Default to albedo if no suffix match
    };

    // Given a base name like "Energy_Scepter_diffuse", derive the material base "Energy_Scepter"
    const getBaseName = (texName) => {
        const lower = texName.toLowerCase();
        for (const suffix of Object.keys(suffixToSlot)) {
            if (lower.endsWith(suffix)) {
                return texName.slice(0, -suffix.length);
            }
        }
        return texName;
    };

    // Search for companion textures with the same base name but different suffixes
    const findCompanionTextures = (baseName) => {
        const companions = [];
        const suffixesToSearch = ['_glow', '_emissive', '_emission'];
        const extensions = ['.tga', '.jpg', '.jpeg', '.png'];

        for (const suffix of suffixesToSearch) {
            for (const ext of extensions) {
                const candidateName = baseName + suffix;
                const srcFile = path.join(inputDir, candidateName + ext);
                if (fs.existsSync(srcFile)) {
                    companions.push(candidateName);
                    break; // Found this suffix, move to next
                }
            }
        }
        return companions;
    };

    const processTextures = texList => {
        const textureObj = {};
        for (const texName of texList) {
            const result = findAndConvertTexture(texName, inputDir, outputDir);
            const slot = getTextureSlot(texName);
            textureObj[slot] = result.found ? result.destName : `${texName.toLowerCase()}.webp`;

            // If this is a diffuse/albedo texture, search for companions
            if (slot === 'albedo') {
                const baseName = getBaseName(texName);
                const companions = findCompanionTextures(baseName);
                for (const companion of companions) {
                    const compResult = findAndConvertTexture(companion, inputDir, outputDir);
                    const compSlot = getTextureSlot(companion);
                    if (compResult.found && !textureObj[compSlot]) {
                        textureObj[compSlot] = compResult.destName;
                    }
                }
            }
        }
        return textureObj;
    };

    fs.writeFileSync(path.join(outputDir, 'materials.mat'), JSON.stringify({
        materials: materials.map(mat => ({ name: mat.name, textures: processTextures(mat.textures) }))
    }, null, 4));
};


const convertMeshToBMeshData = (meshData, outputPath) => {
    const totalIndicesCount = meshData.indices.reduce((sum, g) => sum + g.array.length, 0);
    const uvsLen = meshData.uvs?.length || 0;
    const normalsLen = meshData.normals?.length || 0;

    const buffer = Buffer.alloc(
        24 + // 6 header fields * 4 bytes
        meshData.vertices.length * 4 +
        uvsLen * 4 +
        normalsLen * 4 +
        meshData.indices.length * (MATERIAL_NAME_SIZE + 4) +
        totalIndicesCount * 4
    );

    let offset = 0;
    const writeU32 = v => { buffer.writeUInt32LE(v, offset); offset += 4; };
    const writeF32Array = arr => {
        const f32 = new Float32Array(arr);
        Buffer.from(f32.buffer).copy(buffer, offset);
        offset += f32.byteLength;
    };

    // Header: version, vertexCount, uvCount, colorCount (unused, 0), normalCount, indexGroupCount
    writeU32(1);  // version
    writeU32(meshData.vertices.length);  // vertexCount
    writeU32(uvsLen);  // uvCount
    writeU32(0);  // colorCount (unused in v1, engine skips this)
    writeU32(normalsLen);  // normalCount
    writeU32(meshData.indices.length);  // indexGroupCount

    writeF32Array(meshData.vertices);
    if (uvsLen) writeF32Array(meshData.uvs);
    if (normalsLen) writeF32Array(meshData.normals);

    for (const { material = '', array } of meshData.indices) {
        buffer.fill(0, offset, offset + MATERIAL_NAME_SIZE);
        buffer.write(material, offset, Math.min(material.length, MATERIAL_NAME_SIZE));
        offset += MATERIAL_NAME_SIZE;
        writeU32(array.length);
        const u32 = new Uint32Array(array);
        Buffer.from(u32.buffer).copy(buffer, offset);
        offset += u32.byteLength;
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
Usage: node obj2mesh.js [options] <input.obj>

Options:
  --mesh, -m        Also output .mesh files (default: bmesh only)
  --both, -a        Output both .mesh and .bmesh files
  --scale, -s <n>  Scale all vertices by this factor (default: 1.0)
  --help, -h        Show this help message

Examples:
  node obj2mesh.js model.obj                    # Convert OBJ to .bmesh files
  node obj2mesh.js --scale 0.1 model.obj        # Scale down to 10% size
  node obj2mesh.js --scale 0.5 --mesh model.obj # Scale to 50% and output .mesh files
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

