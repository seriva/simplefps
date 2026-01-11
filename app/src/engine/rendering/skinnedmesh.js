import { vec3 } from "../../dependencies/gl-matrix.js";
import { Skeleton } from "../animation/skeleton.js";
import BoundingBox from "../core/boundingbox.js";
import { Backend } from "./backend.js";

class SkinnedMesh {
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

		this.bindVertices = null;
		this.bindNormals = null;

		this.skinnedVertices = null;
		this.skinnedNormals = null;

		this._tempVec = vec3.create();
		this._tempNormal = vec3.create();
		this._skinMatrices = null;

		this.ready = this.initialize(data);
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

		this.bindVertices = new Float32Array(this.vertices);
		this.bindNormals = new Float32Array(this.normals);

		this.skinnedVertices = new Float32Array(this.vertices.length);
		this.skinnedNormals = new Float32Array(this.normals.length);
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
		if (version === 2) {
			lightmapUVCount = readUint32();
		} else {
			readUint32();
		}

		const normalCount = readUint32();
		const indexGroupCount = readUint32();

		let jointCount = 0;
		let weightCount = 0;
		const hasSkeletal = version === 3;

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
				for (let j = 0; j < count; j++) {
					jointIndices.push(readUint32());
					weights.push(readFloat32());
					positions.push([readFloat32(), readFloat32(), readFloat32()]);
				}
				this.weightData.push({
					vertex,
					joints: jointIndices,
					weights,
					positions,
				});
			}
		}

		this.bindVertices = new Float32Array(this.vertices);
		this.bindNormals = new Float32Array(this.normals);
		this.skinnedVertices = new Float32Array(this.vertices.length);
		this.skinnedNormals = new Float32Array(this.normals.length);
	}

	#bindMaterial(indexObj, applyMaterial, shader) {
		if (
			indexObj.material &&
			indexObj.material !== "none" &&
			applyMaterial &&
			this.resources
		) {
			this.resources.get(indexObj.material).bind(shader);
		}
	}

	initMeshBuffers() {
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;
		this.hasLightmapUVs = this.lightmapUVs && this.lightmapUVs.length > 0;
		this.triangleCount = 0;
		this._buffers = [];

		for (const indexObj of this.indices) {
			indexObj.indexBuffer = SkinnedMesh.buildBuffer(
				null,
				indexObj.array,
				"index",
			);
			this._buffers.push(indexObj.indexBuffer);
			this.triangleCount += indexObj.array.length / 3;
		}

		const vertexCount = this.vertices.length / 3;

		this.vertexBuffer = SkinnedMesh.buildBuffer(null, this.vertices, "vertex");
		this._buffers.push(this.vertexBuffer);

		if (this.hasUVs) {
			this.uvBuffer = SkinnedMesh.buildBuffer(null, this.uvs, "vertex");
		} else {
			this.uvBuffer = SkinnedMesh.buildBuffer(
				null,
				new Float32Array(vertexCount * 2),
				"vertex",
			);
		}
		this._buffers.push(this.uvBuffer);

		if (this.hasNormals) {
			this.normalBuffer = SkinnedMesh.buildBuffer(null, this.normals, "vertex");
		} else {
			this.normalBuffer = SkinnedMesh.buildBuffer(
				null,
				new Float32Array(vertexCount * 3),
				"vertex",
			);
		}
		this._buffers.push(this.normalBuffer);

		if (this.hasLightmapUVs) {
			this.lightmapUVBuffer = SkinnedMesh.buildBuffer(
				null,
				this.lightmapUVs,
				"vertex",
			);
		} else {
			this.lightmapUVBuffer = SkinnedMesh.buildBuffer(
				null,
				new Float32Array(vertexCount * 2),
				"vertex",
			);
		}
		this._buffers.push(this.lightmapUVBuffer);

		const attributes = [
			{
				buffer: this.vertexBuffer,
				slot: SkinnedMesh.ATTR_POSITIONS,
				size: 3,
				type: "float",
			},
			{
				buffer: this.uvBuffer,
				slot: SkinnedMesh.ATTR_UVS,
				size: 2,
				type: "float",
			},
			{
				buffer: this.normalBuffer,
				slot: SkinnedMesh.ATTR_NORMALS,
				size: 3,
				type: "float",
			},
			{
				buffer: this.lightmapUVBuffer,
				slot: SkinnedMesh.ATTR_LIGHTMAP_UVS,
				size: 2,
				type: "float",
			},
		];

		this.vao = Backend.createVertexState({ attributes });
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

		if (!this.#groupedIndices && this.resources) {
			this.#groupedIndices = {
				opaque: [],
				translucent: [],
				all: this.indices,
			};

			for (const indexObj of this.indices) {
				const material =
					indexObj.material && indexObj.material !== "none"
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
			for (const indexObj of this.indices) {
				const material =
					this.resources && indexObj.material !== "none"
						? this.resources.get(indexObj.material)
						: null;
				if (!mode(material)) continue;

				this.#bindMaterial(indexObj, applyMaterial, shader);
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
			Backend.drawIndexed(
				indexObj.indexBuffer,
				indexObj.indexBuffer.length,
				0,
				actualRenderMode,
			);
		}
	}

	calculateBoundingBox() {
		if (this.vertices.length === 0) return null;
		return BoundingBox.fromPoints(Array.from(this.vertices));
	}

	applySkinning(pose, overrideWorldMatrices = null) {
		if (!this.skeleton || !this.weightData) return;

		// Use MD5 native skinning definitions (weight offsets)
		// Skeleton handles Local poses correctly via accumulation in getWorldMatrices
		const worldMatrices =
			overrideWorldMatrices ||
			this.skeleton.getWorldMatrices(pose.localTransforms);

		this.skinnedVertices.fill(0);
		// Note: kept skinnedNormals zeroed for now as we focus on vertex positions
		this.skinnedNormals.fill(0);

		for (const weightEntry of this.weightData) {
			const vertIdx = weightEntry.vertex;
			const vBase = vertIdx * 3;

			// bindPos/bindNormal not needed for MD5 skinning formula

			let px = 0,
				py = 0,
				pz = 0;
			const nx = 0,
				ny = 0,
				nz = 0;

			for (let w = 0; w < weightEntry.joints.length; w++) {
				const jointIdx = weightEntry.joints[w];
				const weight = weightEntry.weights[w];
				const weightPos = weightEntry.positions[w];
				const jointMatrix = worldMatrices[jointIdx];

				// Transform weight position by joint world matrix
				vec3.transformMat4(this._tempVec, weightPos, jointMatrix);
				px += this._tempVec[0] * weight;
				py += this._tempVec[1] * weight;
				pz += this._tempVec[2] * weight;

				// For normals, we'd typically need bind normals or reconstruct them.
				// Since MD5 Normals are placeholders, stick to zeros or use world rotation?
				// Using the same joint matrix rotation for normals (simplified):
				/*
				this._tempNormal[0] = jointMatrix[0] * 0 + jointMatrix[4] * 1 + jointMatrix[8] * 0; // assuming up normal
				// ... this is complex without bind normals. Leaving normals 0 for now.
				*/
			}

			this.skinnedVertices[vBase] = px;
			this.skinnedVertices[vBase + 1] = py;
			this.skinnedVertices[vBase + 2] = pz;
			const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
			this.skinnedNormals[vBase] = nx / len;
			this.skinnedNormals[vBase + 1] = ny / len;
			this.skinnedNormals[vBase + 2] = nz / len;
		}

		Backend.updateBuffer(this.vertexBuffer, this.skinnedVertices);
		if (this.hasNormals) {
			Backend.updateBuffer(this.normalBuffer, this.skinnedNormals);
		}
	}

	updateBoundingBox() {
		if (this.skinnedVertices && this.skinnedVertices.length > 0) {
			this.boundingBox = BoundingBox.fromPoints(
				Array.from(this.skinnedVertices),
			);
		}
	}

	isSkinned() {
		return this.skeleton !== null && this.weightData !== null;
	}
}

export default SkinnedMesh;
