import { Pose } from "./skeleton.js";

class Animation {
	constructor(data) {
		this.name = data.name || "unnamed";
		this.frameRate = data.frameRate || 24;
		this.frames = data.frames || [];
		this.numFrames = this.frames.length;
		this.duration =
			this.numFrames > 0 ? (this.numFrames - 1) / this.frameRate : 0;
		this.jointCount = this.frames[0]?.joints?.length || 0;

		// Per-frame bounding boxes (min/max pairs)
		this.bounds = data.bounds || null;

		this._framePoses = this.frames.map((frame) => {
			const pose = new Pose(this.jointCount);
			for (let j = 0; j < this.jointCount; j++) {
				const joint = frame.joints[j];
				pose.setJointTransform(j, joint.pos, joint.rot);
			}
			return pose;
		});
	}

	sample(time, outPose, loop = true) {
		if (this.numFrames === 0) return;

		if (this.numFrames === 1) {
			outPose.copyFrom(this._framePoses[0]);
			return;
		}

		let t = time;
		if (loop && this.duration > 0) {
			t = t % this.duration;
			if (t < 0) t += this.duration;
		} else {
			t = Math.max(0, Math.min(t, this.duration));
		}

		const frameTime = t * this.frameRate;
		const frame0 = Math.floor(frameTime);
		const frame1 = Math.min(frame0 + 1, this.numFrames - 1);
		const alpha = frameTime - frame0;

		const clampedFrame0 = Math.min(frame0, this.numFrames - 1);

		if (alpha < 0.001 || frame0 === frame1) {
			outPose.copyFrom(this._framePoses[clampedFrame0]);
		} else {
			Pose.lerp(
				outPose,
				this._framePoses[clampedFrame0],
				this._framePoses[frame1],
				alpha,
			);
		}
	}

	// Sample bounding box at a given time, returns { min, max } or null
	sampleBounds(time, loop = true) {
		if (!this.bounds || this.numFrames === 0) return null;

		if (this.numFrames === 1) {
			return this.bounds[0];
		}

		let t = time;
		if (loop && this.duration > 0) {
			t = t % this.duration;
			if (t < 0) t += this.duration;
		} else {
			t = Math.max(0, Math.min(t, this.duration));
		}

		const frameTime = t * this.frameRate;
		const frame0 = Math.min(Math.floor(frameTime), this.numFrames - 1);
		const frame1 = Math.min(frame0 + 1, this.numFrames - 1);
		const alpha = frameTime - Math.floor(frameTime);

		const b0 = this.bounds[frame0];
		const b1 = this.bounds[frame1];

		if (alpha < 0.001 || frame0 === frame1) {
			return b0;
		}

		// Lerp between bounding boxes
		return {
			min: [
				b0.min[0] + (b1.min[0] - b0.min[0]) * alpha,
				b0.min[1] + (b1.min[1] - b0.min[1]) * alpha,
				b0.min[2] + (b1.min[2] - b0.min[2]) * alpha,
			],
			max: [
				b0.max[0] + (b1.max[0] - b0.max[0]) * alpha,
				b0.max[1] + (b1.max[1] - b0.max[1]) * alpha,
				b0.max[2] + (b1.max[2] - b0.max[2]) * alpha,
			],
		};
	}

	static fromBlob(blob) {
		return blob.arrayBuffer().then((buffer) => {
			const view = new DataView(buffer);
			let offset = 0;

			// Check if this is version 2 format (first value would be 2)
			// Version 1 had frameRate first (typically 24-60)
			const firstValue = view.getUint32(0, true);
			const isVersion2 = firstValue === 2;

			let frameRate, numFrames, numJoints, hasBounds;

			if (isVersion2) {
				// Version 2: version(4) + frameRate(4) + numFrames(4) + numJoints(4) + hasBounds(4)
				offset = 4; // Skip version
				frameRate = view.getUint32(offset, true);
				offset += 4;
				numFrames = view.getUint32(offset, true);
				offset += 4;
				numJoints = view.getUint32(offset, true);
				offset += 4;
				hasBounds = view.getUint32(offset, true) === 1;
				offset += 4;
			} else {
				// Version 1: frameRate(4) + numFrames(4) + numJoints(4)
				frameRate = firstValue;
				offset = 4;
				numFrames = view.getUint32(offset, true);
				offset += 4;
				numJoints = view.getUint32(offset, true);
				offset += 4;
				hasBounds = false;
			}

			const frames = [];
			for (let f = 0; f < numFrames; f++) {
				const joints = [];
				for (let j = 0; j < numJoints; j++) {
					const pos = [
						view.getFloat32(offset, true),
						view.getFloat32(offset + 4, true),
						view.getFloat32(offset + 8, true),
					];
					offset += 12;
					const rot = [
						view.getFloat32(offset, true),
						view.getFloat32(offset + 4, true),
						view.getFloat32(offset + 8, true),
						view.getFloat32(offset + 12, true),
					];
					offset += 16;
					joints.push({ pos, rot });
				}
				frames.push({ joints });
			}

			// Read bounding boxes if present
			let bounds = null;
			if (hasBounds) {
				bounds = [];
				for (let f = 0; f < numFrames; f++) {
					const min = [
						view.getFloat32(offset, true),
						view.getFloat32(offset + 4, true),
						view.getFloat32(offset + 8, true),
					];
					offset += 12;
					const max = [
						view.getFloat32(offset, true),
						view.getFloat32(offset + 4, true),
						view.getFloat32(offset + 8, true),
					];
					offset += 12;
					bounds.push({ min, max });
				}
			}

			return new Animation({ frameRate, frames, bounds });
		});
	}
}

export default Animation;
