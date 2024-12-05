import { gl } from "./context.js";

class Mesh {
	// Cache attribute locations
	static ATTR_POSITIONS = 0;

	static ATTR_UVS = 1;

	static ATTR_NORMALS = 2;

	constructor(data, context) {
		this.resources = context;

		if (data instanceof Blob) {
			this.loadFromBlob(data).then(() => {
				this.initMeshBuffers();
			});
		} else {
			this.loadFromJson(data);
			this.initMeshBuffers();
		}
	}

	static buildBuffer(type, data, itemSize) {
		const buffer = gl.createBuffer();
		const ArrayView = type === gl.ARRAY_BUFFER ? Float32Array : Uint16Array;
		const typedArray = new ArrayView(data);
		gl.bindBuffer(type, buffer);
		gl.bufferData(type, typedArray, gl.STATIC_DRAW);
		buffer.itemSize = itemSize;
		buffer.numItems = data.length / itemSize;
		return buffer;
	}

	initMeshBuffers() {
		// Pre-calculate buffer data
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;

		for (const indexObj of this.indices) {
			indexObj.indexBuffer = Mesh.buildBuffer(
				gl.ELEMENT_ARRAY_BUFFER,
				indexObj.array,
				1,
			);
		}
		this.vertexBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, this.vertices, 3);

		if (this.hasUVs) {
			this.uvBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, this.uvs, 2);
		}
		if (this.hasNormals) {
			this.normalBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, this.normals, 3);
		}
	}

	deleteMeshBuffers() {
		for (const indexObj of this.indices) {
			gl.deleteBuffer(indexObj.indexBuffer);
		}
		gl.deleteBuffer(this.vertexBuffer);
		if (this.hasUVs) gl.deleteBuffer(this.uvBuffer);
		if (this.hasNormals) gl.deleteBuffer(this.normalBuffer);
	}

	bind() {
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.vertexAttribPointer(
			Mesh.ATTR_POSITIONS,
			this.vertexBuffer.itemSize,
			gl.FLOAT,
			false,
			0,
			0,
		);
		gl.enableVertexAttribArray(Mesh.ATTR_POSITIONS);

		if (this.hasUVs) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
			gl.vertexAttribPointer(
				Mesh.ATTR_UVS,
				this.uvBuffer.itemSize,
				gl.FLOAT,
				false,
				0,
				0,
			);
			gl.enableVertexAttribArray(Mesh.ATTR_UVS);
		}

		if (this.hasNormals) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
			gl.vertexAttribPointer(
				Mesh.ATTR_NORMALS,
				this.normalBuffer.itemSize,
				gl.FLOAT,
				false,
				0,
				0,
			);
			gl.enableVertexAttribArray(Mesh.ATTR_NORMALS);
		}
	}

	unBind() {
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		gl.disableVertexAttribArray(Mesh.ATTR_POSITIONS);
		if (this.hasUVs) gl.disableVertexAttribArray(Mesh.ATTR_UVS);
		if (this.hasNormals) gl.disableVertexAttribArray(Mesh.ATTR_NORMALS);
	}

	renderSingle(applyMaterial = true) {
		this.bind();
		this.renderIndices(applyMaterial);
		this.unBind();
	}

	renderMany(count, applyMaterial = true) {
		this.bind();
		this.renderIndicesInstanced(count, applyMaterial);
		this.unBind();
	}

	// Private helper methods
	renderIndices(applyMaterial) {
		for (const indexObj of this.indices) {
			this.bindMaterial(indexObj, applyMaterial);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
			gl.drawElements(
				gl.TRIANGLES,
				indexObj.indexBuffer.numItems,
				gl.UNSIGNED_SHORT,
				0,
			);
		}
	}

	renderIndicesInstanced(count, applyMaterial) {
		for (const indexObj of this.indices) {
			this.bindMaterial(indexObj, applyMaterial);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
			gl.drawElementsInstanced(
				gl.TRIANGLES,
				indexObj.indexBuffer.numItems,
				gl.UNSIGNED_SHORT,
				0,
				count,
			);
		}
	}

	bindMaterial(indexObj, applyMaterial) {
		if (indexObj.material !== "none" && applyMaterial && this.resources) {
			this.resources.get(indexObj.material).bind();
		}
	}

	async loadFromBlob(blob) {
		// Convert blob to ArrayBuffer
		const arrayBuffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let offset = 0;

		// Helper function to read uint32
		const readUint32 = () => {
			const value = bytes[offset] | 
						 (bytes[offset + 1] << 8) | 
						 (bytes[offset + 2] << 16) | 
						 (bytes[offset + 3] << 24);
			offset += 4;
			return value;
		};

		// Helper function to read float32 array
		const readFloat32Array = (count) => {
			if (count === 0) return [];
			const floatArray = Array.from(new Float32Array(
				bytes.buffer,
				bytes.byteOffset + offset,
				count
			));
			offset += count * 4;
			return floatArray;
		};

		// Read header
		const version = readUint32();
		const vertexCount = readUint32();
		const uvCount = readUint32();
		const normalCount = readUint32();
		const indexGroupCount = readUint32();

		// Read data
		this.vertices = readFloat32Array(vertexCount);
		this.uvs = readFloat32Array(uvCount);
		this.normals = readFloat32Array(normalCount);

		// Read index groups with materials
		this.indices = [];
		const MATERIAL_NAME_SIZE = 64;

		for (let i = 0; i < indexGroupCount; i++) {
			// Read material name
			const materialNameBytes = bytes.slice(offset, offset + MATERIAL_NAME_SIZE);
			let materialName = '';
			for (let j = 0; j < MATERIAL_NAME_SIZE && materialNameBytes[j] !== 0; j++) {
				materialName += String.fromCharCode(materialNameBytes[j]);
			}
			offset += MATERIAL_NAME_SIZE;

			// Read indices
			const indexCount = readUint32();
			if (indexCount === 0) continue;

			const indexArrayBuffer = bytes.buffer.slice(
				bytes.byteOffset + offset,
				bytes.byteOffset + offset + indexCount * 4
			);
			const indexArray = Array.from(new Uint32Array(indexArrayBuffer));
			offset += indexCount * 4;

			this.indices.push({
				array: indexArray,
				material: materialName || 'none'
			});
		}
	}

	loadFromJson(data) {
		// Your existing JSON loading logic here
		this.vertices = data.vertices;
		this.uvs = data.uvs?.length > 0 ? data.uvs : [];
		this.normals = data.normals?.length > 0 ? data.normals : [];
		this.indices = data.indices;
	}
}

export default Mesh;
