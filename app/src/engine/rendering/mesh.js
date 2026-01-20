// Skeleton import removed - moved to skinnedmesh.js
import BoundingBox from "../core/boundingbox.js";
import { Backend } from "./backend.js";

class Mesh {
	static ATTR_POSITIONS = 0;
	static ATTR_UVS = 1;
	static ATTR_NORMALS = 2;
	static ATTR_LIGHTMAP_UVS = 3;
	static ATTR_JOINT_INDICES = 4;
	static ATTR_JOINT_WEIGHTS = 5;

	constructor(data, context) {
		this.resources = context;
		this.vao = null;
		this.skinnedVao = null;
		this._buffers = [];

		this.ready = this.initialize(data);
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
		this.updateBoundingBox();
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

	_createBaseBuffers() {
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;
		this.triangleCount = 0;
		this._buffers = [];

		// Create Index Buffers
		for (const indexObj of this.indices) {
			indexObj.indexBuffer = Mesh.buildBuffer(null, indexObj.array, "index");
			this._buffers.push(indexObj.indexBuffer);
			this.triangleCount += indexObj.array.length / 3;
		}

		const vertexCount = this.vertices.length / 3;

		// Position (Always present)
		this.vertexBuffer = Mesh.buildBuffer(null, this.vertices, "vertex");
		this._buffers.push(this.vertexBuffer);

		// UVs (Always provide buffer)
		if (this.hasUVs) {
			this.uvBuffer = Mesh.buildBuffer(null, this.uvs, "vertex");
		} else {
			this.uvBuffer = Mesh.buildBuffer(
				null,
				new Float32Array(vertexCount * 2),
				"vertex",
			);
		}
		this._buffers.push(this.uvBuffer);

		// Normals (Always provide buffer)
		if (this.hasNormals) {
			this.normalBuffer = Mesh.buildBuffer(null, this.normals, "vertex");
		} else {
			this.normalBuffer = Mesh.buildBuffer(
				null,
				new Float32Array(vertexCount * 3),
				"vertex",
			);
		}
		this._buffers.push(this.normalBuffer);

		// Return base attributes for VAO creation
		return [
			{
				buffer: this.vertexBuffer,
				slot: Mesh.ATTR_POSITIONS,
				size: 3,
				type: "float",
			},
			{
				buffer: this.uvBuffer,
				slot: Mesh.ATTR_UVS,
				size: 2,
				type: "float",
			},
			{
				buffer: this.normalBuffer,
				slot: Mesh.ATTR_NORMALS,
				size: 3,
				type: "float",
			},
		];
	}

	initMeshBuffers() {
		const baseAttributes = this._createBaseBuffers();
		this.hasLightmapUVs = this.lightmapUVs && this.lightmapUVs.length > 0;

		const vertexCount = this.vertices.length / 3;

		// Lightmap UVs (Always provide buffer)
		if (this.hasLightmapUVs) {
			this.lightmapUVBuffer = Mesh.buildBuffer(
				null,
				this.lightmapUVs,
				"vertex",
			);
		} else {
			this.lightmapUVBuffer = Mesh.buildBuffer(
				null,
				new Float32Array(vertexCount * 2),
				"vertex",
			);
		}
		this._buffers.push(this.lightmapUVBuffer);

		// Add lightmap attribute
		const allAttributes = [
			...baseAttributes,
			{
				buffer: this.lightmapUVBuffer,
				slot: Mesh.ATTR_LIGHTMAP_UVS,
				size: 2,
				type: "float",
			},
		];

		// Create base VAO (for non-skinned shaders)
		this.vao = Backend.createVertexState({ attributes: allAttributes });
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

		// Delete wireframe buffers if they exist
		if (this._wireframeBuffers) {
			for (const wf of this._wireframeBuffers) {
				Backend.deleteBuffer(wf.buffer);
			}
			this._wireframeBuffers = null;
		}
	}

	dispose() {
		this.deleteMeshBuffers();
	}

	bind(_useSkinned = false) {
		Backend.bindVertexState(this.vao);
	}

	unBind() {
		Backend.bindVertexState(null);
	}

	updateVertexBuffer(data) {
		if (this.vertexBuffer) {
			Backend.updateBuffer(this.vertexBuffer, data);
		}
	}

	#groupedIndices = null;

	renderSingle(
		applyMaterial = true,
		renderMode = null,
		mode = "all",
		shader = null,
		useSkinned = false,
	) {
		this.bind(useSkinned);
		this.renderIndices(applyMaterial, renderMode ?? null, mode, shader);
		this.unBind();
	}

	#drawIndexObject(indexObj, applyMaterial, shader, actualRenderMode) {
		this.#bindMaterial(indexObj, applyMaterial, shader);
		Backend.drawIndexed(
			indexObj.indexBuffer,
			indexObj.indexBuffer.length,
			0,
			actualRenderMode,
		);
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

				this.#drawIndexObject(
					indexObj,
					applyMaterial,
					shader,
					actualRenderMode,
				);
			}
			return;
		}

		if (this.#groupedIndices?.[mode]) {
			targets = this.#groupedIndices[mode];
		}

		for (const indexObj of targets) {
			this.#drawIndexObject(indexObj, applyMaterial, shader, actualRenderMode);
		}
	}

	renderWireFrame(useSkinned = false) {
		this.bind(useSkinned);

		// Cache wireframe index buffers to avoid creating/destroying every frame
		// (WebGPU requires buffers to stay alive until commands are submitted)
		if (!this._wireframeBuffers) {
			this._wireframeBuffers = [];
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

				// Create index buffer and cache it
				const buffer = Backend.createBuffer(
					tempArray.subarray(0, lineCount),
					"index",
				);
				this._wireframeBuffers.push({ buffer, count: lineCount });
			}
		}

		// Draw cached wireframe buffers
		for (const wf of this._wireframeBuffers) {
			Backend.drawIndexed(wf.buffer, wf.count, 0, "lines");
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

		const readInt32 = () => {
			const value = readUint32();
			return value > 0x7fffffff ? value - 0x100000000 : value;
		};

		const readFloat32 = () => {
			const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
			offset += 4;
			return view.getFloat32(0, true);
		};

		const readFloat32Array = (count) => {
			if (count === 0) return new Float32Array(0);
			const floatArray = new Float32Array(
				bytes.buffer,
				bytes.byteOffset + offset,
				count,
			);
			offset += count * 4;
			return new Float32Array(floatArray);
		};

		const version = readUint32();
		const vertexCount = readUint32();
		const uvCount = readUint32();

		let lightmapUVCount = 0;
		if (version >= 2) {
			lightmapUVCount = readUint32();
		} else {
			readUint32();
		}

		const normalCount = readUint32();
		const indexGroupCount = readUint32();

		let jointCount = 0;
		let weightCount = 0;
		const hasSkeletal = version >= 3;
		const hasWeightNormals = version >= 4;
		const hasGPUSkinning = version >= 5;

		if (hasSkeletal) {
			jointCount = readUint32();
			weightCount = readUint32();
		}

		this.vertices = readFloat32Array(vertexCount);
		this.uvs = readFloat32Array(uvCount);

		if (version === 2) {
			this.lightmapUVs = readFloat32Array(lightmapUVCount);
		} else {
			this.lightmapUVs = new Float32Array(0);
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

		// Allow subclasses to load extra data (e.g. skinning)
		// We pass the reader functions so they share the same closure state (offset, bytes)
		const reader = {
			readUint32,
			readInt32,
			readFloat32,
			readFloat32Array,
			bytes, // Expose bytes for manual reading if needed
			getOffset: () => offset, // Helper to get current offset
			skip: (n) => {
				offset += n;
			},
		};

		// Pass context for version-specific logic
		const context = {
			version,
			vertexCount,
			hasSkeletal,
			hasWeightNormals,
			hasGPUSkinning,
			jointCount,
			weightCount,
		};

		await this._loadExtraDataFromBlob(reader, context);
	}

	async _loadExtraDataFromBlob(_reader, _context) {
		// Override in subclasses
	}

	_loadExtraDataFromJson(_data) {
		// Override in subclasses
	}

	loadFromJson(data) {
		this.vertices = new Float32Array(data.vertices);
		this.uvs =
			data.uvs?.length > 0 ? new Float32Array(data.uvs) : new Float32Array(0);
		this.normals =
			data.normals?.length > 0
				? new Float32Array(data.normals)
				: new Float32Array(0);
		this.lightmapUVs =
			data.lightmapUVs?.length > 0
				? new Float32Array(data.lightmapUVs)
				: new Float32Array(0);
		this.indices = data.indices;

		this._loadExtraDataFromJson(data);
	}

	updateBoundingBox() {
		if (this.vertices && this.vertices.length > 0) {
			this.boundingBox = BoundingBox.fromPoints(this.vertices);
		} else {
			this.boundingBox = null;
		}
	}
}

export default Mesh;
