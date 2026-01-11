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

	static fromBlob(blob) {
		return blob.arrayBuffer().then((buffer) => {
			const view = new DataView(buffer);
			let offset = 0;

			const frameRate = view.getUint32(offset, true);
			offset += 4;
			const numFrames = view.getUint32(offset, true);
			offset += 4;
			const numJoints = view.getUint32(offset, true);
			offset += 4;

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

			return new Animation({ frameRate, frames });
		});
	}
}

export default Animation;
