import BoundingBox from "./boundingbox.js";
import { gl } from "./context.js";

class Mesh {
	static ATTR_POSITIONS = 0;
	static ATTR_UVS = 1;
	static ATTR_NORMALS = 2;

	constructor(data, context) {
		this.resources = context;
		this.initialize(data);
	}

	async initialize(data) {
		if (data instanceof Blob) {
			await this.loadFromBlob(data);
		} else {
			this.loadFromJson(data);
		}
		this.initMeshBuffers();
		this.boundingBox = this.calculateBoundingBox();
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
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;
		this.triangleCount = 0;

		for (const indexObj of this.indices) {
			indexObj.indexBuffer = Mesh.buildBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.array, 1);
			this.triangleCount += indexObj.array.length / 3;
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
		this.bindBufferAndAttrib(this.vertexBuffer, Mesh.ATTR_POSITIONS, 3);
		if (this.hasUVs) this.bindBufferAndAttrib(this.uvBuffer, Mesh.ATTR_UVS, 2);
		if (this.hasNormals) this.bindBufferAndAttrib(this.normalBuffer, Mesh.ATTR_NORMALS, 3);
	}

	bindBufferAndAttrib(buffer, attribute, itemSize) {
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.vertexAttribPointer(attribute, itemSize, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(attribute);
	}

	unBind() {
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		gl.disableVertexAttribArray(Mesh.ATTR_POSITIONS);
		if (this.hasUVs) gl.disableVertexAttribArray(Mesh.ATTR_UVS);
		if (this.hasNormals) gl.disableVertexAttribArray(Mesh.ATTR_NORMALS);
	}

	renderSingle(applyMaterial = true, renderMode = gl.TRIANGLES) {
		this.bind();
		this.renderIndices(applyMaterial, renderMode);
		this.unBind();
	}

	renderIndices(applyMaterial, renderMode = gl.TRIANGLES) {
		for (const indexObj of this.indices) {
			this.bindMaterial(indexObj, applyMaterial);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
			gl.drawElements(renderMode, indexObj.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
		}
	}

	renderWireFrame() {
		this.bind();

		for (const indexObj of this.indices) {
			// Each triangle (3 indices) becomes 3 lines (6 indices)
			const tempArray = new Uint16Array(indexObj.array.length * 2);
			let lineCount = 0;
			const indices = indexObj.array;

			for (let i = 0; i < indices.length; i += 3) {
				tempArray[lineCount++] = indices[i];
				tempArray[lineCount++] = indices[i + 1];
				tempArray[lineCount++] = indices[i + 1];
				tempArray[lineCount++] = indices[i + 2];
				tempArray[lineCount++] = indices[i + 2];
				tempArray[lineCount++] = indices[i];
			}

			// Create and use a temporary buffer
			const tempBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tempBuffer);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tempArray.subarray(0, lineCount), gl.STREAM_DRAW);
			gl.drawElements(gl.LINES, lineCount, gl.UNSIGNED_SHORT, 0);
			gl.deleteBuffer(tempBuffer);
		}

		this.unBind();
	}

	bindMaterial(indexObj, applyMaterial) {
		if (indexObj.material !== "none" && applyMaterial && this.resources) {
			this.resources.get(indexObj.material).bind();
		}
	}

	async loadFromBlob(blob) {
		const arrayBuffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let offset = 0;

		const readUint32 = () => {
			const value = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
			offset += 4;
			return value;
		};

		const readFloat32Array = (count) => {
			if (count === 0) return [];
			const floatArray = Array.from(new Float32Array(bytes.buffer, bytes.byteOffset + offset, count));
			offset += count * 4;
			return floatArray;
		};

		const version = readUint32();
		const vertexCount = readUint32();
		const uvCount = readUint32();
		const normalCount = readUint32();
		const indexGroupCount = readUint32();

		this.vertices = readFloat32Array(vertexCount);
		this.uvs = readFloat32Array(uvCount);
		this.normals = readFloat32Array(normalCount);

		this.indices = [];
		const MATERIAL_NAME_SIZE = 64;

		for (let i = 0; i < indexGroupCount; i++) {
			const materialNameBytes = bytes.slice(offset, offset + MATERIAL_NAME_SIZE);
			let materialName = '';
			for (let j = 0; j < MATERIAL_NAME_SIZE && materialNameBytes[j] !== 0; j++) {
				materialName += String.fromCharCode(materialNameBytes[j]);
			}
			offset += MATERIAL_NAME_SIZE;

			const indexCount = readUint32();
			if (indexCount === 0) continue;

			const indexArrayBuffer = bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + indexCount * 4);
			const indexArray = Array.from(new Uint32Array(indexArrayBuffer));
			offset += indexCount * 4;

			this.indices.push({
				array: indexArray,
				material: materialName || 'none'
			});
		}
	}

	loadFromJson(data) {
		this.vertices = data.vertices;
		this.uvs = data.uvs?.length > 0 ? data.uvs : [];
		this.normals = data.normals?.length > 0 ? data.normals : [];
		this.indices = data.indices;
	}

	calculateBoundingBox() {
		if (this.vertices.length === 0) return null;
		return BoundingBox.fromPoints(this.vertices);
	}
}

export default Mesh;
