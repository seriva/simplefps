import { Backend } from "./backend.js";
import Mesh from "./mesh.js";

class SkinnedMesh extends Mesh {
	constructor(data, context) {
		super(data, context, true); // true = isSkinned
	}

	initMeshBuffers() {
		this.hasUVs = this.uvs.length > 0;
		this.hasNormals = this.normals.length > 0;
		this.hasLightmapUVs = false; // Skinned meshes never have lightmap UVs
		this.triangleCount = 0;
		this._buffers = [];

		// Create Index Buffers
		for (const indexObj of this.indices) {
			indexObj.indexBuffer = Mesh.buildBuffer(null, indexObj.array, "index");
			this._buffers.push(indexObj.indexBuffer);
			this.triangleCount += indexObj.array.length / 3;
		}

		const vertexCount = this.vertices.length / 3;

		// Position
		this.vertexBuffer = Mesh.buildBuffer(null, this.vertices, "vertex");
		this._buffers.push(this.vertexBuffer);

		// UVs
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

		// Normals
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

		// Base attributes (positions, UVs, normals - no lightmap UVs)
		const baseAttributes = [
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
	}

	bind(useSkinned = true) {
		// Default to skinned VAO for SkinnedMesh
		const vao = useSkinned ? this.skinnedVao : this.vao;
		Backend.bindVertexState(vao);
	}

	// Get bone matrices for GPU skinning (flat Float32Array of mat4s)
	// Always returns 64 matrices (4096 bytes) for WebGPU uniform buffer compatibility
	getBoneMatricesForGPU(pose) {
		if (!this.skeleton) return null;

		const skinMatrices = this.skeleton.computeSkinningMatrices(
			pose.localTransforms,
		);
		const count = skinMatrices.length;

		// Always allocate 64 matrices for uniform buffer alignment
		const result = new Float32Array(64 * 16);

		for (let i = 0; i < count; i++) {
			result.set(skinMatrices[i], i * 16);
		}
		// Remaining matrices stay as identity (zeros, which is fine as they won't be used)

		return result;
	}
}

export default SkinnedMesh;
