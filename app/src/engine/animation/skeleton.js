import { mat4, quat, vec3 } from "../../dependencies/gl-matrix.js";

class Skeleton {
	constructor(jointsData) {
		// MD5 mesh joints are in Object Space (Global).
		// We need to convert them to Local Space for the animation system.
		this.joints = jointsData.map((j, index) => ({
			name: j.name,
			parent: j.parent,
			// Store explicit Global Bind Pose for skinning, if needed
			bindPoseMatrix: null, // Will be computed
			// Local transforms will be computed below
			localBindPos: new Float32Array(3),
			localBindRot: new Float32Array(4),
			index: index,
		}));

		this.jointCount = this.joints.length;
		this.jointMap = new Map();

		// Temporary storage for global matrices to compute local transforms
		const globalMatrices = [];

		for (let i = 0; i < this.jointCount; i++) {
			const j = jointsData[i];
			const joint = this.joints[i];

			this.jointMap.set(joint.name, joint);

			// Construct Global Matrix from MD5 data
			const globalMatrix = mat4.create();
			mat4.fromRotationTranslation(globalMatrix, j.rot, j.pos);
			globalMatrices.push(globalMatrix);
			joint.bindPoseMatrix = globalMatrix;

			// Compute Local Transform
			const localMatrix = mat4.create();
			if (joint.parent >= 0) {
				const parentGlobal = globalMatrices[joint.parent];
				const parentInverse = mat4.create();
				mat4.invert(parentInverse, parentGlobal);
				mat4.multiply(localMatrix, parentInverse, globalMatrix);
			} else {
				mat4.copy(localMatrix, globalMatrix);
			}

			// Extract Pos/Rot from Local Matrix
			const pos = vec3.create();
			const rot = quat.create();
			mat4.getTranslation(pos, localMatrix);
			mat4.getRotation(rot, localMatrix);
			quat.normalize(rot, rot); // Ensure normalized

			joint.localBindPos.set(pos);
			joint.localBindRot.set(rot);
		}

		// bindPoseMatrices should be the Global matrices (which we already computed)
		this.bindPoseMatrices = this.joints.map((j) => j.bindPoseMatrix);

		this.inverseBindMatrices = this.bindPoseMatrices.map((m) => {
			const inv = mat4.create();
			mat4.invert(inv, m);
			return inv;
		});

		// Pre-allocate caches for runtime matrices
		this._worldMatrices = Array.from({ length: this.jointCount }, () =>
			mat4.create(),
		);
		this._skinMatrices = Array.from({ length: this.jointCount }, () =>
			mat4.create(),
		);
		this._tempMatrix = mat4.create();
	}

	getJoint(name) {
		return this.jointMap.get(name);
	}

	getJointByIndex(index) {
		return this.joints[index];
	}

	#computeWorldMatrices(pose) {
		const worldMatrices = this._worldMatrices;
		const localMatrix = this._tempMatrix;

		for (let i = 0; i < this.jointCount; i++) {
			const joint = this.joints[i];
			const jointPose = pose[i];

			// Compute local matrix
			mat4.fromRotationTranslation(localMatrix, jointPose.rot, jointPose.pos);

			// Compute world matrix
			const worldMatrix = worldMatrices[i];
			if (joint.parent >= 0) {
				mat4.multiply(worldMatrix, worldMatrices[joint.parent], localMatrix);
			} else {
				mat4.copy(worldMatrix, localMatrix);
			}
		}

		return worldMatrices;
	}

	getWorldMatrices(pose) {
		return this.#computeWorldMatrices(pose);
	}

	// For poses that are already in World/Object space (like MD5)
	getDirectWorldMatrices(pose) {
		const matrices = [];
		const _localMatrix = mat4.create();

		for (let i = 0; i < this.jointCount; i++) {
			const jointPose = pose[i];
			const matrix = mat4.create();
			mat4.fromRotationTranslation(matrix, jointPose.rot, jointPose.pos);
			matrices.push(matrix);
		}
		return matrices;
	}

	computeSkinningMatrices(pose) {
		this.#computeWorldMatrices(pose); // Populates this._worldMatrices
		const skinMatrices = this._skinMatrices;

		for (let i = 0; i < this.jointCount; i++) {
			mat4.multiply(
				skinMatrices[i],
				this._worldMatrices[i],
				this.inverseBindMatrices[i],
			);
		}

		return skinMatrices;
	}

	getJointPositions(pose) {
		const worldMatrices = this.#computeWorldMatrices(pose);
		const positions = [];

		for (const matrix of worldMatrices) {
			const pos = vec3.create();
			mat4.getTranslation(pos, matrix);
			positions.push(pos);
		}

		return positions;
	}
}

class Pose {
	constructor(jointCount) {
		this.jointCount = jointCount;
		this.localTransforms = [];

		for (let i = 0; i < jointCount; i++) {
			this.localTransforms.push({
				pos: vec3.create(),
				rot: quat.create(),
			});
		}
	}

	setJointTransform(index, pos, rot) {
		vec3.copy(this.localTransforms[index].pos, pos);
		quat.copy(this.localTransforms[index].rot, rot);
	}

	copyFrom(other) {
		for (let i = 0; i < this.jointCount; i++) {
			vec3.copy(this.localTransforms[i].pos, other.localTransforms[i].pos);
			quat.copy(this.localTransforms[i].rot, other.localTransforms[i].rot);
		}
	}

	static lerp(out, poseA, poseB, t) {
		for (let i = 0; i < out.jointCount; i++) {
			quat.slerp(
				out.localTransforms[i].rot,
				poseA.localTransforms[i].rot,
				poseB.localTransforms[i].rot,
				t,
			);
			vec3.lerp(
				out.localTransforms[i].pos,
				poseA.localTransforms[i].pos,
				poseB.localTransforms[i].pos,
				t,
			);
		}
	}
}

export { Skeleton, Pose };
