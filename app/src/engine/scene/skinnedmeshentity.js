import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import AnimationPlayer from "../animation/animationplayer.js";
import Mesh from "../rendering/mesh.js";
import { Shaders } from "../rendering/shaders.js";
import Resources from "../systems/resources.js";
import { Entity, EntityTypes } from "./entity.js";

const _tempMatrix = mat4.create();

class SkinnedMeshEntity extends Entity {
	constructor(position, meshName, updateCallback, scale = 1) {
		super(EntityTypes.MESH, updateCallback);
		this.mesh = Resources.get(meshName);
		this.scale = scale;
		this.debugSkeleton = false;

		if (this.mesh?.skeleton) {
			this.animationPlayer = new AnimationPlayer(this.mesh.skeleton);
		} else {
			this.animationPlayer = null;
		}

		mat4.translate(this.base_matrix, this.base_matrix, position);
		mat4.scale(this.base_matrix, this.base_matrix, [scale, scale, scale]);
	}

	setRotation(rotation) {
		mat4.rotateX(
			this.base_matrix,
			this.base_matrix,
			(rotation[0] * Math.PI) / 180,
		);
		mat4.rotateY(
			this.base_matrix,
			this.base_matrix,
			(rotation[1] * Math.PI) / 180,
		);
		mat4.rotateZ(
			this.base_matrix,
			this.base_matrix,
			(rotation[2] * Math.PI) / 180,
		);
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

		if (this.animationPlayer) {
			// deltaTime is in milliseconds, convert to seconds for animation
			const pose = this.animationPlayer.update(deltaTime / 1000);

			if (this.mesh?.skeleton) {
				this.mesh.applySkinning(pose);
			}
		}

		super.update?.(deltaTime);
	}

	render(filter = null, shader = Shaders.geometry) {
		if (!this.visible || !this.mesh) return;

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		shader.setMat4("matWorld", _tempMatrix);
		this.mesh.renderSingle(true, null, filter, shader);
	}

	renderShadow() {
		// Skinned meshes don't cast shadows for now (would need shadow height calculation)
		// Can be implemented later if needed
	}

	renderWireFrame() {
		if (!this.visible || !this.mesh) return;
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);
		Shaders.debug.setMat4("matWorld", _tempMatrix);
		if (this.mesh.renderWireFrame) {
			this.mesh.renderWireFrame();
		}
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
