import { mat4 } from "../../dependencies/gl-matrix.js";
import AnimationPlayer from "../animation/animationplayer.js";
import BoundingBox from "../core/boundingbox.js";
import Mesh from "../rendering/mesh.js";
import { Shaders } from "../rendering/shaders.js";
import Resources from "../systems/resources.js";
import { EntityTypes } from "./entity.js";
import MeshEntity from "./meshentity.js";
import Scene from "./scene.js";

const _tempMatrix = mat4.create();
const _tempPos = new Float32Array(3);
const _tempProbeColor = new Float32Array(3);

// Reusable bounding boxes to avoid per-frame allocations
const _localBB = new BoundingBox([0, 0, 0], [1, 1, 1]);

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

		// Ambient lighting
		mat4.getTranslation(_tempPos, _tempMatrix);
		_tempPos[1] += 32.0;
		Scene.getAmbient(_tempPos, _tempProbeColor);
		shader.setVec3("uProbeColor", _tempProbeColor);

		shader.setMat4("matWorld", _tempMatrix);
		shader.setMat4Array("boneMatrices", this._boneMatrices);
		this.mesh.renderSingle(true, null, filter, shader, true);
	}

	renderShadow(mode = "all", shader = Shaders.skinnedEntityShadows) {
		if (!this.visible || !this._boneMatrices) return;
		if (!this.castShadow) return;
		if (!shader) return;

		// Always recalculate shadow height for skinned meshes since they move
		this.calculateShadowHeight();
		if (this.shadowHeight === undefined) return;

		// Use the original base_matrix (shader will flatten Y to shadowHeight)
		shader.setMat4("matWorld", this.base_matrix);
		shader.setFloat("shadowHeight", this.shadowHeight);
		shader.setMat4Array("boneMatrices", this._boneMatrices);
		this.mesh.renderSingle(false, null, mode, shader, true);
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
		const pose = this.animationPlayer.getPose();
		const worldMatrices = skeleton.getWorldMatrices(pose);

		const vertices = this._skeletonMesh.vertices;
		const pos = [0, 0, 0];

		for (let i = 0; i < skeleton.joints.length; i++) {
			mat4.getTranslation(pos, worldMatrices[i]);
			vertices[i * 3] = pos[0];
			vertices[i * 3 + 1] = pos[1];
			vertices[i * 3 + 2] = pos[2];
		}

		this._skeletonMesh.updateVertexBuffer(vertices);

		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		const debugShader = Shaders.debug;
		debugShader.bind();
		debugShader.setMat4("matWorld", _tempMatrix);
		debugShader.setVec4("debugColor", [0, 1, 0, 1]);

		this._skeletonMesh.renderSingle(false, "lines", "all", debugShader);
	}

	updateBoundingVolume() {
		if (!this.animationPlayer) return;

		const animBounds = this.animationPlayer.getCurrentBounds();
		if (!animBounds) return;

		// Reuse bounding box objects instead of creating new ones each frame
		_localBB.set(animBounds.min, animBounds.max);
		mat4.multiply(_tempMatrix, this.base_matrix, this.ani_matrix);

		if (!this.boundingBox) {
			this.boundingBox = new BoundingBox([0, 0, 0], [1, 1, 1]);
		}
		_localBB.transformInto(_tempMatrix, this.boundingBox);
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

	/**
	 * Dispose of entity resources including skeleton debug mesh.
	 */
	dispose() {
		super.dispose();
		this.animationPlayer = null;
		this._boneMatrices = null;

		// Clean up skeleton debug mesh if created
		if (this._skeletonMesh) {
			this._skeletonMesh.dispose();
			this._skeletonMesh = null;
		}
	}
}

export default SkinnedMeshEntity;
