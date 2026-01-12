import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import AnimationPlayer from "../animation/animationplayer.js";
import Mesh from "../rendering/mesh.js";
import { Shaders } from "../rendering/shaders.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";
import MeshEntity from "./meshentity.js";

const _tempMatrix = mat4.create();

class SkinnedMeshEntity extends MeshEntity {
	constructor(position, meshName, updateCallback, scale = 1) {
		super(position, meshName, updateCallback, scale);
		this.type = EntityTypes.SKINNED_MESH;
		this.mesh = Resources.get(meshName);
		this.scale = scale;
		this.debugSkeleton = false;
		this._boneMatrices = null;

		if (this.mesh?.skeleton) {
			this.animationPlayer = new AnimationPlayer(this.mesh.skeleton);
		} else {
			this.animationPlayer = null;
		}
	}

	playAnimation(animName, reset = true) {
		if (!this.animationPlayer) return;
		const anim = Resources.get(animName);
		if (anim) {
			this.animationPlayer.play(anim, reset);
		}
	}

	stopAnimation() {
		this.animationPlayer?.stop();
	}

	update(deltaTime) {
		if (!this.visible) return;

		if (this.animationPlayer && this.mesh?.skeleton) {
			// deltaTime is in milliseconds, convert to seconds for animation
			const pose = this.animationPlayer.update(deltaTime / 1000);
			// Compute bone matrices for GPU skinning
			this._boneMatrices = this.mesh.getBoneMatricesForGPU(pose);
		}

		super.update?.(deltaTime);
	}

	render(filter = null, shader = Shaders.skinnedGeometry) {
		if (!this.visible || !this._boneMatrices) return;
		if (!shader) return;

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		shader.setMat4("matWorld", _tempMatrix);
		shader.setMat4Array("boneMatrices", this._boneMatrices);
		this.mesh.renderSingle(true, null, filter, shader, true);
	}

	renderShadow(mode = "all", shader = Shaders.skinnedEntityShadows) {
		if (!this.visible || !this._boneMatrices) return;
		if (!this.castShadow) return;
		if (!shader) return;
		if (this.shadowHeight === null) {
			this.calculateShadowHeight();
		}
		if (this.shadowHeight === undefined) return;

		// Build shadow matrix
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		_tempMatrix[1] *= 0.1;
		_tempMatrix[5] *= 0.1;
		_tempMatrix[9] *= 0.1;
		_tempMatrix[13] = this.shadowHeight;

		shader.setMat4("matWorld", _tempMatrix);
		shader.setMat4Array("boneMatrices", this._boneMatrices);
		this.mesh.renderSingle(false, null, mode, null, true);
	}

	// Render animated wireframe using skinnedDebug shader
	renderWireFrame() {
		if (!this.visible || !this._boneMatrices) return;

		const skinnedDebug = Shaders.skinnedDebug;
		if (!skinnedDebug) {
			// Fallback to bind pose if skinned debug shader not available
			mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
			Shaders.debug.setMat4("matWorld", _tempMatrix);
			this.mesh.renderWireFrame();
			return;
		}

		skinnedDebug.bind();
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		skinnedDebug.setMat4("matWorld", _tempMatrix);
		skinnedDebug.setMat4Array("boneMatrices", this._boneMatrices);
		skinnedDebug.setVec4("debugColor", [1, 1, 1, 1]);
		this.mesh.renderWireFrame(true); // true = use skinned VAO

		// Restore debug shader for other entities
		Shaders.debug.bind();
	}

	renderDebugSkeleton() {
		if (!this.visible || !this.mesh?.skeleton || !this.animationPlayer) return;

		const skeleton = this.mesh.skeleton;
		const pose = this.animationPlayer.getPose();
		const jointPositions = skeleton.getJointPositions(pose.localTransforms);

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		const debugShader = Shaders.debug;
		debugShader.bind();
		debugShader.setMat4("matWorld", _tempMatrix);
		debugShader.setVec4("debugColor", [0, 1, 0, 1]);

		for (let i = 0; i < skeleton.joints.length; i++) {
			const joint = skeleton.joints[i];
			if (joint.parent >= 0) {
				const _parentPos = jointPositions[joint.parent];
				const _childPos = jointPositions[i];
				// Would draw line here with debug line system
			}
		}
	}

	_skeletonMesh = null;

	_initSkeletonMesh() {
		if (this._skeletonMesh) return;
		const skeleton = this.mesh?.skeleton;
		if (!skeleton) return;

		const indices = [];
		// Create lines for bone hierarchy
		for (let i = 0; i < skeleton.joints.length; i++) {
			const joint = skeleton.joints[i];
			if (joint.parent >= 0) {
				indices.push(joint.parent, i);
			}
		}

		// Initial vertices (zeros)
		const vertices = new Float32Array(skeleton.joints.length * 3);

		// Create mesh
		this._skeletonMesh = new Mesh({
			vertices: vertices,
			indices: [{ material: "none", array: indices }],
			uvs: [],
			normals: [],
		});
	}

	renderSkeleton() {
		if (!this.visible || !this.mesh?.skeleton || !this.animationPlayer) return;

		this._initSkeletonMesh();
		if (!this._skeletonMesh) return;

		const skeleton = this.mesh.skeleton;
		// Get current pose from animation player
		const pose = this.animationPlayer.getPose();
		// Compute world matrices for current pose
		const worldMatrices = skeleton.getWorldMatrices(pose.localTransforms);

		const vertices = this._skeletonMesh.vertices;
		const pos = [0, 0, 0];

		for (let i = 0; i < skeleton.joints.length; i++) {
			// Extract translation from world matrix
			mat4.getTranslation(pos, worldMatrices[i]);
			vertices[i * 3] = pos[0];
			vertices[i * 3 + 1] = pos[1];
			vertices[i * 3 + 2] = pos[2];
		}

		// Update GPU buffer
		this._skeletonMesh.updateVertexBuffer(vertices);

		// Render
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		// Diagnostic: Check if matrix scale matches entity scale
		const currentScale = mat4.getScaling(vec3.create(), _tempMatrix);
		const diff = Math.abs(currentScale[0] - this.scale);
		if (diff > 0.001 && this.scale !== 1 && Math.random() < 0.001) {
			Console.warn(
				`Skeleton Scale Mismatch! Prop: ${this.scale}, Matrix: ${currentScale[0]}`,
			);
			// Attempt auto-fix for debug
			// mat4.scale(_tempMatrix, _tempMatrix, [this.scale/currentScale[0], this.scale/currentScale[1], this.scale/currentScale[2]]);
		}
		// Log scale once
		if (Math.random() < 0.01) {
			const output = mat4.getScaling([0, 0, 0], _tempMatrix);
			console.log("Skeleton Render Scale:", output, "Base Scale:", this.scale);
		}

		const debugShader = Shaders.debug;
		debugShader.bind();
		debugShader.setMat4("matWorld", _tempMatrix);
		debugShader.setVec4("debugColor", [0, 1, 0, 1]); // Green bones

		// Render as lines
		this._skeletonMesh.renderSingle(false, "lines", "all", debugShader);
	}

	updateBoundingVolume() {
		if (!this.mesh) return;

		if (this.mesh.updateBoundingBox) {
			this.mesh.updateBoundingBox();
		}

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		this.boundingBox = this.mesh.boundingBox?.transform(_tempMatrix);
	}

	isPlaying() {
		return this.animationPlayer?.isPlaying() || false;
	}

	getAnimationProgress() {
		return this.animationPlayer?.getProgress() || 0;
	}

	setAnimationSpeed(speed) {
		if (this.animationPlayer) {
			this.animationPlayer.speed = speed;
		}
	}

	setAnimationLoop(loop) {
		if (this.animationPlayer) {
			this.animationPlayer.loop = loop;
		}
	}
}

export default SkinnedMeshEntity;
