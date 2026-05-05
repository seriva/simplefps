import { Skeleton } from "../animation/skeleton.js";
import { Console } from "../systems/console.js";
import { Backend } from "./backend.js";
import { Mesh } from "./mesh.js";

const MAX_JOINTS = 64;

class SkinnedMesh extends Mesh {
	constructor(data, context) {
		super(data, context);

		this.skeleton = null;
		this.gpuJointIndices = null;
		this.gpuJointWeights = null;
		this.skinnedVao = null;
		this.jointIndexBuffer = null;
		this.jointWeightBuffer = null;
		this._boneMatrixBuffer = null;
	}

	initMeshBuffers() {
		const baseAttributes = this._createBaseBuffers();
		this.hasLightmapUVs = false;

		this.jointIndexBuffer = Backend.createBuffer(
			this.gpuJointIndices,
			"vertex",
		);
		this._buffers.push(this.jointIndexBuffer);

		this.jointWeightBuffer = Backend.createBuffer(
			this.gpuJointWeights,
			"vertex",
		);
		this._buffers.push(this.jointWeightBuffer);

		// base VAO used for debug rendering without skinning
		this.vao = Backend.createVertexState({ attributes: baseAttributes });

		const skinnedAttributes = [
			...baseAttributes,
			{
				buffer: this.jointIndexBuffer,
				slot: Mesh.ATTR_JOINT_INDICES,
				size: 4,
				type: "ubyte",
				asInteger: true,
			},
			{
				buffer: this.jointWeightBuffer,
				slot: Mesh.ATTR_JOINT_WEIGHTS,
				size: 4,
				type: "float",
			},
		];
		this.skinnedVao = Backend.createVertexState({
			attributes: skinnedAttributes,
		});
	}

	deleteMeshBuffers() {
		super.deleteMeshBuffers();

		if (this.skinnedVao) {
			Backend.deleteVertexState(this.skinnedVao);
			this.skinnedVao = null;
		}
	}

	dispose() {
		this.deleteMeshBuffers();
		this.gpuJointIndices = null;
		this.gpuJointWeights = null;
		this._boneMatrixBuffer = null;
	}

	bind(useSkinned = true) {
		Backend.bindVertexState(useSkinned ? this.skinnedVao : this.vao);
	}

	getBoneMatricesForGPU(pose) {
		if (!this.skeleton) return null;

		const skinMatrices = this.skeleton.computeSkinningMatrices(pose);
		const count = skinMatrices.length;

		if (count > MAX_JOINTS) {
			Console.error(
				`Skeleton has ${count} joints, exceeds MAX_JOINTS (${MAX_JOINTS})`,
			);
			return null;
		}

		// sized for uniform buffer alignment (MAX_JOINTS mat4s)
		if (!this._boneMatrixBuffer) {
			this._boneMatrixBuffer = new Float32Array(MAX_JOINTS * 16);
		}

		const result = this._boneMatrixBuffer;
		for (let i = 0; i < count; i++) {
			result.set(skinMatrices[i], i * 16);
		}

		return result;
	}

	_loadExtraDataFromJson(data) {
		if (data.skeleton) {
			this.skeleton = new Skeleton(data.skeleton.joints);
		}

		if (data.gpuJointIndices && data.gpuJointWeights) {
			this.gpuJointIndices = new Uint8Array(data.gpuJointIndices);
			this.gpuJointWeights = new Float32Array(data.gpuJointWeights);
		}
	}

	async _loadExtraDataFromBlob(reader, context) {
		const {
			hasSkeletal,
			jointCount,
			weightCount,
			hasWeightNormals,
			hasGPUSkinning,
		} = context;

		if (hasSkeletal && jointCount > 0) {
			const joints = [];

			for (let i = 0; i < jointCount; i++) {
				const parent = reader.readInt32();
				const pos = [
					reader.readFloat32(),
					reader.readFloat32(),
					reader.readFloat32(),
				];
				const rot = [
					reader.readFloat32(),
					reader.readFloat32(),
					reader.readFloat32(),
					reader.readFloat32(),
				];
				joints.push({ name: "", parent, pos, rot });
			}

			for (let i = 0; i < jointCount; i++) {
				joints[i].name = reader.readStringNullTerminated();
			}

			this.skeleton = new Skeleton(joints);

			// skip legacy weight data (file format compatibility)
			for (let i = 0; i < weightCount; i++) {
				reader.readUint32();
				const count = reader.readUint32();
				for (let j = 0; j < count; j++) {
					reader.readUint32();
					reader.readFloat32();
					reader.readFloat32();
					reader.readFloat32();
					reader.readFloat32();
					if (hasWeightNormals) {
						reader.readFloat32();
						reader.readFloat32();
						reader.readFloat32();
					}
				}
			}

			// GPU skinning data (version 5+)
			if (hasGPUSkinning) {
				const numVertices = this.vertices.length / 3;
				this.gpuJointIndices = reader.readUint8Array(numVertices * 4);
				this.gpuJointWeights = reader.readFloat32Array(numVertices * 4);
			}
		}
	}
}

export { SkinnedMesh };
