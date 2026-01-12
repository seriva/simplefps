import { mat4, quat } from "../../dependencies/gl-matrix.js";

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

		// Temporary storage for global matrices to compute local transforms
		const globalMatrices = [];

		for (let i = 0; i < this.jointCount; i++) {
			const j = jointsData[i];
			const joint = this.joints[i];

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
			const pos = new Float32Array(3);
			const rot = quat.create();
			mat4.getTranslation(pos, localMatrix);
			mat4.getRotation(rot, localMatrix);
			quat.normalize(rot, rot); // Ensure normalized

			joint.localBindPos.set(pos);
			joint.localBindRot.set(rot);
		}

		// Compute inverse bind matrices for skinning
		this.inverseBindMatrices = this.joints.map((j) => {
			const inv = mat4.create();
			mat4.invert(inv, j.bindPoseMatrix);
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

	#computeWorldMatrices(pose) {
		const worldMatrices = this._worldMatrices;
		const localMatrix = this._tempMatrix;
		const positions = pose.positions;
		const rotations = pose.rotations;

		for (let i = 0; i < this.jointCount; i++) {
			const joint = this.joints[i];
			const pi = i * 3;
			const ri = i * 4;

			// Inline fromRotationTranslation for performance
			const qx = rotations[ri],
				qy = rotations[ri + 1],
				qz = rotations[ri + 2],
				qw = rotations[ri + 3];
			const x2 = qx + qx,
				y2 = qy + qy,
				z2 = qz + qz;
			const xx = qx * x2,
				xy = qx * y2,
				xz = qx * z2;
			const yy = qy * y2,
				yz = qy * z2,
				zz = qz * z2;
			const wx = qw * x2,
				wy = qw * y2,
				wz = qw * z2;

			localMatrix[0] = 1 - (yy + zz);
			localMatrix[1] = xy + wz;
			localMatrix[2] = xz - wy;
			localMatrix[3] = 0;
			localMatrix[4] = xy - wz;
			localMatrix[5] = 1 - (xx + zz);
			localMatrix[6] = yz + wx;
			localMatrix[7] = 0;
			localMatrix[8] = xz + wy;
			localMatrix[9] = yz - wx;
			localMatrix[10] = 1 - (xx + yy);
			localMatrix[11] = 0;
			localMatrix[12] = positions[pi];
			localMatrix[13] = positions[pi + 1];
			localMatrix[14] = positions[pi + 2];
			localMatrix[15] = 1;

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
}

class Pose {
	constructor(jointCount) {
		this.jointCount = jointCount;
		// Flat typed arrays for better cache locality and less GC pressure
		// positions: 3 floats per joint, rotations: 4 floats per joint
		this.positions = new Float32Array(jointCount * 3);
		this.rotations = new Float32Array(jointCount * 4);

		// Initialize rotations to identity quaternion (0,0,0,1)
		for (let i = 0; i < jointCount; i++) {
			this.rotations[i * 4 + 3] = 1;
		}
	}

	setJointTransform(index, pos, rot) {
		const pi = index * 3;
		const ri = index * 4;
		this.positions[pi] = pos[0];
		this.positions[pi + 1] = pos[1];
		this.positions[pi + 2] = pos[2];
		this.rotations[ri] = rot[0];
		this.rotations[ri + 1] = rot[1];
		this.rotations[ri + 2] = rot[2];
		this.rotations[ri + 3] = rot[3];
	}

	copyFrom(other) {
		this.positions.set(other.positions);
		this.rotations.set(other.rotations);
	}

	static lerp(out, poseA, poseB, t) {
		const outPos = out.positions;
		const outRot = out.rotations;
		const aPos = poseA.positions;
		const aRot = poseA.rotations;
		const bPos = poseB.positions;
		const bRot = poseB.rotations;

		for (let i = 0; i < out.jointCount; i++) {
			const pi = i * 3;
			const ri = i * 4;

			// Lerp position
			outPos[pi] = aPos[pi] + (bPos[pi] - aPos[pi]) * t;
			outPos[pi + 1] = aPos[pi + 1] + (bPos[pi + 1] - aPos[pi + 1]) * t;
			outPos[pi + 2] = aPos[pi + 2] + (bPos[pi + 2] - aPos[pi + 2]) * t;

			// Slerp rotation (inlined for performance)
			let ax = aRot[ri],
				ay = aRot[ri + 1],
				az = aRot[ri + 2],
				aw = aRot[ri + 3];
			let bx = bRot[ri],
				by = bRot[ri + 1],
				bz = bRot[ri + 2],
				bw = bRot[ri + 3];

			let dot = ax * bx + ay * by + az * bz + aw * bw;
			if (dot < 0) {
				dot = -dot;
				bx = -bx;
				by = -by;
				bz = -bz;
				bw = -bw;
			}

			let s0, s1;
			if (1.0 - dot > 0.000001) {
				const omega = Math.acos(dot);
				const sinOmega = Math.sin(omega);
				s0 = Math.sin((1 - t) * omega) / sinOmega;
				s1 = Math.sin(t * omega) / sinOmega;
			} else {
				s0 = 1 - t;
				s1 = t;
			}

			outRot[ri] = s0 * ax + s1 * bx;
			outRot[ri + 1] = s0 * ay + s1 * by;
			outRot[ri + 2] = s0 * az + s1 * bz;
			outRot[ri + 3] = s0 * aw + s1 * bw;
		}
	}
}

export { Skeleton, Pose };
