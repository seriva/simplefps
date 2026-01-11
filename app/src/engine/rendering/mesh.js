import { vec3 } from "../../dependencies/gl-matrix.js";
import { Skeleton } from "../animation/skeleton.js";
import BoundingBox from "../core/boundingbox.js";
import { Backend } from "./backend.js";

class Mesh {
	static ATTR_POSITIONS = 0;
	static ATTR_UVS = 1;
	static ATTR_NORMALS = 2;
	static ATTR_LIGHTMAP_UVS = 3;

	constructor(data, context) {
		this.resources = context;
		this.vao = null;
		this._buffers = [];

		this.skeleton = null;
		this.weightData = null;

		this.skinnedVertices = null;
		this.skinnedNormals = null;

		this._tempVec = vec3.create();
		this._skinMatrices = null;

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

		// Define Vertex Attributes for State Creation (Always consistent layout)
		const attributes = [
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
			{
				buffer: this.lightmapUVBuffer,
				slot: Mesh.ATTR_LIGHTMAP_UVS,
				size: 2,
				type: "float",
			},
		];

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
	}

	bind() {
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

		if (hasSkeletal && jointCount > 0) {
			const joints = [];

			for (let i = 0; i < jointCount; i++) {
				const parent = readInt32();
				const pos = [readFloat32(), readFloat32(), readFloat32()];
				const rot = [
					readFloat32(),
					readFloat32(),
					readFloat32(),
					readFloat32(),
				];
				joints.push({ name: "", parent, pos, rot });
			}

			// Read joint names
			for (let i = 0; i < jointCount; i++) {
				let name = "";
				while (offset < bytes.length && bytes[offset] !== 0) {
					name += String.fromCharCode(bytes[offset++]);
				}
				offset++;
				joints[i].name = name;
			}

			this.skeleton = new Skeleton(joints);
			this._skinMatrices = new Array(this.skeleton.jointCount);

			this.weightData = [];
			for (let i = 0; i < weightCount; i++) {
				const vertex = readUint32();
				const count = readUint32();
				const jointIndices = [];
				const weights = [];
				const positions = [];
				const normals = [];
				for (let j = 0; j < count; j++) {
					jointIndices.push(readUint32());
					weights.push(readFloat32());
					positions.push([readFloat32(), readFloat32(), readFloat32()]);
					if (hasWeightNormals) {
						normals.push([readFloat32(), readFloat32(), readFloat32()]);
					}
				}
				this.weightData.push({
					vertex,
					joints: jointIndices,
					weights,
					positions,
					normals,
				});
			}
		}

		this.skinnedVertices = new Float32Array(this.vertices.length);
		this.skinnedNormals = new Float32Array(this.normals.length);
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

		if (data.skeleton) {
			this.skeleton = new Skeleton(data.skeleton.joints);
			this._skinMatrices = new Array(this.skeleton.jointCount);
		}

		if (data.weights) {
			this.weightData = data.weights;
		}

		this.skinnedVertices = new Float32Array(this.vertices.length);
		this.skinnedNormals = new Float32Array(this.normals.length);
	}

	applySkinning(pose, overrideWorldMatrices = null) {
		if (!this.skeleton || !this.weightData) return;

		// Use MD5 native skinning definitions (weight offsets)
		// Skeleton handles Local poses correctly via accumulation in getWorldMatrices
		const worldMatrices =
			overrideWorldMatrices ||
			this.skeleton.getWorldMatrices(pose.localTransforms);

		this.skinnedVertices.fill(0);
		this.skinnedNormals.fill(0);

		for (const weightEntry of this.weightData) {
			const vertIdx = weightEntry.vertex;
			const vBase = vertIdx * 3;

			let px = 0,
				py = 0,
				pz = 0;
			let nx = 0,
				ny = 0,
				nz = 0;

			for (let w = 0; w < weightEntry.joints.length; w++) {
				const jointIdx = weightEntry.joints[w];
				const weight = weightEntry.weights[w];
				const jointMatrix = worldMatrices[jointIdx];

				// Transform weight position by joint world matrix
				const weightPos = weightEntry.positions[w];
				vec3.transformMat4(this._tempVec, weightPos, jointMatrix);
				px += this._tempVec[0] * weight;
				py += this._tempVec[1] * weight;
				pz += this._tempVec[2] * weight;

				// Transform weight normal by joint world matrix (rotation only)
				if (weightEntry.normals && weightEntry.normals[w]) {
					const weightNormal = weightEntry.normals[w];
					// Transform normal by 3x3 part of matrix
					// n' = M * n (where M is worldMatrix)
					// Since MD5 doesn't use non-uniform scaling, we don't need inverse-transpose.
					const rx = weightNormal[0],
						ry = weightNormal[1],
						rz = weightNormal[2];
					const tx =
						jointMatrix[0] * rx + jointMatrix[4] * ry + jointMatrix[8] * rz;
					const ty =
						jointMatrix[1] * rx + jointMatrix[5] * ry + jointMatrix[9] * rz;
					const tz =
						jointMatrix[2] * rx + jointMatrix[6] * ry + jointMatrix[10] * rz;

					nx += tx * weight;
					ny += ty * weight;
					nz += tz * weight;
				}
			}

			this.skinnedVertices[vBase] = px;
			this.skinnedVertices[vBase + 1] = py;
			this.skinnedVertices[vBase + 2] = pz;

			const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
			this.skinnedNormals[vBase] = nx / nLen;
			this.skinnedNormals[vBase + 1] = ny / nLen;
			this.skinnedNormals[vBase + 2] = nz / nLen;
		}

		Backend.updateBuffer(this.vertexBuffer, this.skinnedVertices);
		if (this.hasNormals) {
			Backend.updateBuffer(this.normalBuffer, this.skinnedNormals);
		}
	}

	updateBoundingBox() {
		if (
			this.skinnedVertices &&
			this.skinnedVertices.length > 0 &&
			this.isSkinned()
		) {
			this.boundingBox = BoundingBox.fromPoints(this.skinnedVertices);
		} else if (this.vertices && this.vertices.length > 0) {
			this.boundingBox = BoundingBox.fromPoints(this.vertices);
		} else {
			this.boundingBox = null;
		}
	}

	isSkinned() {
		return this.skeleton !== null && this.weightData !== null;
	}
}

export default Mesh;
