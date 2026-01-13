#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import stringify from 'pretty-json-stringify';

// Quake 3 BSP Constants
const LUMP_ENTITIES = 0;
const LUMP_TEXTURES = 1;
const LUMP_MODELS = 7;
const LUMP_VERTEXES = 10;
const LUMP_MESHVERTS = 11;
const LUMP_FACES = 13;
const LUMP_LIGHTMAPS = 14;
const LUMP_LIGHTGRID = 15;

const HEADER_SIZE = 144; // 4 magic + 4 version + 17 * 8 lumps
const MATERIAL_NAME_SIZE = 64;

// Format-specific constants
const VERTEX_SIZE = 44; // bytes per vertex
const TEXTURE_SIZE = 72; // bytes per texture
const FACE_SIZE = 104; // bytes per face
const MESHVERT_SIZE = 4; // bytes per mesh vertex index
const LIGHTMAP_SIZE = 128; // Quake 3 lightmaps are 128x128
const LIGHTMAP_BYTES = LIGHTMAP_SIZE * LIGHTMAP_SIZE * 3; // RGB format
const LIGHTGRID_ELEMENT_SIZE = 8; // 3 ambient + 3 directional + 2 dir
const MODEL_SIZE = 40; // bytes per model

// Color amplification for Quake 3 overbright bits


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
    const count = lump.length / VERTEX_SIZE;
    const vertices = [];

    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * VERTEX_SIZE;

        // Position (scaled and coordinate system transformed)
        const x = buffer.readFloatLE(off) * scale;
        const y = buffer.readFloatLE(off + 4) * scale;
        const z = buffer.readFloatLE(off + 8) * scale;

        // Texture UVs
        const u = buffer.readFloatLE(off + 12);
        const v = buffer.readFloatLE(off + 16);

        // Lightmap UVs (flipped V coordinate)
        const lmu = buffer.readFloatLE(off + 20);
        const lmv = buffer.readFloatLE(off + 24);

        // Normal
        const nx = buffer.readFloatLE(off + 28);
        const ny = buffer.readFloatLE(off + 32);
        const nz = buffer.readFloatLE(off + 36);

        // Store vertex (Q3 Z-up -> Engine Y-up coordinate system)
        vertices.push({
            x,
            y: z,
            z: -y,
            u,
            v: 1 - v,
            lmu,
            lmv: 1 - lmv,
            nx,
            ny: nz,
            nz: -ny
        });
    }
    return vertices;
}

function parseMeshVerts(buffer, lump) {
    const count = lump.length / MESHVERT_SIZE;
    const meshVerts = [];
    for (let i = 0; i < count; i++) {
        meshVerts.push(buffer.readInt32LE(lump.offset + i * MESHVERT_SIZE));
    }
    return meshVerts;
}

function parseTextures(buffer, lump) {
    const count = lump.length / TEXTURE_SIZE;
    const textures = [];
    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * TEXTURE_SIZE;
        let name = buffer.toString('utf8', off, off + 64);
        name = name.replace(/\0.*$/g, ''); // Trim nulls and everything after
        textures.push(name);
    }
    return textures;
}

function parseFaces(buffer, lump) {
    const count = lump.length / FACE_SIZE;
    const faces = [];
    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * FACE_SIZE;
        faces.push({
            texture: buffer.readInt32LE(off),
            effect: buffer.readInt32LE(off + 4),
            type: buffer.readInt32LE(off + 8),
            vertex: buffer.readInt32LE(off + 12),
            n_vertexes: buffer.readInt32LE(off + 16),
            meshvert: buffer.readInt32LE(off + 20),
            n_meshverts: buffer.readInt32LE(off + 24),
            lm_index: buffer.readInt32LE(off + 28), // Lightmap index
        });
    }
    return faces;
}

function parseLightmaps(buffer, lump, overbright = 4) {
    const count = lump.length / LIGHTMAP_BYTES;
    const lightmaps = [];

    for (let i = 0; i < count; i++) {
        const offset = lump.offset + i * LIGHTMAP_BYTES;
        const pixels = new Uint8Array(LIGHTMAP_BYTES);

        // Extract RGB data with configurable overbright correction
        for (let j = 0; j < LIGHTMAP_SIZE * LIGHTMAP_SIZE; j++) {
            const baseIdx = offset + j * 3;
            const pixelIdx = j * 3;

            // Apply overbright multiplier and clamp to 255
            pixels[pixelIdx] = Math.min(255, buffer[baseIdx] * overbright);
            pixels[pixelIdx + 1] = Math.min(255, buffer[baseIdx + 1] * overbright);
            pixels[pixelIdx + 2] = Math.min(255, buffer[baseIdx + 2] * overbright);
        }

        lightmaps.push(pixels);
    }

    console.log(`Extracting ${count} lightmaps (${overbright}x overbright)...`);
    return lightmaps;
}

function parseModels(buffer, lump) {
    const count = lump.length / MODEL_SIZE;
    const models = [];

    for (let i = 0; i < count; i++) {
        const off = lump.offset + i * MODEL_SIZE;
        models.push({
            mins: [
                buffer.readFloatLE(off),
                buffer.readFloatLE(off + 4),
                buffer.readFloatLE(off + 8)
            ],
            maxs: [
                buffer.readFloatLE(off + 12),
                buffer.readFloatLE(off + 16),
                buffer.readFloatLE(off + 20)
            ],
            // We only need mins/maxs for the world model (index 0)
        });
    }
    return models;
}

function parseLightGrid(buffer, lump, worldModel, overbright = 1) {
    if (!lump.length) return null;

    // Try to detect grid step (64x64x64 vs 64x64x128)
    const candidates = [
        { step: [64, 64, 64], name: "64x64x64" },
        { step: [64, 64, 128], name: "64x64x128" }
    ];

    let bestConfig = null;
    let bestOrigin = null;
    let bestCounts = null;
    let bestElementSize = 0;

    for (const config of candidates) {
        const counts = [0, 0, 0];
        const origin = [0, 0, 0];

        for (let i = 0; i < 3; i++) {
            let min = worldModel.mins[i];
            let max = worldModel.maxs[i];
            const s = config.step[i];

            // Q3 Grid Align
            const gridMin = Math.ceil((min - 1) / s);
            const gridMax = Math.floor((max + 1) / s);

            counts[i] = gridMax - gridMin + 1;
            origin[i] = gridMin * s;
        }

        const totalPoints = counts[0] * counts[1] * counts[2];
        if (totalPoints === 0) continue;

        const bytesPerProbe = lump.length / totalPoints;

        // Check for Standard 8-byte
        if (Math.abs(bytesPerProbe - 8) < 0.01) {
            bestConfig = config;
            bestCounts = counts;
            bestOrigin = origin;
            bestElementSize = 8;
            console.log(`Matched LightGrid config: ${config.name} (8 bytes/probe)`);
            break; // Found perfect match
        }

        // Fallback check for compressed 4-byte (only if we haven't found a better one)
        // Note: 64x64x128 @ 8 bytes is preferred over 64x64x64 @ 4 bytes usually
        // But if we encounter 4-byte, record it
        if (Math.abs(bytesPerProbe - 4) < 0.01 && !bestConfig) {
            bestConfig = config;
            bestCounts = counts;
            bestOrigin = origin;
            bestElementSize = 4;
        }
    }

    if (!bestConfig) {
        // Default fallthrough to standard 64x64x64 and assume 8 bytes (will warn/truncate)
        console.warn("Could not match LightGrid dimensions to Lump Size. Defaulting to 64x64x64.");
        const s = [64, 64, 64];
        bestConfig = { step: s };
        bestCounts = [0, 0, 0];
        bestOrigin = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
            let min = worldModel.mins[i];
            let max = worldModel.maxs[i];
            const gridMin = Math.ceil((min - 1) / s[i]);
            const gridMax = Math.floor((max + 1) / s[i]);
            bestCounts[i] = gridMax - gridMin + 1;
            bestOrigin[i] = gridMin * s[i];
        }
        bestElementSize = 8; // Force 8
    }

    const totalGridPoints = bestCounts[0] * bestCounts[1] * bestCounts[2];
    const exportData = new Uint8Array(totalGridPoints * 3);

    for (let i = 0; i < totalGridPoints; i++) {
        const srcOff = lump.offset + i * bestElementSize;
        if (srcOff + bestElementSize > buffer.length) break;

        let r = 0, g = 0, b = 0;

        // Ambient (Bytes 0-2)
        r += buffer[srcOff];
        g += buffer[srcOff + 1];
        b += buffer[srcOff + 2];

        // Directional (Bytes 3-5) - Only if 8-byte probe
        if (bestElementSize === 8) {
            r += buffer[srcOff + 3];
            g += buffer[srcOff + 4];
            b += buffer[srcOff + 5];
        }

        // Apply Overbright
        r *= overbright;
        g *= overbright;
        b *= overbright;

        // Clamp
        exportData[i * 3] = Math.min(255, r);
        exportData[i * 3 + 1] = Math.min(255, g);
        exportData[i * 3 + 2] = Math.min(255, b);
    }

    console.log(`Extracted Light Grid: ${bestCounts.join('x')} (${totalGridPoints} probes)`);

    return {
        data: exportData,
        origin: bestOrigin,
        counts: bestCounts,
        step: bestConfig.step
    };
}

function upscaleLightmap(pixels, scale, outputDir) {
    if (scale === 1) return { pixels, size: LIGHTMAP_SIZE };

    const upscaledSize = LIGHTMAP_SIZE * scale;
    const tempInput = path.join(outputDir, 'temp_lightmap_in.ppm');
    const tempOutput = path.join(outputDir, 'temp_lightmap_out.ppm');

    // Write original lightmap as PPM
    const ppmHeader = `P6\n${LIGHTMAP_SIZE} ${LIGHTMAP_SIZE}\n255\n`;
    const ppmData = Buffer.concat([Buffer.from(ppmHeader), Buffer.from(pixels)]);
    fs.writeFileSync(tempInput, ppmData);

    // Upscale using ImageMagick with Mitchell filter
    try {
        execSync(`convert "${tempInput}" -filter Mitchell -resize ${upscaledSize}x${upscaledSize} "${tempOutput}"`);

        // Read upscaled PPM
        const upscaledPPM = fs.readFileSync(tempOutput);
        const headerEnd = upscaledPPM.indexOf('255\n') + 4;
        const upscaledPixels = new Uint8Array(upscaledPPM.slice(headerEnd));

        // Clean up temp files
        fs.unlinkSync(tempInput);
        fs.unlinkSync(tempOutput);

        return { pixels: upscaledPixels, size: upscaledSize };
    } catch (e) {
        console.error('Failed to upscale lightmap:', e.message);
        fs.unlinkSync(tempInput);
        return { pixels, size: LIGHTMAP_SIZE };
    }
}

function parseEntities(buffer, lump) {
    const data = buffer.slice(lump.offset, lump.offset + lump.length).toString('utf8');
    const entities = [];
    let currentEntity = null;

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
            const match = trimmed.match(/"([^"]+)"\s+"([^"]*)"/);
            if (match) {
                currentEntity[match[1]] = match[2];
            }
        }
    }
    return entities;
}

function writeBMesh(outputPath, meshData) {
    const totalIndicesCount = meshData.indices.reduce((sum, g) => sum + g.array.length, 0);

    const buffer = Buffer.alloc(
        24 +
        meshData.vertices.length * 4 +
        (meshData.uvs?.length || 0) * 4 +
        (meshData.lightmapUVs?.length || 0) * 4 +
        (meshData.normals?.length || 0) * 4 +
        (meshData.indices.length * MATERIAL_NAME_SIZE) +
        (meshData.indices.length * 4) +
        (totalIndicesCount * 4)
    );

    let offset = 0;
    buffer.writeUInt32LE(2, offset); offset += 4; // Version 2
    buffer.writeUInt32LE(meshData.vertices.length, offset); offset += 4;
    buffer.writeUInt32LE(meshData.uvs?.length || 0, offset); offset += 4;
    buffer.writeUInt32LE(meshData.lightmapUVs?.length || 0, offset); offset += 4;
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

    if (meshData.lightmapUVs?.length) {
        for (let i = 0; i < meshData.lightmapUVs.length; i++) {
            buffer.writeFloatLE(meshData.lightmapUVs[i], offset);
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

function convertSingleTexture(srcFile, destFile) {
    try {
        execSync(`convert "${srcFile}" -quality 90 -define webp:lossless=true "${destFile}"`);
        return true;
    } catch (e) {
        console.error(`Failed to convert ${srcFile}:`, e.message);
        return false;
    }
}

function findAndConvertTexture(relativePath, textureDir, outputDir) {
    const extensions = ['.tga', '.jpg', '.jpeg', '.png'];
    const baseName = path.basename(relativePath);
    const destFile = path.join(outputDir, `${baseName}.webp`);

    for (const ext of extensions) {
        const srcFile = path.join(textureDir, relativePath + ext);
        if (fs.existsSync(srcFile)) {
            return {
                found: convertSingleTexture(srcFile, destFile),
                destName: `${baseName}.webp`
            };
        }
    }

    console.warn(`Texture not found: ${relativePath} (searched in ${textureDir})`);
    return { found: false };
}

function convertTextures(usedTextures, textureDir, outputDir) {
    if (!textureDir || !fs.existsSync(textureDir)) {
        console.log('No texture directory provided or found. Skipping texture conversion.');
        return;
    }

    console.log(`Searching for textures in ${textureDir}...`);
    let convertedCount = 0;

    for (const texPath of usedTextures) {
        const relativePath = texPath.replace(/^textures\//, '');
        const result = findAndConvertTexture(relativePath, textureDir, outputDir);
        if (result.found) {
            convertedCount++;
        }
    }
    console.log(`Converted ${convertedCount} textures.`);
}

function exportLightmaps(lightmaps, outputDir, lightmapScale = 1) {
    if (!lightmaps || lightmaps.length === 0) {
        console.log('No lightmaps to export.');
        return { atlasName: null, gridSize: 0 };
    }

    // Upscale lightmaps if needed
    const upscaledLightmaps = [];
    let lightmapSize = LIGHTMAP_SIZE;

    if (lightmapScale > 1) {
        console.log(`Upscaling ${lightmaps.length} lightmaps with ${lightmapScale}x Mitchell filter...`);
        for (let i = 0; i < lightmaps.length; i++) {
            const { pixels, size } = upscaleLightmap(lightmaps[i], lightmapScale, outputDir);
            upscaledLightmaps.push(pixels);
            lightmapSize = size;
        }
    } else {
        upscaledLightmaps.push(...lightmaps);
    }

    // Calculate dynamic atlas grid size
    const gridSize = Math.ceil(Math.sqrt(upscaledLightmaps.length));
    const atlasSize = gridSize * lightmapSize;

    console.log(`Creating lightmap atlas from ${upscaledLightmaps.length} lightmaps (${gridSize}x${gridSize} grid, ${atlasSize}x${atlasSize}px)...`);

    // Create atlas buffer
    const atlasPixels = new Uint8Array(atlasSize * atlasSize * 3);
    atlasPixels.fill(0); // Initialize to black

    // Copy each lightmap into the atlas
    for (let i = 0; i < upscaledLightmaps.length; i++) {
        const gridX = i % gridSize;
        const gridY = Math.floor(i / gridSize);
        const offsetX = gridX * lightmapSize;
        const offsetY = gridY * lightmapSize;

        const lightmap = upscaledLightmaps[i];

        // Copy pixels row by row
        for (let y = 0; y < lightmapSize; y++) {
            for (let x = 0; x < lightmapSize; x++) {
                const srcIdx = (y * lightmapSize + x) * 3;
                const dstX = offsetX + x;
                // Flip Y when copying to atlas
                const dstY = offsetY + (lightmapSize - 1 - y);
                const dstIdx = (dstY * atlasSize + dstX) * 3;

                atlasPixels[dstIdx] = lightmap[srcIdx];
                atlasPixels[dstIdx + 1] = lightmap[srcIdx + 1];
                atlasPixels[dstIdx + 2] = lightmap[srcIdx + 2];
            }
        }
    }

    // Export atlas as WebP to arena root
    const atlasName = 'lightmaps.webp';
    const outputPath = path.join(outputDir, atlasName);
    const tempPPM = path.join(outputDir, 'temp_atlas.ppm');
    const ppmHeader = `P6\n${atlasSize} ${atlasSize}\n255\n`;
    const ppmData = Buffer.concat([Buffer.from(ppmHeader), Buffer.from(atlasPixels)]);

    fs.writeFileSync(tempPPM, ppmData);

    try {
        execSync(`convert "${tempPPM}" -quality 90 "${outputPath}"`);
        fs.unlinkSync(tempPPM);
        console.log(`Exported lightmap atlas: ${atlasName}`);
    } catch (e) {
        console.error('Failed to convert lightmap atlas:', e.message);
    }

    return { atlasName: atlasName, gridSize: gridSize };
}

function parseShaderFiles(shaderDir) {
    if (!fs.existsSync(shaderDir)) return new Map();

    const shaderMap = new Map();
    const files = fs.readdirSync(shaderDir).filter(f => f.endsWith('.shader'));

    for (const file of files) {
        const content = fs.readFileSync(path.join(shaderDir, file), 'utf8');
        const blocks = content.split(/^([^\s{}]+)\s*$/m);

        for (let i = 1; i < blocks.length; i += 2) {
            const name = blocks[i].trim();
            const body = blocks[i + 1];

            if (!body) continue;

            const stages = [];
            let bracketDepth = 0;
            let currentStage = '';

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

            shaderMap.set(name.toLowerCase(), stages);
        }
    }
    console.log(`Parsed ${shaderMap.size} shaders.`);
    return shaderMap;
}

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

function exportMap(vertices, meshVerts, faces, textures, lightmaps, models, lightGridRaw, outputDir, arenaName, textureDir, shaderMap, entities, scale, lightmapScale) {
    fs.mkdirSync(outputDir, { recursive: true });

    // Handle Light Grid Export
    let lightGridConfig = null;
    if (lightGridRaw && models && models.length > 0) {
        const gridPath = path.join(outputDir, 'lightgrid.bin');
        fs.writeFileSync(gridPath, lightGridRaw.data);
        console.log(`Wrote lightgrid.bin (${lightGridRaw.data.length} bytes)`);

        // Transform origin/step to Engine Coordinate System (Y-Up, Scaled)
        // Q3: X=East, Y=North, Z=Up
        // Engine: X=East, Y=Up, Z=South (scale applied)
        // Origin transformation:
        // Q3 Origin: [ox, oy, oz]
        // Engine Origin: [ox * scale, oz * scale, -oy * scale] ?? 
        // Wait, bsp2map vertices transform: x=x, y=z, z=-y

        const q3Origin = lightGridRaw.origin;
        // const engineOrigin = [
        //     q3Origin[0] * scale,
        //     q3Origin[2] * scale,
        //     -q3Origin[1] * scale
        // ];

        // Actually, we should keep the grid configuration in "BSP Space" logic for the lookup
        // but store the values scaled so the engine can convert its position to grid indices easily.
        // OR: Transform the grid origin to engine space, and store the scaled step.

        lightGridConfig = {
            origin: [
                q3Origin[0] * scale,
                q3Origin[2] * scale,
                -q3Origin[1] * scale
            ],
            // Dimensions (counts) don't change
            // But checking axis mapping: 
            // Q3: Width(x), Height(y), Depth(z) for array indexing?
            // Array index = x + y*w + z*w*h ? Check Q3 logic.
            // Q3: value = grid[ z * size[0] * size[1] + y * size[0] + x ]
            // So Z is the major outer loop, then Y, then X.

            // Engine Mapping:
            // Engine X = Q3 X
            // Engine Y = Q3 Z
            // Engine Z = -Q3 Y

            // So we need to map Engine(x,y,z) back to Q3(x,y, z) to sample.

            counts: lightGridRaw.counts, // [nx, ny, nz] in Q3 axes
            step: [
                lightGridRaw.step[0] * scale,
                lightGridRaw.step[1] * scale,
                lightGridRaw.step[2] * scale
            ]
        };
    }


    // Export lightmaps and get atlas info
    const { atlasName, gridSize } = exportLightmaps(lightmaps, outputDir, lightmapScale);

    // Group faces by BOTH texture AND lightmap
    const facesByMaterial = new Map();
    const usedTextures = new Set();

    for (const face of faces) {
        if (face.type === 1 || face.type === 3) {
            const texName = textures[face.texture];
            // Filter out sky surfaces
            if (texName.toLowerCase().includes('sky')) {
                continue;
            }

            // Create material key combining texture and lightmap
            const materialKey = `${face.texture}_${face.lm_index}`;

            if (!facesByMaterial.has(materialKey)) {
                facesByMaterial.set(materialKey, {
                    textureIndex: face.texture,
                    lightmapIndex: face.lm_index,
                    faces: []
                });
            }
            facesByMaterial.get(materialKey).faces.push(face);
            usedTextures.add(texName);
        }
    }

    // Build Mesh Data with atlas-adjusted lightmap UVs
    const flatVertices = [];
    const flatUVs = [];
    const flatLightmapUVs = [];
    const flatNormals = [];

    // Build lightmap index map for each vertex (to know which atlas region to use)
    const vertexLightmapIndex = new Array(vertices.length).fill(-1);

    // Mark vertices with their lightmap indices based on faces
    for (const [materialKey, materialData] of facesByMaterial) {
        for (const face of materialData.faces) {
            // Use meshvert indices to get actual vertex indices
            for (let i = 0; i < face.n_meshverts; i++) {
                const vertIdx = meshVerts[face.meshvert + i] + face.vertex;
                vertexLightmapIndex[vertIdx] = face.lm_index;
            }
        }
    }

    // Build vertex arrays with atlas-adjusted lightmap UVs
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        flatVertices.push(v.x, v.y, v.z);
        flatUVs.push(v.u, v.v);
        flatNormals.push(v.nx, v.ny, v.nz);

        // Transform lightmap UVs based on atlas grid position
        let lmu = v.lmu;
        let lmv = v.lmv;

        const lightmapIdx = vertexLightmapIndex[i];
        if (lightmapIdx >= 0 && gridSize > 0) {
            const gridX = lightmapIdx % gridSize;
            const gridY = Math.floor(lightmapIdx / gridSize);

            // Scale UV to fit in grid cell and offset to correct position
            lmu = (v.lmu / gridSize) + (gridX / gridSize);
            lmv = (v.lmv / gridSize) + (gridY / gridSize);
        }

        flatLightmapUVs.push(lmu, lmv);
    }

    // Build Index Groups
    const indicesGroups = [];

    for (const [materialKey, materialData] of facesByMaterial) {
        const texName = path.basename(textures[materialData.textureIndex]);
        const lightmapIndex = materialData.lightmapIndex;
        const indices = [];

        for (const face of materialData.faces) {
            for (let i = 0; i < face.n_meshverts; i += 3) {
                const idx1 = meshVerts[face.meshvert + i] + face.vertex;
                const idx2 = meshVerts[face.meshvert + i + 1] + face.vertex;
                const idx3 = meshVerts[face.meshvert + i + 2] + face.vertex;

                // Swap wind order
                indices.push(idx1, idx3, idx2);
            }
        }

        indicesGroups.push({
            material: texName,
            lightmapIndex: lightmapIndex,
            array: indices
        });
    }

    // Write level.bmesh to arena root
    // Write geometry.bmesh to arena root
    const meshData = {
        vertices: flatVertices,
        uvs: flatUVs,
        lightmapUVs: flatLightmapUVs,
        normals: flatNormals,
        indices: indicesGroups
    };

    const meshPath = path.join(outputDir, 'geometry.bmesh');
    writeBMesh(meshPath, meshData);
    console.log(`Wrote geometry.bmesh with ${flatVertices.length / 3} vertices and ${indicesGroups.length} material groups.`);

    // Create textures directory
    const texturesOutputDir = path.join(outputDir, 'textures');
    fs.mkdirSync(texturesOutputDir, { recursive: true });

    // Convert Textures
    if (textureDir) {
        convertTextures(usedTextures, textureDir, texturesOutputDir);
    }

    // Write materials.mat (deduplicate based on name + textures combination)
    const materialsData = {
        materials: []
    };

    // Add base material if using lightmaps
    if (atlasName) {
        materialsData.materials.push({
            name: "lightmapped",
            textures: {
                lightmap: `${arenaName}/${atlasName}`
            }
        });
    }

    const generatedMaterials = indicesGroups.map((group, idx) => {
        const fullPath = textures.find(t => path.basename(t) === group.material) || group.material;
        const name = group.material;
        let blendTexture = null;
        let doEmissive = 0;

        // Check Shader Definition
        if (shaderMap) {
            const shaderStages = shaderMap.get(fullPath.toLowerCase());

            if (shaderStages) {
                for (const stage of shaderStages) {
                    const lines = stage.split('\n').map(l => l.trim());
                    const isAdditive = lines.some(l =>
                        /^blendfunc\s+(add|gl_one\s+gl_one|gl_src_alpha\s+gl_one)/i.test(l)
                    );

                    if (isAdditive) {
                        const mapLine = lines.find(l => /^map\s+/i.test(l));
                        if (mapLine) {
                            let mapPath = mapLine.split(/\s+/)[1];
                            if (mapPath && mapPath !== '$lightmap' && textureDir) {
                                const relativePath = mapPath.replace(/^textures\//, '');

                                const srcFile = path.join(textureDir, relativePath);

                                if (fs.existsSync(srcFile)) {
                                    const blendBaseName = path.basename(mapPath, path.extname(mapPath));
                                    const blendDestName = `${blendBaseName}.webp`;
                                    const blendDestPath = path.join(texturesOutputDir, blendDestName);

                                    if (convertSingleTexture(srcFile, blendDestPath)) {
                                        if (!blendTexture) { // Only take first blend texture for now
                                            blendTexture = `${arenaName}/textures/${blendDestName}`;
                                            doEmissive = 1;
                                            console.log(`Found shader blend texture: ${srcFile} -> ${blendDestName}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback to filename matching if shader lookup failed
        if (textureDir && !blendTexture) {
            const relativePath = fullPath.replace(/^textures\//, '');
            const blendEXT = '.blend.tga';
            const srcFile = path.join(textureDir, relativePath + blendEXT);

            if (fs.existsSync(srcFile)) {
                const blendDestName = `${name}.blend.webp`;
                const blendDestPath = path.join(texturesOutputDir, blendDestName);

                if (convertSingleTexture(srcFile, blendDestPath)) {
                    blendTexture = `${arenaName}/textures/${blendDestName}`;
                    doEmissive = 1;
                    console.log(`Found inferred blend texture: ${srcFile}`);
                }
            }
        }

        // Build Material Definition
        const matDef = {
            name: name
        };

        // If we have an atlas, inherit from 'lightmapped' base
        if (atlasName) {
            matDef.base = "lightmapped";
        }

        matDef.textures = {
            albedo: `${arenaName}/textures/${name}.webp`
        };

        if (blendTexture) {
            matDef.textures.emissive = blendTexture;
            // doEmissive flag is not strictly needed in new system if texture is present, 
            // but we can keep it if the engine uses it for optimization. 
            // (Based on materials.mat example, 'doEmissive' is NOT present, just the texture key)
        }

        // Check for glass/transparency
        if (name.toLowerCase().includes('glass')) {
            matDef.translucent = true;
            // Optional: set default opacity if needed
            // matDef.opacity = 0.5;
        }

        return matDef;
    }).filter((mat, index, self) => {
        // Deduplicate: only keep first occurrence of each unique material name
        // (Assumes same name = same material properties)
        return index === self.findIndex(m => m.name === mat.name);
    });

    materialsData.materials.push(...generatedMaterials);
    fs.writeFileSync(path.join(outputDir, 'materials.mat'), JSON.stringify(materialsData, null, 4));

    // Extract spawn points
    const spawnpoints = [];

    if (entities) {
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

                        if (spawn.angle) {
                            const angle = parseFloat(spawn.angle);
                            rotation = [0, (angle + 90) * (Math.PI / 180), 0];
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

    // Extract pickups
    const pickups = [];

    if (entities) {
        // Mapping Quake 3 classnames to SimpleFPS pickup types
        const pickupMapping = {
            // Health
            'item_health': 'health',
            'item_health_small': 'health',
            'item_health_large': 'health',
            'item_health_mega': 'health',

            // Armor
            'item_armor_shard': 'armor',
            'item_armor_combat': 'armor',
            'item_armor_body': 'armor',

            // Ammo (map all ammo types to generic ammo)
            'ammo_shells': 'ammo',
            'ammo_bullets': 'ammo',
            'ammo_grenades': 'ammo',
            'ammo_cells': 'ammo',
            'ammo_rockets': 'ammo',
            'ammo_slugs': 'ammo',
            'ammo_lightning': 'ammo',
            'ammo_bfg': 'ammo',

            // Weapons
            'weapon_rocketlauncher': 'rocket_launcher',
            'weapon_grenadelauncher': 'rocket_launcher', // GL -> Rocket Launcher
            'weapon_lightning': 'energy_scepter', // Lightning Gun -> Energy Scepter
            'weapon_bfg': 'energy_scepter',       // BFG -> Energy Scepter
            'weapon_minigun': 'laser_gatling',   // Chaingun -> Laser Gatling
            'weapon_machinegun': 'laser_gatling', // Machinegun -> Laser Gatling
            'weapon_shotgun': 'laser_gatling',    // Shotgun -> Laser Gatling
            'weapon_railgun': 'pulse_cannon',     // Railgun -> Pulse Cannon
            'weapon_plasmagun': 'pulse_cannon'    // Plasmagun -> Pulse Cannon
        };

        const pickupEntities = entities.filter(e => pickupMapping[e.classname]);

        if (pickupEntities.length > 0) {
            console.log(`Processing ${pickupEntities.length} pickups...`);

            for (const ent of pickupEntities) {
                if (ent.origin) {
                    const parts = ent.origin.split(' ').map(Number);
                    if (parts.length === 3) {
                        const x = parts[0] * scale;
                        const y = parts[1] * scale;
                        const z = parts[2] * scale;

                        // Transform: Q3 Z-up -> Engine Y-up
                        // Note: Pickups usually originate from floor, might need slight vertical offset if pivot is at bottom
                        // converting (x, y, z) -> (x, z, -y)
                        const position = [x, z, -y];

                        pickups.push({
                            type: pickupMapping[ent.classname],
                            position: position
                        });
                    }
                }
            }
        }
    }

    // Write config.arena with simplified paths
    const configData = {
        skybox: 1,
        lighting: {
            ambient: [0.01, 0.01, 0.01],
            directional: [
                {
                    direction: [0.3, -0.8, 0.5],
                    color: [0.4, 0.5, 0.6]
                }
            ],
            spot: [],
            point: []
        },
        chunks: [`${arenaName}/geometry.bmesh`],
        spawnpoints: spawnpoints,
        pickups: pickups,
        lightGrid: lightGridConfig
    };

    fs.writeFileSync(path.join(outputDir, 'config.arena'), JSON.stringify(configData, null, 4));
    console.log(`Wrote config.arena and materials.mat to ${outputDir}`);

    // Generate map-specific resources.list
    const mapResourcesListPath = path.join(outputDir, 'resources.list');

    // Collect all assets for this map
    const mapAssets = [
        `${arenaName}/materials.mat`,
        `${arenaName}/geometry.bmesh`
    ];

    // Add lightmap atlas if present
    if (atlasName) {
        mapAssets.push(`${arenaName}/${atlasName}`);
    }

    // Add all textures (base + blend)
    materialsData.materials.forEach(mat => {
        if (mat.textures) {
            Object.values(mat.textures).forEach(tex => {
                mapAssets.push(tex);
            });
        }
    });

    // Update resources.list (deduplicate entries)
    const uniqueMapAssets = [...new Set(mapAssets)];
    const added = updateResourceList(path.join(outputDir, 'resources.list'), uniqueMapAssets);
    console.log(`Updated ${arenaName}/resources.list with ${added} new assets.`);
}

// Parse command line arguments
if (process.argv.length < 4) {
    console.log('Usage: node bsp2map.js <input.bsp> <output_dir> [texture_dir] [scale] [lightmap_scale] [overbright]');
    console.log('  output_dir: Output directory (arena name auto-derived from path)');
    console.log('  texture_dir: Optional path to textures directory');
    console.log('  scale: Optional scale factor for geometry (default: 0.03)');
    console.log('  lightmap_scale: Optional upscale factor for lightmaps (default: 2, range: 1-4)');
    console.log('  overbright: Optional brightness multiplier for lightmaps (default: 5.7)');
    process.exit(1);
}

const bspFile = process.argv[2];
const outputDir = process.argv[3];

// Auto-derive arena name from output directory
// Strip 'app/resources/' prefix if present, otherwise use the last two path segments
let arenaName = outputDir;
if (arenaName.startsWith('app/resources/')) {
    arenaName = arenaName.substring('app/resources/'.length);
} else if (arenaName.includes('/')) {
    // Fallback: use last two path segments (e.g., "arenas/demo")
    const parts = arenaName.split('/').filter(p => p.length > 0);
    arenaName = parts.slice(-2).join('/');
}

const textureDir = process.argv[4] || null;
const scale = process.argv[5] ? parseFloat(process.argv[5]) : 0.03;
const lightmapScale = process.argv[6] ? parseInt(process.argv[6]) : 2;
const overbright = process.argv[7] ? parseFloat(process.argv[7]) : 5.7;

console.log(`Auto-derived arena name: ${arenaName}`);

try {
    const { buffer, lumps } = readBSP(bspFile);

    const entities = parseEntities(buffer, lumps[LUMP_ENTITIES]);
    console.log(`Entities Parsed: ${entities.length}`);
    if (entities.length > 0) {
        console.log("First 5 entities:", entities.slice(0, 5).map(e => e.classname));
    }

    // Resolve shader directory (sibling to textures directory)
    const shaderDir = textureDir ? path.join(path.dirname(textureDir), 'scripts') : null;
    const shaderMap = shaderDir ? parseShaderFiles(shaderDir) : new Map();

    const vertices = parseVertices(buffer, lumps[LUMP_VERTEXES], scale);
    const meshVerts = parseMeshVerts(buffer, lumps[LUMP_MESHVERTS]);
    const faces = parseFaces(buffer, lumps[LUMP_FACES]);
    const textures = parseTextures(buffer, lumps[LUMP_TEXTURES]);
    const models = parseModels(buffer, lumps[LUMP_MODELS]);

    // We need the world model (index 0) to parse the light grid
    let lightGrid = null;
    if (models.length > 0) {
        // Use 2.0 scale strictly for lightgrid or 1.0? 
        // Let's try 2.0 as Q3 usually wants 2x overbright for vertex/grid lighting.
        // But 5.7 is definitely too much.
        lightGrid = parseLightGrid(buffer, lumps[LUMP_LIGHTGRID], models[0], 1.5);
    }

    const lightmaps = parseLightmaps(buffer, lumps[LUMP_LIGHTMAPS], overbright);

    exportMap(vertices, meshVerts, faces, textures, lightmaps, models, lightGrid, outputDir, arenaName, textureDir, shaderMap, entities, scale, lightmapScale);
} catch (e) {
    console.error('Conversion failed:', e);
}
