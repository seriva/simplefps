#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Quake 3 BSP Constants
const LUMP_ENTITIES = 0;
const LUMP_TEXTURES = 1;
const LUMP_PLANES = 2;
const LUMP_NODES = 3;
const LUMP_LEAFS = 4;
const LUMP_LEAFFACES = 5;
const LUMP_LEAFBRUSHES = 6;
const LUMP_MODELS = 7;
const LUMP_BRUSHES = 8;
const LUMP_BRUSHSIDES = 9;
const LUMP_VERTEXES = 10;
const LUMP_MESHVERTS = 11;
const LUMP_EFFECTS = 12;
const LUMP_FACES = 13;
const LUMP_LIGHTMAPS = 14;
const LUMP_LIGHTVOLS = 15;
const LUMP_VISDATA = 16;

const HEADER_SIZE = 144; // 4 magic + 4 version + 17 * 8 lumps
const MATERIAL_NAME_SIZE = 64;

function readBSP(filename) {
    const fd = fs.openSync(filename, 'r');
    const stats = fs.fstatSync(fd);
    const size = stats.size;
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, 0);
    fs.closeSync(fd);

    // Check Header
    const magic = buffer.toString('utf8', 0, 4);
    const version = buffer.readInt32LE(4);

    if (magic !== 'IBSP' || version !== 46) {
        throw new Error(`Invalid BSP file. Magic: ${magic}, Version: ${version}`);
    }

    // Read Lumps
    const lumps = [];
    for (let i = 0; i < 17; i++) {
        const offset = buffer.readInt32LE(8 + i * 8);
        const length = buffer.readInt32LE(8 + i * 8 + 4);
        lumps.push({ offset, length });
    }

    return { buffer, lumps };
}

function parseVertices(buffer, lump, scale) {
    const count = lump.length / 44; // 44 bytes per vertex
    const vertices = [];

    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * 44;

        // Read pos, rotate to Y-up, and scale
        const x = buffer.readFloatLE(off) * scale;
        const y = buffer.readFloatLE(off + 4) * scale;
        const z = buffer.readFloatLE(off + 8) * scale;

        // Read UVs
        const u = buffer.readFloatLE(off + 12);
        const v = buffer.readFloatLE(off + 16);

        // Read Normals, rotate to Y-up
        const nx = buffer.readFloatLE(off + 20);
        const ny = buffer.readFloatLE(off + 24);
        const nz = buffer.readFloatLE(off + 28);

        vertices.push({
            x: x,
            y: z,
            z: -y,
            u: u,
            v: 1 - v, // Flip V
            nx: nx,
            ny: nz,
            nz: -ny
        });
    }
    return vertices;
}

function parseMeshVerts(buffer, lump) {
    const count = lump.length / 4;
    const meshVerts = [];
    for (let i = 0; i < count; i++) {
        meshVerts.push(buffer.readInt32LE(lump.offset + i * 4));
    }
    return meshVerts;
}

function parseTextures(buffer, lump) {
    const count = lump.length / 72;
    const textures = [];
    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * 72;
        let name = buffer.toString('utf8', off, off + 64);
        name = name.replace(/\0/g, ''); // Trim nulls
        textures.push(name);
    }
    return textures;
}

function parseFaces(buffer, lump) {
    const count = lump.length / 104;
    const faces = [];
    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * 104;
        faces.push({
            texture: buffer.readInt32LE(off),
            effect: buffer.readInt32LE(off + 4),
            type: buffer.readInt32LE(off + 8),
            vertex: buffer.readInt32LE(off + 12),
            n_vertexes: buffer.readInt32LE(off + 16),
            meshvert: buffer.readInt32LE(off + 20),
            n_meshverts: buffer.readInt32LE(off + 24),
            // ... other fields present but unused
        });
    }
    return faces;
}

function writeBMesh(meshData, outputPath) {
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
    buffer.writeUInt32LE(1, offset); offset += 4; // Version
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
}

function convertTextures(usedTextures, textureDir, outputDir, arenaName) {
    if (!textureDir || !fs.existsSync(textureDir)) {
        console.log('No texture directory provided or found. Skipping texture conversion.');
        return;
    }

    console.log(`Searching for textures in ${textureDir}...`);
    let convertedCount = 0;

    for (const texPath of usedTextures) {
        // TexPath comes from BSP, e.g. "textures/dsi_textures/cretebase"
        // We need to find this file in textureDir.
        // textureDir is likely "scripts/test/textures"
        // So we look for "scripts/test/textures/dsi_textures/cretebase.tga"

        // Handle "textures/" prefix if present in BSP name but implicitly part of textureDir root
        let relativePath = texPath;
        if (relativePath.startsWith('textures/')) {
            relativePath = relativePath.substring(9);
        }

        const baseName = path.basename(texPath);
        const destFile = path.join(outputDir, `${baseName}.webp`);

        // If already exists, maybe skip? For now, overwrite to ensure latest.

        const extensions = ['.tga', '.jpg', '.jpeg', '.png'];
        let found = false;

        for (const ext of extensions) {
            const srcFile = path.join(textureDir, relativePath + ext);
            if (fs.existsSync(srcFile)) {
                try {
                    // console.log(`Converting ${srcFile} -> ${destFile}`);
                    execSync(`convert "${srcFile}" -quality 90 -define webp:lossless=true "${destFile}"`);
                    convertedCount++;
                    found = true;
                    break;
                } catch (e) {
                    console.error(`Failed to convert ${srcFile}:`, e.message);
                }
            }
        }

        if (!found) {
            // Try looser search? 
            // Maybe the BSP name is just the filename part?
            // "cretebase" -> look for "**/cretebase.tga"?
            // For now, simple path matching.
            console.warn(`Texture not found: ${texPath} (searched in ${textureDir})`);
        }
    }
    console.log(`Converted ${convertedCount} textures.`);
}

function exportMap(vertices, meshVerts, faces, textures, outputDir, arenaName, textureDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    // Group faces by texture
    const facesByTexture = new Map();
    const usedTextures = new Set(); // Stores full path from BSP "textures/..."

    for (const face of faces) {
        if (face.type === 1 || face.type === 3) {
            const texName = textures[face.texture];
            // Filter out sky surfaces
            if (texName.toLowerCase().includes('sky')) {
                continue;
            }

            if (!facesByTexture.has(face.texture)) {
                facesByTexture.set(face.texture, []);
            }
            facesByTexture.get(face.texture).push(face);
            usedTextures.add(texName);
        }
    }

    // Build Mesh Data
    // We already have vertices[], but we need to put them into flat arrays
    // AND re-index them? Or just use them as is?
    // BSP indices are absolute (offset by face.vertex). We can preserve the vertices list as is,
    // since we export the whole map as one object.

    const flatVertices = [];
    const flatUVs = [];
    const flatNormals = [];

    // Copy all vertices to flat arrays
    for (const v of vertices) {
        flatVertices.push(v.x, v.y, v.z);
        flatUVs.push(v.u, v.v);
        flatNormals.push(v.nx, v.ny, v.nz);
    }

    // Build Index Groups
    const indicesGroups = [];

    for (const [texIdx, texFaces] of facesByTexture) {
        const texName = path.basename(textures[texIdx]); // Use simple name for material matching
        const indices = [];

        for (const face of texFaces) {
            for (let i = 0; i < face.n_meshverts; i += 3) {
                // Get original vertex indices
                const idx1 = meshVerts[face.meshvert + i] + face.vertex;
                const idx2 = meshVerts[face.meshvert + i + 1] + face.vertex;
                const idx3 = meshVerts[face.meshvert + i + 2] + face.vertex;

                // Swap wind order: 1, 3, 2
                indices.push(idx1);
                indices.push(idx3);
                indices.push(idx2);
            }
        }

        indicesGroups.push({
            material: texName,
            array: indices
        });
    }

    // Write Level.bmesh
    const chunksDir = path.join(outputDir, 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });

    const meshData = {
        vertices: flatVertices, // Float32Array or array
        uvs: flatUVs,
        normals: flatNormals,
        indices: indicesGroups
    };

    writeBMesh(meshData, path.join(chunksDir, 'Level.bmesh'));
    console.log(`Wrote Level.bmesh with ${flatVertices.length / 3} vertices and ${indicesGroups.length} material groups.`);

    // Convert Textures
    if (textureDir) {
        convertTextures(usedTextures, textureDir, outputDir, arenaName);
    }

    // Write materials.mat
    const materialsData = {
        materials: Array.from(usedTextures).map(fullPath => {
            const name = path.basename(fullPath);
            return {
                name: name,
                textures: [`${arenaName}/${name}.webp`]
            };
        })
    };
    fs.writeFileSync(path.join(outputDir, 'materials.mat'), JSON.stringify(materialsData, null, 4));

    // Write config.arena
    const configData = {
        skybox: 1,
        lighting: {
            ambient: [1, 1, 1],
            directional: [
                {
                    direction: [-0.4, 1, -0.4],
                    color: [0.8, 0.8, 0.8]
                }
            ],
            spot: [],
            point: []
        },
        chunks: [`${arenaName}/chunks/Level.bmesh`],
        spawnpoint: {
            position: [0, 0, 0],
            rotation: [0, 0, 0]
        },
        pickups: []
    };

    // Check if spawn points exist (Entity lump parsing optional but good)
    // For now, defaults.

    fs.writeFileSync(path.join(outputDir, 'config.arena'), JSON.stringify(configData, null, 4));
    console.log(`Wrote config.arena and materials.mat to ${outputDir}`);
}

// Run
const inputFile = process.argv[2];
const outputDir = process.argv[3];
const arenaName = process.argv[4] || 'arenas/demo';
const scale = parseFloat(process.argv[5]) || 0.03;
const textureDir = process.argv[6] || 'scripts/test/textures';

if (!inputFile || !outputDir) {
    console.error('Usage: node bsp2map.js <input.bsp> <output_dir> [arena_name_prefix] [scale] [texture_source_dir]');
    process.exit(1);
}

try {
    const { buffer, lumps } = readBSP(inputFile);
    const vertices = parseVertices(buffer, lumps[LUMP_VERTEXES], scale);
    const meshVerts = parseMeshVerts(buffer, lumps[LUMP_MESHVERTS]);
    const faces = parseFaces(buffer, lumps[LUMP_FACES]);
    const textures = parseTextures(buffer, lumps[LUMP_TEXTURES]);

    exportMap(vertices, meshVerts, faces, textures, outputDir, arenaName, textureDir);
} catch (e) {
    console.error('Conversion failed:', e);
}
