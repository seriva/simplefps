#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const MATERIAL_NAME_SIZE = 64;

const convertMeshToBMesh = (inputPath) => {
    // Read and parse the JSON mesh file
    const meshData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // Calculate buffer sizes
    const headerSize = 20; // 5 uint32 values
    const verticesSize = meshData.vertices.length * 4;
    const uvsSize = (meshData.uvs?.length || 0) * 4;
    const normalsSize = (meshData.normals?.length || 0) * 4;

    // Calculate indices size
    let totalIndicesCount = 0;
    const materialsSize = meshData.indices.length * MATERIAL_NAME_SIZE;
    meshData.indices.forEach(indexGroup => {
        totalIndicesCount += indexGroup.array.length;
    });
    const indicesSize = materialsSize +                  // Material names
                       (4 * meshData.indices.length) +   // Size prefixes for each group
                       (4 * totalIndicesCount);          // The indices themselves

    const totalSize = headerSize + verticesSize + uvsSize + normalsSize + indicesSize;

    console.log('Converting mesh to bmesh:', {
        file: path.basename(inputPath),
        headerSize,
        verticesSize,
        verticesCount: meshData.vertices.length,
        uvsSize,
        uvsCount: meshData.uvs?.length || 0,
        normalsSize,
        normalsCount: meshData.normals?.length || 0,
        indicesSize,
        materialsSize,
        totalIndicesCount,
        totalSize
    });

    // Create buffer
    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write header
    buffer.writeUInt32LE(1, offset); // Version 1
    offset += 4;
    buffer.writeUInt32LE(meshData.vertices.length, offset);
    offset += 4;
    buffer.writeUInt32LE(meshData.uvs?.length || 0, offset);
    offset += 4;
    buffer.writeUInt32LE(meshData.normals?.length || 0, offset);
    offset += 4;
    buffer.writeUInt32LE(meshData.indices.length, offset);
    offset += 4;

    // Write vertices
    meshData.vertices.forEach(vertex => {
        buffer.writeFloatLE(vertex, offset);
        offset += 4;
    });

    // Write UVs
    if (meshData.uvs?.length) {
        meshData.uvs.forEach(uv => {
            buffer.writeFloatLE(uv, offset);
            offset += 4;
        });
    }

    // Write normals
    if (meshData.normals?.length) {
        meshData.normals.forEach(normal => {
            buffer.writeFloatLE(normal, offset);
            offset += 4;
        });
    }

    // Write indices with materials
    meshData.indices.forEach(indexGroup => {
        // Write material name in fixed-size block
        const materialName = indexGroup.material || '';
        buffer.fill(0, offset, offset + MATERIAL_NAME_SIZE); // Clear the block
        buffer.write(materialName, offset, Math.min(materialName.length, MATERIAL_NAME_SIZE));
        offset += MATERIAL_NAME_SIZE;

        // Write number of indices in this group
        buffer.writeUInt32LE(indexGroup.array.length, offset);
        offset += 4;

        // Write the indices
        indexGroup.array.forEach(index => {
            buffer.writeUInt32LE(index, offset);
            offset += 4;
        });
    });

    // Write to file
    const outputPath = inputPath.replace('.mesh', '.bmesh');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Converted ${path.basename(inputPath)} to ${path.basename(outputPath)}`);
};

const processPath = (inputPath) => {
    const stats = fs.statSync(inputPath);

    if (stats.isDirectory()) {
        console.log(`Processing directory: ${inputPath}`);
        const files = fs.readdirSync(inputPath);
        let convertedCount = 0;
        let errorCount = 0;

        files.forEach(file => {
            if (file.endsWith('.mesh')) {
                const fullPath = path.join(inputPath, file);
                try {
                    convertMeshToBMesh(fullPath);
                    convertedCount++;
                } catch (error) {
                    console.error(`Error converting ${file}:`, error);
                    errorCount++;
                }
            }
        });

        console.log(`\nDirectory processing complete:`);
        console.log(`- ${convertedCount} files converted successfully`);
        if (errorCount > 0) {
            console.log(`- ${errorCount} files failed to convert`);
        }
    } else if (stats.isFile() && inputPath.endsWith('.mesh')) {
        convertMeshToBMesh(inputPath);
    } else {
        console.error('Input path must be a .mesh file or a directory containing .mesh files');
        process.exit(1);
    }
};

// Handle command line arguments
if (process.argv.length > 2) {
    const inputPath = process.argv[2];
    try {
        processPath(inputPath);
    } catch (error) {
        console.error('Error processing path:', error);
        process.exit(1);
    }
} else {
    console.error('Please provide a .mesh file or directory path');
    process.exit(1);
}

export { convertMeshToBMesh, processPath };