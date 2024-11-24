import { gl } from "./context.js";

class Mesh {
	// Cache attribute locations
	static ATTR_POSITIONS = 0;

	static ATTR_UVS = 1;

	static ATTR_NORMALS = 2;

	constructor(data, resources) {
		this.resources = resources;
		this.indices = data.indices;
		this.vertices = data.vertices;
		this.uvs = data.uvs?.length > 0 ? data.uvs : [];
		this.normals = data.normals?.length > 0 ? data.normals : [];
		this.initMeshBuffers();
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

		this.indices.forEach((indexObj) => {
			indexObj.indexBuffer = Mesh.buildBuffer(
				gl.ELEMENT_ARRAY_BUFFER,
				indexObj.array,
				1,
			);
		});
		this.vertexBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, this.vertices, 3);

		if (this.hasUVs) {
			this.uvBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, this.uvs, 2);
		}
		if (this.hasNormals) {
			this.normalBuffer = Mesh.buildBuffer(gl.ARRAY_BUFFER, this.normals, 3);
		}
	}

	deleteMeshBuffers() {
		this.indices.forEach((indexObj) => gl.deleteBuffer(indexObj.indexBuffer));
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
		this.indices.forEach((indexObj) => {
			this.bindMaterial(indexObj, applyMaterial);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
			gl.drawElements(
				gl.TRIANGLES,
				indexObj.indexBuffer.numItems,
				gl.UNSIGNED_SHORT,
				0,
			);
		});
	}

	renderIndicesInstanced(count, applyMaterial) {
		this.indices.forEach((indexObj) => {
			this.bindMaterial(indexObj, applyMaterial);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexObj.indexBuffer);
			gl.drawElementsInstanced(
				gl.TRIANGLES,
				indexObj.indexBuffer.numItems,
				gl.UNSIGNED_SHORT,
				0,
				count,
			);
		});
	}

	bindMaterial(indexObj, applyMaterial) {
		if (indexObj.material !== "none" && applyMaterial && this.resources) {
			this.resources.get(indexObj.material).bind();
		}
	}
}

export default Mesh;
