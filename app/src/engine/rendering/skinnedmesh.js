import { Skeleton } from "../animation/skeleton.js";
import { Backend } from "./backend.js";
import Mesh from "./mesh.js";

class SkinnedMesh extends Mesh {
	constructor(data, context) {
		super(data, context);

		// Skeletal data
		this.skeleton = null;
		this.gpuJointIndices = null;
		this.gpuJointWeights = null;
	}

	initMeshBuffers() {
		const baseAttributes = this._createBaseBuffers();
		this.hasLightmapUVs = false; // Skinned meshes never have lightmap UVs

		// Joint indices buffer
		this.jointIndexBuffer = Backend.createBuffer(
			this.gpuJointIndices,
			"vertex",
		);
		this._buffers.push(this.jointIndexBuffer);

		// Joint weights buffer
		this.jointWeightBuffer = Backend.createBuffer(
			this.gpuJointWeights,
			"vertex",
		);
		this._buffers.push(this.jointWeightBuffer);

		// Create base VAO (for debug rendering without skinning)
		this.vao = Backend.createVertexState({ attributes: baseAttributes });

		// Create skinned VAO with joint attributes
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
		if (this.vao) {
			Backend.deleteVertexState(this.vao);
			this.vao = null;
		}

		if (this.skinnedVao) {
			Backend.deleteVertexState(this.skinnedVao);
			this.skinnedVao = null;
		}

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

	/**
	 * Dispose of all GPU resources. Call when mesh is no longer needed.
	 */
	dispose() {
		this.deleteMeshBuffers();
		this._boneMatrixBuffer = null;
	}

	bind(useSkinned = true) {
		// Default to skinned VAO for SkinnedMesh
		const vao = useSkinned ? this.skinnedVao : this.vao;
		Backend.bindVertexState(vao);
	}

	// Pre-allocated buffer for bone matrices (reused each frame)
	_boneMatrixBuffer = null;

	// Get bone matrices for GPU skinning (flat Float32Array of mat4s)
	// Reuses internal buffer to avoid allocations
	getBoneMatricesForGPU(pose) {
		if (!this.skeleton) return null;

		const skinMatrices = this.skeleton.computeSkinningMatrices(pose);
		const count = skinMatrices.length;

		// Allocate buffer once (64 matrices for uniform buffer alignment)
		if (!this._boneMatrixBuffer) {
			this._boneMatrixBuffer = new Float32Array(64 * 16);
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

		// Load GPU skinning data if present
		if (data.gpuJointIndices && data.gpuJointWeights) {
			this.gpuJointIndices = new Uint8Array(data.gpuJointIndices);
			this.gpuJointWeights = new Float32Array(data.gpuJointWeights);
		}
	}

	async _loadExtraDataFromBlob(reader, context) {
		const { readInt32, readFloat32, readUint32, readFloat32Array, bytes } =
			reader;
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
				// We need to manage offset manually since we are accessing bytes directly here for strings
				let offset = reader.getOffset();
				while (offset < bytes.length && bytes[offset] !== 0) {
					name += String.fromCharCode(bytes[offset++]);
				}
				offset++; // Skip null terminator

				// Update the reader's offset!
				// We need to calculate how many bytes we advanced
				const delta = offset - reader.getOffset();
				reader.skip(delta);

				joints[i].name = name;
			}

			this.skeleton = new Skeleton(joints);

			// Skip over legacy weight data (kept for file format compatibility)
			for (let i = 0; i < weightCount; i++) {
				readUint32(); // vertex
				const count = readUint32();
				for (let j = 0; j < count; j++) {
					readUint32(); // joint index
					readFloat32(); // weight
					readFloat32();
					readFloat32();
					readFloat32(); // position
					if (hasWeightNormals) {
						readFloat32();
						readFloat32();
						readFloat32(); // normal
					}
				}
			}

			// Read GPU skinning data (version 5+)
			if (hasGPUSkinning) {
				const numVertices = this.vertices.length / 3;
				// Joint indices: 4 uint8 per vertex
				this.gpuJointIndices = new Uint8Array(numVertices * 4);
				// We need to read raw bytes for Uint8Array
				let offset = reader.getOffset();
				for (let i = 0; i < numVertices * 4; i++) {
					this.gpuJointIndices[i] = bytes[offset++];
				}
				// Sync offset again
				reader.skip(numVertices * 4);

				// Joint weights: 4 float32 per vertex
				this.gpuJointWeights = readFloat32Array(numVertices * 4);
			}
		}
	}
}

export default SkinnedMesh;
