// Skeleton import removed - moved to skinnedmesh.js
import { BinaryReader } from "../core/binaryreader.js";
import BoundingBox from "../physics/boundingbox.js";
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

	static buildBuffer(data, usage) {
		let typedArray;

		if (usage === "index") {
			typedArray = new Uint16Array(data);
		} else {
			typedArray = new Float32Array(data);
		}

		return Backend.createBuffer(typedArray, usage);
	}

	// Helper to create and push a buffer
	_createAttributeBuffer(data, usage, slot, size) {
		const buffer = Mesh.buildBuffer(data, usage);
		this._buffers.push(buffer);
		return {
			buffer,
			slot,
			size,
			type: "float",
		};
	}

	_createBaseBuffers() {
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;
		this.triangleCount = 0;
		this._buffers = [];

		// Create Index Buffers
		for (const indexObj of this.indices) {
			indexObj.indexBuffer = Mesh.buildBuffer(indexObj.array, "index");
			this._buffers.push(indexObj.indexBuffer);
			this.triangleCount += indexObj.array.length / 3;
		}

		const vertexCount = this.vertices.length / 3;

		// Position (Always present)
		const positionAttribute = this._createAttributeBuffer(
			this.vertices,
			"vertex",
			Mesh.ATTR_POSITIONS,
			3,
		);
		this.vertexBuffer = positionAttribute.buffer;

		// UVs
		const uvs = this.hasUVs ? this.uvs : new Float32Array(vertexCount * 2);
		const uvAttribute = this._createAttributeBuffer(
			uvs,
			"vertex",
			Mesh.ATTR_UVS,
			2,
		);
		this.uvBuffer = uvAttribute.buffer;

		// Normals
		const normals = this.hasNormals
			? this.normals
			: new Float32Array(vertexCount * 3);
		const normalAttribute = this._createAttributeBuffer(
			normals,
			"vertex",
			Mesh.ATTR_NORMALS,
			3,
		);
		this.normalBuffer = normalAttribute.buffer;

		// Return base attributes for VAO creation
		return [positionAttribute, uvAttribute, normalAttribute];
	}

	initMeshBuffers() {
		const baseAttributes = this._createBaseBuffers();
		this.hasLightmapUVs = this.lightmapUVs && this.lightmapUVs.length > 0;

		const vertexCount = this.vertices.length / 3;

		// Lightmap UVs
		const lightmapUVs = this.hasLightmapUVs
			? this.lightmapUVs
			: new Float32Array(vertexCount * 2);

		const lightmapAttribute = this._createAttributeBuffer(
			lightmapUVs,
			"vertex",
			Mesh.ATTR_LIGHTMAP_UVS,
			2,
		);
		this.lightmapUVBuffer = lightmapAttribute.buffer;

		// Add lightmap attribute
		const allAttributes = [...baseAttributes, lightmapAttribute];

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
		const reader = new BinaryReader(arrayBuffer);

		const version = reader.readUint32();
		const vertexCount = reader.readUint32();
		const uvCount = reader.readUint32();

		let lightmapUVCount = 0;
		if (version >= 2) {
			lightmapUVCount = reader.readUint32();
		} else {
			reader.readUint32();
		}

		const normalCount = reader.readUint32();
		const indexGroupCount = reader.readUint32();

		let jointCount = 0;
		let weightCount = 0;
		const hasSkeletal = version >= 3;
		const hasWeightNormals = version >= 4;
		const hasGPUSkinning = version >= 5;

		if (hasSkeletal) {
			jointCount = reader.readUint32();
			weightCount = reader.readUint32();
		}

		this.vertices = reader.readFloat32Array(vertexCount);
		this.uvs = reader.readFloat32Array(uvCount);

		if (version === 2) {
			this.lightmapUVs = reader.readFloat32Array(lightmapUVCount);
		} else {
			this.lightmapUVs = new Float32Array(0);
		}

		this.normals = reader.readFloat32Array(normalCount);

		this.indices = [];
		const MATERIAL_NAME_SIZE = 64;

		for (let i = 0; i < indexGroupCount; i++) {
			const materialName = reader.readString(MATERIAL_NAME_SIZE);

			const indexCount = reader.readUint32();
			if (indexCount === 0) continue;

			// Read indices manually (Uint32Array)
			// We can't use reader.readUint32() one by one efficiently, or readFloat32Array
			// BinaryReader exposes bytes, let's use that.
			const indexArrayBuffer = reader.bytes.buffer.slice(
				reader.bytes.byteOffset + reader.offset,
				reader.bytes.byteOffset + reader.offset + indexCount * 4,
			);
			const indexArray = Array.from(new Uint32Array(indexArrayBuffer));
			reader.skip(indexCount * 4);

			this.indices.push({
				array: indexArray,
				material: materialName || "none",
			});
		}

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
