import BoundingBox from "../utils/boundingbox.js";
import { Backend } from "./context.js";

class Mesh {
	static ATTR_POSITIONS = 0;
	static ATTR_UVS = 1;
	static ATTR_NORMALS = 2;
	static ATTR_LIGHTMAP_UVS = 3;

	constructor(data, context) {
		this.resources = context;
		this.vao = null;
		this._buffers = [];
		this.initialize(data);
	}

	#bindMaterial(indexObj, applyMaterial, shader) {
		if (indexObj.material !== "none" && applyMaterial && this.resources) {
			this.resources.get(indexObj.material).bind(shader);
		}
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

	static buildBuffer(_type, data, usage) {
		let typedArray;

		if (usage === "index") {
			typedArray = new Uint16Array(data);
		} else {
			typedArray = new Float32Array(data);
		}

		return Backend.createBuffer(typedArray, usage);
	}

	initMeshBuffers() {
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;
		this.hasLightmapUVs = this.lightmapUVs && this.lightmapUVs.length > 0;
		this.triangleCount = 0;
		this._buffers = [];

		// Create Index Buffers
		for (const indexObj of this.indices) {
			indexObj.indexBuffer = Mesh.buildBuffer(null, indexObj.array, "index");
			this._buffers.push(indexObj.indexBuffer);
			this.triangleCount += indexObj.array.length / 3;
		}

		// Create Vertex Buffers
		this.vertexBuffer = Mesh.buildBuffer(null, this.vertices, "vertex");
		this._buffers.push(this.vertexBuffer);

		if (this.hasUVs) {
			this.uvBuffer = Mesh.buildBuffer(null, this.uvs, "vertex");
			this._buffers.push(this.uvBuffer);
		}
		if (this.hasNormals) {
			this.normalBuffer = Mesh.buildBuffer(null, this.normals, "vertex");
			this._buffers.push(this.normalBuffer);
		}
		if (this.hasLightmapUVs) {
			this.lightmapUVBuffer = Mesh.buildBuffer(
				null,
				this.lightmapUVs,
				"vertex",
			);
			this._buffers.push(this.lightmapUVBuffer);
		}

		// Define Vertex Attributes for State Creation
		const attributes = [
			{
				buffer: this.vertexBuffer,
				slot: Mesh.ATTR_POSITIONS,
				size: 3,
				type: "float", // Backend handles mapping to GL constant
			},
		];

		if (this.hasUVs) {
			attributes.push({
				buffer: this.uvBuffer,
				slot: Mesh.ATTR_UVS,
				size: 2,
				type: "float",
			});
		}

		if (this.hasNormals) {
			attributes.push({
				buffer: this.normalBuffer,
				slot: Mesh.ATTR_NORMALS,
				size: 3,
				type: "float",
			});
		}

		if (this.hasLightmapUVs) {
			attributes.push({
				buffer: this.lightmapUVBuffer,
				slot: Mesh.ATTR_LIGHTMAP_UVS,
				size: 2,
				type: "float",
			});
		} else {
			// NOTE: WebGL allows disabling attrib array and using constant.
			// RenderBackend abstraction usually implies "Vertex State" captures enabled arrays.
			// Handling default/constant values for disabled attributes is complex in pure abstraction.
			// Current WebGLBackend implementation only enables arrays in the list.
			// If we omit it, it won't be enabled, which is correct.
			// The original code did: gl.disableVertexAttribArray(...) + gl.vertexAttrib2f(...)
			// We might need an "Constant Attribute" feature in backend if visual artifacts appear.
			// For now, assume shader handles missing data or default attribute values are sufficient (usually 0,0,0,1).
		}

		// Create Vertex State (VAO)
		this.vao = Backend.createVertexState({ attributes });
	}

	deleteMeshBuffers() {
		if (this.vao) {
			Backend.deleteVertexState(this.vao);
			this.vao = null;
		}

		// Delete all buffers we created
		if (this._buffers) {
			for (const buffer of this._buffers) {
				Backend.deleteBuffer(buffer);
			}
			this._buffers = [];
		}

		// References in indices/this need clearing?
		// Logic above recreates them on init, so assuming `delete` is final before re-init or GC.
	}

	bind() {
		Backend.bindVertexState(this.vao);
	}

	unBind() {
		Backend.bindVertexState(null);
	}

	#groupedIndices = null;

	renderSingle(
		applyMaterial = true,
		renderMode = null,
		mode = "all",
		shader = null,
	) {
		this.bind();
		this.renderIndices(applyMaterial, renderMode ?? null, mode, shader);
		this.unBind();
	}

	renderIndices(applyMaterial, renderMode = null, mode = "all", shader = null) {
		const actualRenderMode = renderMode ?? null;

		// Lazy initialization of grouped indices
		if (!this.#groupedIndices && this.resources) {
			this.#groupedIndices = {
				opaque: [],
				translucent: [],
				all: this.indices,
			};

			for (const indexObj of this.indices) {
				const material =
					indexObj.material !== "none"
						? this.resources.get(indexObj.material)
						: null;

				if (material?.translucent) {
					this.#groupedIndices.translucent.push(indexObj);
				} else {
					this.#groupedIndices.opaque.push(indexObj);
				}
			}
		}

		let targets = this.indices;

		if (typeof mode === "function") {
			// Legacy filter support
			for (const indexObj of this.indices) {
				const material =
					this.resources && indexObj.material !== "none"
						? this.resources.get(indexObj.material)
						: null;
				if (!mode(material)) continue;

				this.#bindMaterial(indexObj, applyMaterial, shader);

				// Draw Abstracted
				Backend.drawIndexed(
					indexObj.indexBuffer,
					indexObj.indexBuffer.length,
					0,
					actualRenderMode,
				);
			}
			return;
		}

		if (this.#groupedIndices?.[mode]) {
			targets = this.#groupedIndices[mode];
		}

		for (const indexObj of targets) {
			this.#bindMaterial(indexObj, applyMaterial, shader);

			// Draw Abstracted
			Backend.drawIndexed(
				indexObj.indexBuffer,
				indexObj.indexBuffer.length,
				0,
				actualRenderMode,
			);
		}
	}

	renderWireFrame() {
		this.bind();

		// Note: Existing wireframe logic creates temporary buffers on the fly.
		// This is slow and difficult to abstract perfectly efficiently without
		// creating backend resources every frame.
		// Kept logic but using backend creation/deletion.

		for (const indexObj of this.indices) {
			const indices = indexObj.array;
			// Uint16Array needed for index buffer
			const tempArray = new Uint16Array(indices.length * 2);
			let lineCount = 0;

			for (let i = 0; i < indices.length; i += 3) {
				tempArray[lineCount++] = indices[i];
				tempArray[lineCount++] = indices[i + 1];
				tempArray[lineCount++] = indices[i + 1];
				tempArray[lineCount++] = indices[i + 2];
				tempArray[lineCount++] = indices[i + 2];
				tempArray[lineCount++] = indices[i];
			}

			// Create temporary index buffer via backend
			// using slice to get exact content length
			const tempBuffer = Backend.createBuffer(
				tempArray.subarray(0, lineCount),
				"index",
			);

			// Draw lines
			Backend.drawIndexed(tempBuffer, lineCount, 0, "lines");

			// Cleanup
			Backend.deleteBuffer(tempBuffer);
		}

		this.unBind();
	}

	async loadFromBlob(blob) {
		const arrayBuffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let offset = 0;

		const readUint32 = () => {
			const value =
				bytes[offset] |
				(bytes[offset + 1] << 8) |
				(bytes[offset + 2] << 16) |
				(bytes[offset + 3] << 24);
			offset += 4;
			return value;
		};

		const readFloat32Array = (count) => {
			if (count === 0) return [];
			const floatArray = Array.from(
				new Float32Array(bytes.buffer, bytes.byteOffset + offset, count),
			);
			offset += count * 4;
			return floatArray;
		};

		const version = readUint32();
		const vertexCount = readUint32();
		const uvCount = readUint32();

		let lightmapUVCount = 0;
		if (version === 2) {
			lightmapUVCount = readUint32();
		} else {
			readUint32();
		}

		const normalCount = readUint32();
		const indexGroupCount = readUint32();

		this.vertices = readFloat32Array(vertexCount);
		this.uvs = readFloat32Array(uvCount);

		if (version === 2) {
			this.lightmapUVs = readFloat32Array(lightmapUVCount);
		} else {
			this.lightmapUVs = [];
		}

		this.normals = readFloat32Array(normalCount);

		this.indices = [];
		const MATERIAL_NAME_SIZE = 64;

		for (let i = 0; i < indexGroupCount; i++) {
			const materialNameBytes = bytes.slice(
				offset,
				offset + MATERIAL_NAME_SIZE,
			);
			let materialName = "";
			for (
				let j = 0;
				j < MATERIAL_NAME_SIZE && materialNameBytes[j] !== 0;
				j++
			) {
				materialName += String.fromCharCode(materialNameBytes[j]);
			}
			offset += MATERIAL_NAME_SIZE;

			const indexCount = readUint32();
			if (indexCount === 0) continue;

			const indexArrayBuffer = bytes.buffer.slice(
				bytes.byteOffset + offset,
				bytes.byteOffset + offset + indexCount * 4,
			);
			const indexArray = Array.from(new Uint32Array(indexArrayBuffer));
			offset += indexCount * 4;

			this.indices.push({
				array: indexArray,
				material: materialName || "none",
			});
		}
	}

	loadFromJson(data) {
		this.vertices = data.vertices;
		this.uvs = data.uvs?.length > 0 ? data.uvs : [];
		this.normals = data.normals?.length > 0 ? data.normals : [];
		this.lightmapUVs = data.lightmapUVs?.length > 0 ? data.lightmapUVs : [];
		this.indices = data.indices;
	}

	calculateBoundingBox() {
		if (this.vertices.length === 0) return null;
		// vertices is array of numbers, BoundingBox.fromPoints expects [x,y,z, x,y,z] format which matches
		return BoundingBox.fromPoints(this.vertices);
	}
}

export default Mesh;
