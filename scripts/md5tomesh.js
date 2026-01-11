#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const MATERIAL_NAME_SIZE = 64;

// ============================================================================
// MD5MESH Parser
// ============================================================================

function parseMD5Mesh(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    const result = {
        joints: [],
        meshes: []
    };

    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('MD5Version')) {
            const version = parseInt(line.split(/\s+/)[1]);
            if (version !== 10) {
                console.warn(`Warning: MD5 version ${version}, expected 10`);
            }
        } else if (line.startsWith('numJoints')) {
            // Just informational, we'll count as we parse
        } else if (line.startsWith('numMeshes')) {
            // Just informational
        } else if (line.startsWith('joints {')) {
            i++;
            while (i < lines.length && lines[i] !== '}') {
                const joint = parseJoint(lines[i]);
                if (joint) result.joints.push(joint);
                i++;
            }
        } else if (line.startsWith('mesh {')) {
            i++;
            const mesh = { verts: [], tris: [], weights: [], material: '' };

            while (i < lines.length && lines[i] !== '}') {
                const meshLine = lines[i];

                if (meshLine.startsWith('shader')) {
                    // shader "path/to/material"
                    const match = meshLine.match(/shader\s+"([^"]+)"/);
                    mesh.material = match ? path.basename(match[1]) : 'default';
                } else if (meshLine.startsWith('vert')) {
                    const vert = parseVert(meshLine);
                    if (vert) mesh.verts.push(vert);
                } else if (meshLine.startsWith('tri')) {
                    const tri = parseTri(meshLine);
                    if (tri) mesh.tris.push(tri);
                } else if (meshLine.startsWith('weight')) {
                    const weight = parseWeight(meshLine);
                    if (weight) mesh.weights.push(weight);
                }
                i++;
            }
            result.meshes.push(mesh);
        }
        i++;
    }

    return result;
}

function parseJoint(line) {
    // "name" parentIndex ( px py pz ) ( qx qy qz )
    const match = line.match(/"([^"]+)"\s+(-?\d+)\s+\(\s*([^\)]+)\s*\)\s+\(\s*([^\)]+)\s*\)/);
    if (!match) return null;

    const pos = match[3].trim().split(/\s+/).map(Number);
    const rot = match[4].trim().split(/\s+/).map(Number);

    // MD5 stores quaternion as (x, y, z), we need to compute w
    const qx = rot[0], qy = rot[1], qz = rot[2];
    const t = 1.0 - qx * qx - qy * qy - qz * qz;
    const qw = t < 0 ? 0 : -Math.sqrt(t);

    return {
        name: match[1],
        parent: parseInt(match[2]),
        pos: pos,
        rot: [qx, qy, qz, qw]
    };
}

function parseVert(line) {
    // vert vertIndex ( u v ) startWeight countWeight
    const match = line.match(/vert\s+(\d+)\s+\(\s*([^\)]+)\s*\)\s+(\d+)\s+(\d+)/);
    if (!match) return null;

    const uv = match[2].trim().split(/\s+/).map(Number);
    return {
        index: parseInt(match[1]),
        index: parseInt(match[1]),
        uv: [uv[0], uv[1]], // Keep original V (engine might need flip or not, testing no-flip)
        startWeight: parseInt(match[3]),
        countWeight: parseInt(match[4])
    };
}

function parseTri(line) {
    // tri triIndex v0 v1 v2
    const match = line.match(/tri\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (!match) return null;
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function parseWeight(line) {
    // weight weightIndex jointIndex bias ( px py pz )
    const match = line.match(/weight\s+(\d+)\s+(\d+)\s+([^\s]+)\s+\(\s*([^\)]+)\s*\)/);
    if (!match) return null;

    const pos = match[4].trim().split(/\s+/).map(Number);
    return {
        index: parseInt(match[1]),
        joint: parseInt(match[2]),
        bias: parseFloat(match[3]),
        pos: pos
    };
}

// ============================================================================
// MD5ANIM Parser
// ============================================================================

function parseMD5Anim(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    const result = {
        frameRate: 24,
        numFrames: 0,
        numJoints: 0,
        hierarchy: [],
        baseframe: [],
        frames: []
    };

    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('frameRate')) {
            result.frameRate = parseInt(line.split(/\s+/)[1]);
        } else if (line.startsWith('numFrames')) {
            result.numFrames = parseInt(line.split(/\s+/)[1]);
        } else if (line.startsWith('numJoints')) {
            result.numJoints = parseInt(line.split(/\s+/)[1]);
        } else if (line.startsWith('hierarchy {')) {
            i++;
            while (i < lines.length && lines[i] !== '}') {
                const h = parseHierarchy(lines[i]);
                if (h) result.hierarchy.push(h);
                i++;
            }
        } else if (line.startsWith('baseframe {')) {
            i++;
            while (i < lines.length && lines[i] !== '}') {
                const bf = parseBaseframe(lines[i]);
                if (bf) result.baseframe.push(bf);
                i++;
            }
        } else if (line.startsWith('frame ')) {
            const frameMatch = line.match(/frame\s+(\d+)\s*\{/);
            if (frameMatch) {
                const frameIndex = parseInt(frameMatch[1]);
                const frameData = [];
                i++;
                while (i < lines.length && lines[i] !== '}') {
                    const values = lines[i].split(/\s+/).filter(v => v).map(Number);
                    frameData.push(...values);
                    i++;
                }
                result.frames[frameIndex] = frameData;
            }
        }
        i++;
    }

    return result;
}

function parseHierarchy(line) {
    // "name" parent flags startIndex
    const match = line.match(/"([^"]+)"\s+(-?\d+)\s+(\d+)\s+(\d+)/);
    if (!match) return null;

    return {
        name: match[1],
        parent: parseInt(match[2]),
        flags: parseInt(match[3]),
        startIndex: parseInt(match[4])
    };
}

function parseBaseframe(line) {
    // ( px py pz ) ( qx qy qz )
    const match = line.match(/\(\s*([^\)]+)\s*\)\s+\(\s*([^\)]+)\s*\)/);
    if (!match) return null;

    const pos = match[1].trim().split(/\s+/).map(Number);
    const rot = match[2].trim().split(/\s+/).map(Number);

    return { pos, rot };
}

// ============================================================================
// Build animation frames with proper joint transforms
// ============================================================================

function buildAnimationFrames(anim) {
    const frames = [];

    for (let f = 0; f < anim.numFrames; f++) {
        const frameData = anim.frames[f] || [];
        const joints = [];

        for (let j = 0; j < anim.numJoints; j++) {
            const hierarchy = anim.hierarchy[j];
            const baseframe = anim.baseframe[j];

            // Start with baseframe values
            const pos = [...baseframe.pos];
            const rot = [...baseframe.rot];

            // Apply animated components based on flags
            let dataIndex = hierarchy.startIndex;
            const flags = hierarchy.flags;

            if (flags & 1) pos[0] = frameData[dataIndex++];
            if (flags & 2) pos[1] = frameData[dataIndex++];
            if (flags & 4) pos[2] = frameData[dataIndex++];
            if (flags & 8) rot[0] = frameData[dataIndex++];
            if (flags & 16) rot[1] = frameData[dataIndex++];
            if (flags & 32) rot[2] = frameData[dataIndex++];

            // Compute quaternion W component
            const qx = rot[0], qy = rot[1], qz = rot[2];
            const t = 1.0 - qx * qx - qy * qy - qz * qz;
            const qw = t < 0 ? 0 : -Math.sqrt(t); // Use Negative W (Standard) - Conversion to Local handles the rest

            joints.push({
                pos: pos,
                rot: [qx, qy, qz, qw]
            });
        }

        frames.push({ joints });
    }

    return frames;
}

// ============================================================================
// Compute bind pose vertices from weights
// ============================================================================

function computeBindPoseVertices(md5mesh) {
    const allVertices = [];
    const allUVs = [];
    const allNormals = [];
    const allIndices = [];
    const allWeights = [];

    let vertexOffset = 0;

    for (const mesh of md5mesh.meshes) {
        const vertices = [];
        const normals = [];

        // Compute vertex positions in bind pose
        for (const vert of mesh.verts) {
            let px = 0, py = 0, pz = 0;
            const weightData = { vertex: vertexOffset + vert.index, joints: [], weights: [], positions: [] };

            for (let w = 0; w < vert.countWeight; w++) {
                const weight = mesh.weights[vert.startWeight + w];
                const joint = md5mesh.joints[weight.joint];

                // Transform weight position by joint
                const rotatedPos = quaternionRotate(joint.rot, weight.pos);

                px += weight.bias * (joint.pos[0] + rotatedPos[0]);
                py += weight.bias * (joint.pos[1] + rotatedPos[1]);
                pz += weight.bias * (joint.pos[2] + rotatedPos[2]);

                weightData.joints.push(weight.joint);
                weightData.weights.push(weight.bias);
                weightData.positions.push([...weight.pos]); // Store weight position offset
            }

            vertices.push(px, py, pz);
            normals.push(0, 1, 0); // Placeholder normals
            allUVs.push(vert.uv[0], vert.uv[1]);
            allWeights.push(weightData);
        }

        // Compute face normals and accumulate to vertices
        const vertexNormals = new Array(mesh.verts.length).fill(null).map(() => [0, 0, 0]);

        for (const tri of mesh.tris) {
            const i0 = tri[0], i1 = tri[1], i2 = tri[2];

            const v0 = [vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]];
            const v1 = [vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]];
            const v2 = [vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]];

            const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
            const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

            const normal = [
                edge1[1] * edge2[2] - edge1[2] * edge2[1],
                edge1[2] * edge2[0] - edge1[0] * edge2[2],
                edge1[0] * edge2[1] - edge1[1] * edge2[0]
            ];

            for (const idx of tri) {
                vertexNormals[idx][0] += normal[0];
                vertexNormals[idx][1] += normal[1];
                vertexNormals[idx][2] += normal[2];
            }
        }

        // Normalize and store
        for (let v = 0; v < mesh.verts.length; v++) {
            const n = vertexNormals[v];
            const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
            allNormals.push(n[0] / len, n[1] / len, n[2] / len);
        }

        allVertices.push(...vertices);

        // Offset indices for this mesh
        const indexObj = {
            material: mesh.material || 'default',
            // Reverse winding order: i0, i2, i1
            array: mesh.tris.map(t => [t[0], t[2], t[1]]).flat().map(i => i + vertexOffset)
        };
        allIndices.push(indexObj);

        vertexOffset += mesh.verts.length;
    }

    return {
        vertices: allVertices,
        uvs: allUVs,
        normals: allNormals,
        indices: allIndices,
        weights: allWeights
    };
}

function quaternionRotate(q, v) {
    // Rotate vector v by quaternion q
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const vx = v[0], vy = v[1], vz = v[2];

    // q * v * q^-1 (optimized)
    const ix = qw * vx + qy * vz - qz * vy;
    const iy = qw * vy + qz * vx - qx * vz;
    const iz = qw * vz + qx * vy - qy * vx;
    const iw = -qx * vx - qy * vy - qz * vz;

    return [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
}

// ============================================================================
// Output Formats
// ============================================================================

function saveMeshJson(meshData, outputPath) {
    const json = JSON.stringify(meshData, null, 2);
    fs.writeFileSync(outputPath, json);
    console.log(`Created: ${outputPath}`);
}

function saveAnimJson(animData, outputPath) {
    const json = JSON.stringify(animData, null, 2);
    fs.writeFileSync(outputPath, json);
    console.log(`Created: ${outputPath}`);
}

function saveMeshBinary(meshData, outputPath) {
    // Calculate sizes
    const vertexCount = meshData.vertices.length;
    const uvCount = meshData.uvs.length;
    const normalCount = meshData.normals.length;
    const totalIndicesCount = meshData.indices.reduce((sum, g) => sum + g.array.length, 0);

    // Skeleton data
    const joints = meshData.skeleton?.joints || [];
    const weights = meshData.weights || [];
    const hasSkeletalData = joints.length > 0;

    // Calculate joint names total size (null-terminated strings)
    let jointNamesTotalSize = 0;
    for (const joint of joints) {
        jointNamesTotalSize += joint.name.length + 1; // +1 for null terminator
    }

    // Calculate weights size: for each weight entry, we store vertex index, count, then (joint, weight) pairs
    let weightsDataSize = 0;
    for (const w of weights) {
        weightsDataSize += 4 + 4 + w.joints.length * (4 + 4 + 12); // vertex(4) + count(4) + N*(joint(4)+weight(4)+pos(12))
    }

    // Header: version(4) + vertexCount(4) + uvCount(4) + lightmapUVCount(4) + normalCount(4) + indexGroupCount(4)
    //         + skeletalFlag(4) + jointCount(4) + weightCount(4)
    const headerSize = hasSkeletalData ? 36 : 24;

    // Joint data: parentIndex(4) + pos(12) + rot(16) per joint + joint names
    const jointDataSize = joints.length * (4 + 12 + 16) + jointNamesTotalSize;

    const bufferSize = headerSize +
        vertexCount * 4 +
        uvCount * 4 +
        normalCount * 4 +
        meshData.indices.length * (MATERIAL_NAME_SIZE + 4) +
        totalIndicesCount * 4 +
        (hasSkeletalData ? jointDataSize + weightsDataSize : 0);

    const buffer = Buffer.alloc(bufferSize);
    let offset = 0;

    const writeU32 = v => { buffer.writeUInt32LE(v, offset); offset += 4; };
    const writeI32 = v => { buffer.writeInt32LE(v, offset); offset += 4; };
    const writeF32 = v => { buffer.writeFloatLE(v, offset); offset += 4; };
    const writeF32Array = arr => {
        for (const v of arr) writeF32(v);
    };

    // Header
    writeU32(hasSkeletalData ? 3 : 1); // version 3 = skeletal mesh
    writeU32(vertexCount);
    writeU32(uvCount);
    writeU32(0); // lightmapUVCount
    writeU32(normalCount);
    writeU32(meshData.indices.length);

    if (hasSkeletalData) {
        writeU32(joints.length);
        writeU32(weights.length);
    }

    // Vertex data
    writeF32Array(meshData.vertices);
    writeF32Array(meshData.uvs);
    writeF32Array(meshData.normals);

    // Index groups
    for (const { material = '', array } of meshData.indices) {
        buffer.fill(0, offset, offset + MATERIAL_NAME_SIZE);
        buffer.write(material, offset, Math.min(material.length, MATERIAL_NAME_SIZE));
        offset += MATERIAL_NAME_SIZE;
        writeU32(array.length);
        for (const idx of array) writeU32(idx);
    }

    // Skeletal data
    if (hasSkeletalData) {
        // Joints
        for (const joint of joints) {
            writeI32(joint.parent);
            writeF32Array(joint.pos);
            writeF32Array(joint.rot);
        }

        // Joint names (null-terminated)
        for (const joint of joints) {
            buffer.write(joint.name + '\0', offset);
            offset += joint.name.length + 1;
        }

        // Weights
        for (const w of weights) {
            writeU32(w.vertex);
            writeU32(w.joints.length);
            for (let i = 0; i < w.joints.length; i++) {
                writeU32(w.joints[i]);
                writeF32(w.weights[i]);
                writeF32Array(w.positions[i]); // Write weight position offset
            }
        }
    }

    fs.writeFileSync(outputPath, buffer.slice(0, offset));
    console.log(`Created: ${outputPath}`);
}

function saveAnimBinary(animData, outputPath) {
    const numFrames = animData.frames.length;
    const numJoints = animData.frames[0]?.joints.length || 0;

    // Header: frameRate(4) + numFrames(4) + numJoints(4)
    // Frame data: numJoints * (pos(12) + rot(16)) per frame
    const frameSize = numJoints * (12 + 16);
    const bufferSize = 12 + numFrames * frameSize;

    const buffer = Buffer.alloc(bufferSize);
    let offset = 0;

    const writeU32 = v => { buffer.writeUInt32LE(v, offset); offset += 4; };
    const writeF32 = v => { buffer.writeFloatLE(v, offset); offset += 4; };

    writeU32(animData.frameRate);
    writeU32(numFrames);
    writeU32(numJoints);

    for (const frame of animData.frames) {
        for (const joint of frame.joints) {
            writeF32(joint.pos[0]);
            writeF32(joint.pos[1]);
            writeF32(joint.pos[2]);
            writeF32(joint.rot[0]);
            writeF32(joint.rot[1]);
            writeF32(joint.rot[2]);
            writeF32(joint.rot[3]);
        }
    }

    fs.writeFileSync(outputPath, buffer);
    console.log(`Created: ${outputPath}`);
}

// ============================================================================
// Main
// ============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    let md5meshPath = null;
    const animPaths = [];
    let outputBinary = false;
    let scale = 1.0;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--bmesh' || arg === '-b') {
            outputBinary = true;
        } else if (arg === '--scale' || arg === '-s') {
            scale = parseFloat(args[++i]) || 1.0;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: node md5tomesh.js [options] <model.md5mesh> [anim1.md5anim ...]

Options:
  --bmesh, -b       Output binary .bmesh and .banim (default: JSON)
  --scale, -s <n>   Scale factor for vertices (default: 1.0)
  --help, -h        Show this help

Examples:
  node md5tomesh.js model.md5mesh
  node md5tomesh.js --bmesh model.md5mesh walk.md5anim idle.md5anim
            `);
            process.exit(0);
        } else if (arg.endsWith('.md5mesh')) {
            md5meshPath = arg;
        } else if (arg.endsWith('.md5anim')) {
            animPaths.push(arg);
        }
    }

    if (!md5meshPath) {
        console.error('Error: Please provide a .md5mesh file');
        process.exit(1);
    }

    return { md5meshPath, animPaths, outputBinary, scale };
}

function main() {
    const { md5meshPath, animPaths, outputBinary, scale } = parseArgs();

    // Setup output directory
    const inputDir = path.dirname(md5meshPath);
    const baseName = path.basename(md5meshPath, '.md5mesh');
    const outputDir = path.join(inputDir, baseName);
    fs.mkdirSync(outputDir, { recursive: true });

    // Parse mesh
    console.log(`Parsing: ${md5meshPath}`);
    const md5mesh = parseMD5Mesh(fs.readFileSync(md5meshPath, 'utf8'));

    // Apply scale
    if (scale !== 1.0) {
        for (const joint of md5mesh.joints) {
            joint.pos[0] *= scale;
            joint.pos[1] *= scale;
            joint.pos[2] *= scale;
        }
        for (const mesh of md5mesh.meshes) {
            for (const weight of mesh.weights) {
                weight.pos[0] *= scale;
                weight.pos[1] *= scale;
                weight.pos[2] *= scale;
            }
        }
    }

    // Compute bind pose mesh
    const meshData = computeBindPoseVertices(md5mesh);

    // Add skeleton
    meshData.skeleton = {
        joints: md5mesh.joints.map(j => ({
            name: j.name,
            parent: j.parent,
            pos: j.pos,
            rot: j.rot
        }))
    };

    // Save mesh
    const meshExt = outputBinary ? '.sbmesh' : '.smesh';
    const meshPath = path.join(outputDir, baseName + meshExt);

    if (outputBinary) {
        saveMeshBinary(meshData, meshPath);
    } else {
        saveMeshJson(meshData, meshPath);
    }

    // Generate material template file
    const materialNames = new Set();
    for (const mesh of md5mesh.meshes) {
        if (mesh.material && mesh.material !== 'default') {
            materialNames.add(mesh.material);
        }
    }

    const materialsData = {
        materials: Array.from(materialNames).map(name => ({
            name: name,
            textures: {
                albedo: `models/${baseName}/${name}_diffuse.webp`
            }
        }))
    };

    // Add a default material if no materials were found
    if (materialsData.materials.length === 0) {
        materialsData.materials.push({
            name: baseName,
            textures: {
                albedo: `models/${baseName}/${baseName}_diffuse.webp`
            }
        });
    }

    const matPath = path.join(outputDir, 'materials.mat');
    fs.writeFileSync(matPath, JSON.stringify(materialsData, null, 4));
    console.log(`Created: ${matPath}`);

    // Parse and save animations
    for (const animPath of animPaths) {
        console.log(`Parsing: ${animPath}`);
        const animName = path.basename(animPath, '.md5anim');
        const md5anim = parseMD5Anim(fs.readFileSync(animPath, 'utf8'));

        // Build frames
        const frames = buildAnimationFrames(md5anim);

        // Apply scale to animation positions
        if (scale !== 1.0) {
            for (const frame of frames) {
                for (const joint of frame.joints) {
                    joint.pos[0] *= scale;
                    joint.pos[1] *= scale;
                    joint.pos[2] *= scale;
                }
            }
        }

        const animData = {
            name: animName,
            frameRate: md5anim.frameRate,
            frames: frames
        };

        const animExt = outputBinary ? '.banim' : '.anim';
        const animOutPath = path.join(outputDir, animName + animExt);

        if (outputBinary) {
            saveAnimBinary(animData, animOutPath);
        } else {
            saveAnimJson(animData, animOutPath);
        }
    }

    // Generate .list file for easy resource loading
    const resourcePaths = [];
    const meshExt2 = outputBinary ? '.sbmesh' : '.smesh';

    // Add material file first
    resourcePaths.push(`models/${baseName}/materials.mat`);
    resourcePaths.push(`models/${baseName}/${baseName}${meshExt2}`);

    for (const animPath of animPaths) {
        const animName = path.basename(animPath, '.md5anim');
        const animExt = outputBinary ? '.banim' : '.anim';
        resourcePaths.push(`models/${baseName}/${animName}${animExt}`);
    }

    const listData = { resources: resourcePaths };
    const listPath = path.join(outputDir, baseName + '.list');
    fs.writeFileSync(listPath, JSON.stringify(listData, null, 2));
    console.log(`Created: ${listPath}`);

    console.log('Done!');
}

main();

