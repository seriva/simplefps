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

        // Read Lightmap UVs
        const lmu = buffer.readFloatLE(off + 20);
        const lmv = buffer.readFloatLE(off + 24);

        // Read Normals, rotate to Y-up
        // Read Normals, rotate to Y-up
        const nx = buffer.readFloatLE(off + 28);
        const ny = buffer.readFloatLE(off + 32);
        const nz = buffer.readFloatLE(off + 36);

        // Read color (4 bytes)
        // Quake 3 uses overbright bits. Raw values are often dark.
        // We amplify by 12.0 to bring them into visible range.
        const r = Math.min(1.0, (buffer[off + 40] * 12.0) / 255.0);
        const g = Math.min(1.0, (buffer[off + 41] * 12.0) / 255.0);
        const b = Math.min(1.0, (buffer[off + 42] * 12.0) / 255.0);
        const a = buffer[off + 43] / 255.0;



        if (i < 5) {
            console.log(`Vertex ${i} Color: ${r.toFixed(2)}, ${g.toFixed(2)}, ${b.toFixed(2)}, ${a.toFixed(2)}`);
        }

        vertices.push({
            x: x,
            y: z,
            z: -y,
            u: u,
            v: 1 - v, // Flip V
            lmu: lmu,
            lmv: lmv,
            nx: nx,
            ny: nz,
            nz: -ny,
            r: r,
            g: g,
            b: b,
            a: a
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
        24 +
        meshData.vertices.length * 4 +
        (meshData.uvs?.length || 0) * 4 +
        (meshData.normals?.length || 0) * 4 +
        (meshData.colors?.length || 0) * 4 +
        (meshData.indices.length * MATERIAL_NAME_SIZE) +
        (meshData.indices.length * 4) +
        (totalIndicesCount * 4)
    );

    let offset = 0;
    buffer.writeUInt32LE(1, offset); offset += 4; // Version
    buffer.writeUInt32LE(meshData.vertices.length, offset); offset += 4;
    buffer.writeUInt32LE(meshData.uvs?.length || 0, offset); offset += 4;
    buffer.writeUInt32LE(meshData.normals?.length || 0, offset); offset += 4;
    buffer.writeUInt32LE(meshData.colors?.length || 0, offset); offset += 4; // Colors Count
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

    if (meshData.colors?.length) {
        for (let i = 0; i < meshData.colors.length; i++) {
            buffer.writeFloatLE(meshData.colors[i], offset);
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

function exportMap(vertices, meshVerts, faces, textures, outputDir, arenaName, textureDir, shaderMap, entities) {
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

            // Filter out glass surfaces (per user request)
            if (texName.toLowerCase().includes('glass')) {
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
    const flatColors = [];

    // Copy all vertices to flat arrays
    for (const v of vertices) {
        flatVertices.push(v.x, v.y, v.z);
        flatUVs.push(v.u, v.v);
        flatNormals.push(v.nx, v.ny, v.nz);
        flatColors.push(v.r, v.g, v.b, v.a);
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

    // Write level.bmesh
    const chunksDir = path.join(outputDir, 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });

    const meshData = {
        vertices: flatVertices, // Float32Array or array
        uvs: flatUVs,
        normals: flatNormals,
        colors: flatColors,
        indices: indicesGroups
    };

    writeBMesh(meshData, path.join(chunksDir, 'level.bmesh'));
    console.log(`Wrote level.bmesh with ${flatVertices.length / 3} vertices and ${indicesGroups.length} material groups.`);

    // Convert Textures
    if (textureDir) {
        convertTextures(usedTextures, textureDir, outputDir, arenaName);
    }

    // Write materials.mat
    const materialsData = {
        materials: Array.from(usedTextures).map(fullPath => {
            const name = path.basename(fullPath);
            const blendTextures = [];
            let doEmissive = 0;

            // 1. Check Shader Definition
            if (shaderMap) {
                // BSP texture names often omit extension, e.g. "textures/dsi_textures/steplight1b"
                // Shader names usually match this exactly.
                const shaderStages = shaderMap.get(fullPath.toLowerCase());

                if (shaderStages) {
                    // console.log(`DEBUG: Checking shader for ${fullPath}`);
                    for (const stage of shaderStages) {
                        const lines = stage.split('\n').map(l => l.trim());
                        const isAdditive = lines.some(l =>
                            /^blendfunc\s+add/i.test(l) ||
                            /^blendfunc\s+gl_one\s+gl_one/i.test(l) ||
                            /^blendfunc\s+gl_src_alpha\s+gl_one/i.test(l)
                        );

                        if (isAdditive) {
                            // extracting map
                            const mapLine = lines.find(l => /^map\s+/i.test(l));
                            if (mapLine) {
                                let mapPath = mapLine.split(/\s+/)[1];
                                if (mapPath && mapPath !== '$lightmap') {
                                    // Found an additive texture map!
                                    // mapPath e.g. "textures/dsi_textures/steplight1.blend.tga"

                                    // Convert this texture
                                    if (textureDir) {
                                        let relativePath = mapPath;
                                        if (relativePath.startsWith('textures/')) {
                                            relativePath = relativePath.substring(9);
                                        }

                                        // Try extensions
                                        // The mapPath usually has extension in shader file
                                        const srcFile = path.join(textureDir, relativePath);

                                        // If srcFile doesn't exist, try removing/changing extension?
                                        // Q3 shaders specifying .tga might point to .jpg on disk theoretically?

                                        if (fs.existsSync(srcFile)) {
                                            const blendBaseName = path.basename(mapPath, path.extname(mapPath)); // steplight1.blend
                                            const blendDestName = `${blendBaseName}_blend.webp`;

                                            const blendDestPath = path.join(outputDir, blendDestName);
                                            try {
                                                execSync(`convert "${srcFile}" -quality 90 -define webp:lossless=true "${blendDestPath}"`);
                                                // Only add if not already added?
                                                const existing = blendTextures.find(t => t.endsWith(blendDestName));
                                                if (!existing) {
                                                    const arenaPath = `${arenaName}/${blendDestName}`;
                                                    blendTextures.push(arenaPath);
                                                    doEmissive = 1;
                                                    console.log(`Found shader blend texture: ${srcFile} -> ${blendDestName}`);
                                                }
                                            } catch (e) {
                                                console.error(`Failed to convert shader blend texture ${srcFile}:`, e.message);
                                            }
                                        } else {
                                            // console.warn(`Shader referenced texture not found: ${srcFile}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. Fallback to filename matching if shader lookeup failed?
            // Or only rely on shader if available?
            // Let's keep the filename check as backup but only if we haven't found valid ones yet.
            if (textureDir && blendTextures.length === 0) {
                // ... (existing fallback logic) ...
                let relativePath = fullPath;
                if (relativePath.startsWith('textures/')) {
                    relativePath = relativePath.substring(9);
                }
                const blendEXT = '.blend.tga';
                const srcFile = path.join(textureDir, relativePath + blendEXT);

                if (fs.existsSync(srcFile)) {
                    const blendDestName = `${name}_blend.webp`;
                    const blendDestPath = path.join(outputDir, blendDestName);

                    try {
                        execSync(`convert "${srcFile}" -quality 90 -define webp:lossless=true "${blendDestPath}"`);
                        blendTextures.push(`${arenaName}/${blendDestName}`);
                        doEmissive = 1;
                        console.log(`Found inferred blend texture: ${srcFile}`);
                    } catch (e) {
                        console.error("Failed to convert blend texture", e);
                    }
                }
            }

            const matDef = {
                name: name,
                textures: [`${arenaName}/${name}.webp`, ...blendTextures]
            };

            if (doEmissive) {
                matDef.doEmissive = 1;
            }
            return matDef;
        })
    };
    fs.writeFileSync(path.join(outputDir, 'materials.mat'), JSON.stringify(materialsData, null, 4));

    // Check for spawn points
    const spawnpoints = [];

    if (entities) {
        // Look for info_player_deathmatch first, then info_player_start
        const spawns = entities.filter(e => e.classname === 'info_player_deathmatch');
        const backups = entities.filter(e => e.classname === 'info_player_start');

        const validSpawns = [...spawns, ...backups];

        if (validSpawns.length > 0) {
            console.log(`Processing ${validSpawns.length} spawn points...`);

            for (const spawn of validSpawns) {
                if (spawn.origin) {
                    const parts = spawn.origin.split(' ').map(Number);
                    if (parts.length === 3) {
                        const x = parts[0] * scale;
                        const y = parts[1] * scale;
                        const z = parts[2] * scale;

                        // Transform: Q3 Z-up -> Engine Y-up
                        const position = [x, z, -y];
                        let rotation = [0, 0, 0];

                        // Angle
                        if (spawn.angle) {
                            const angle = parseFloat(spawn.angle);
                            rotation = [0, (angle - 90) * (Math.PI / 180), 0];
                        }

                        spawnpoints.push({
                            position: position,
                            rotation: rotation
                        });
                    }
                }
            }
        }
    }

    // Fallback if no spawns found
    if (spawnpoints.length === 0) {
        spawnpoints.push({
            position: [0, 5, 0],
            rotation: [0, 0, 0]
        });
    }

    // Write config.arena
    const configData = {
        skybox: 1,
        lighting: {
            ambient: [1.0, 1.0, 1.0],
            directional: [],
            spot: [],
            point: []
        },
        chunks: [`${arenaName}/chunks/level.bmesh`],
        spawnpoints: spawnpoints,
        pickups: []
    };

    fs.writeFileSync(path.join(outputDir, 'config.arena'), JSON.stringify(configData, null, 4));
    console.log(`Wrote config.arena and materials.mat to ${outputDir}`);

    // Write helper function to update or create a resource list
    function updateResourceList(listPath, newResources) {
        let data = { resources: [] };
        if (fs.existsSync(listPath)) {
            try {
                data = JSON.parse(fs.readFileSync(listPath, 'utf8'));
            } catch (e) {
                console.error(`Error reading ${listPath}, starting fresh.`);
            }
        }

        const set = new Set(data.resources);
        let added = 0;
        for (const res of newResources) {
            if (!set.has(res)) {
                data.resources.push(res);
                added++;
            }
        }

        if (added > 0) {
            fs.writeFileSync(listPath, JSON.stringify(data, null, 4));
        }
        return added;
    }

    // 1. Generate map-specific resources.list
    const mapResourcesListPath = path.join(outputDir, 'resources.list');

    // Collect all assets for this map
    const mapAssets = [
        `${arenaName}/materials.mat`,
        `${arenaName}/chunks/level.bmesh`
    ];

    // Add all textures (base + blend)
    materialsData.materials.forEach(mat => {
        mat.textures.forEach(tex => {
            mapAssets.push(tex);
        });
    });

    const mapAddedCount = updateResourceList(mapResourcesListPath, mapAssets);
    console.log(`Updated ${arenaName}/resources.list with ${mapAddedCount} new assets.`);


    // 2. Update main resources.list to include the map's list
    const mainResourcesListPath = path.join(outputDir, '../../resources.list');
    if (fs.existsSync(mainResourcesListPath)) {
        try {
            const mainListRef = `${arenaName}/resources.list`;
            const mainAddedCount = updateResourceList(mainResourcesListPath, [mainListRef]);

            if (mainAddedCount > 0) {
                console.log(`Updated main resources.list linked to ${mainListRef}`);
            } else {
                console.log(`Main resources.list already links to ${mainListRef}`);
            }

        } catch (e) {
            console.error('Failed to update main resources.list:', e);
        }
    } else {
        console.warn(`Could not find resources.list at ${mainResourcesListPath}`);
    }
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


function parseShaderFiles(shaderDir) {
    if (!fs.existsSync(shaderDir)) return new Map();

    const shaderMap = new Map();
    const files = fs.readdirSync(shaderDir).filter(f => f.endsWith('.shader'));

    for (const file of files) {
        const content = fs.readFileSync(path.join(shaderDir, file), 'utf8');
        // Simple regex-based parser for Q3 shaders
        // This is a naive implementation but sufficient for this structure
        // Fix: Exclude } from being matched as a name
        const blocks = content.split(/^([^\s{}]+)\s*$/m);

        // Split often leaves empty first element
        for (let i = 1; i < blocks.length; i += 2) {
            const name = blocks[i].trim();
            const body = blocks[i + 1];

            if (name === 'textures/dsi_textures/dsiglass') {
                console.log(`DEBUG: Found dsiglass shader. Body length: ${body.length}`);
            }

            if (!body) continue;

            const stages = [];
            let bracketDepth = 0;
            let currentStage = '';

            // Extract stages {} inside the body {}
            // The body string starts with { and ends with } roughly
            const innerBody = body.substring(body.indexOf('{') + 1, body.lastIndexOf('}'));

            for (let j = 0; j < innerBody.length; j++) {
                const char = innerBody[j];
                if (char === '{') {
                    bracketDepth++;
                    currentStage = '';
                } else if (char === '}') {
                    bracketDepth--;
                    if (bracketDepth === 0) {
                        stages.push(currentStage.trim());
                    }
                } else if (bracketDepth > 0) {
                    currentStage += char;
                }
            }

            if (name === 'textures/dsi_textures/dsiglass') {
                console.log(`DEBUG: dsiglass has ${stages.length} stages.`);
                stages.forEach((s, idx) => {
                    console.log(`  Stage ${idx}:`, s.split('\n').map(x => x.trim()).join(' | '));
                });
            }

            shaderMap.set(name.toLowerCase(), stages);
        }
    }
    console.log(`Parsed ${shaderMap.size} shaders. Keys:`, Array.from(shaderMap.keys()));
    return shaderMap;
}

function findExampleTextures(shaderMap, shaderDir) {
    // Debug helper
    console.log(`Parsed ${shaderMap.size} shaders.`);
}

// ... existing code ...

// ... existing code ...

function parseEntities(buffer, lump) {
    const data = buffer.slice(lump.offset, lump.offset + lump.length).toString('utf8');
    const entities = [];
    let currentEntity = null;

    // Simple parser for { key "value" } format
    const lines = data.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '{') {
            currentEntity = {};
        } else if (trimmed === '}') {
            if (currentEntity) {
                entities.push(currentEntity);
                currentEntity = null;
            }
        } else if (currentEntity && trimmed.length > 0) {
            // Parse "key" "value"
            // Handles complex cases like "key" "val ue"
            const match = trimmed.match(/"([^"]+)"\s+"([^"]*)"/);
            if (match) {
                currentEntity[match[1]] = match[2];
            }
        }
    }
    return entities;
}

const shaderDir = path.join(path.dirname(inputFile), '../scripts');
// Assuming input is scripts/test/maps/oildm1.bsp, shaders are in scripts/test/scripts/
// Adjust path resolution logic as needed.

try {
    const { buffer, lumps } = readBSP(inputFile);

    const entities = parseEntities(buffer, lumps[LUMP_ENTITIES]);
    console.log(`Entities Parsed: ${entities.length}`);
    if (entities.length > 0) {
        console.log("First 5 entities:", entities.slice(0, 5).map(e => e.classname));

        const teleports = entities.filter(e => e.classname === 'trigger_teleport');
        if (teleports.length > 0) {
            console.log("Found trigger_teleport entities:");
            teleports.forEach((t, i) => {
                console.log(`  Teleport ${i}:`, JSON.stringify(t));
            });
        }
    }

    // Resolve shader directory
    // If input is scripts/test/maps/oildm1.bsp -> root = scripts/test
    // shaders = scripts/test/scripts
    const mapDir = path.dirname(inputFile);
    const shaderDir = path.join(mapDir, '../scripts');

    const shaderMap = parseShaderFiles(shaderDir);

    const vertices = parseVertices(buffer, lumps[LUMP_VERTEXES], scale);
    const meshVerts = parseMeshVerts(buffer, lumps[LUMP_MESHVERTS]);
    const faces = parseFaces(buffer, lumps[LUMP_FACES]);
    const textures = parseTextures(buffer, lumps[LUMP_TEXTURES]);

    exportMap(vertices, meshVerts, faces, textures, outputDir, arenaName, textureDir, shaderMap, entities);
} catch (e) {
    console.error('Conversion failed:', e);
}
