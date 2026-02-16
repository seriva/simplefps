import { Pose } from "./skeleton.js";

class Animation {
	constructor(data) {
		this.ready = this._initialize(data);
	}

	async _initialize(data) {
		let parsedData = data;

		// Handle Blob input (binary animation)
		if (data instanceof Blob) {
			parsedData = await this._parseBlob(data);
		}

		this.name = parsedData.name || "unnamed";
		this.frameRate = parsedData.frameRate || 24;
		this.frames = parsedData.frames || [];
		this.numFrames = this.frames.length;
		this.duration =
			this.numFrames > 0 ? (this.numFrames - 1) / this.frameRate : 0;
		this.jointCount = this.frames[0]?.joints?.length || 0;

		// Per-frame bounding boxes (min/max pairs)
		this.bounds = parsedData.bounds || null;

		// Pre-compute frame poses from raw frame data
		this._framePoses = this.frames.map((frame) => {
			const pose = new Pose(this.jointCount);
			for (let j = 0; j < this.jointCount; j++) {
				const joint = frame.joints[j];
				pose.setJointTransform(j, joint.pos, joint.rot);
			}
			return pose;
		});

		// Free raw frame data after converting to poses (saves memory)
		this.frames = null;

		// Reusable bounds object to avoid allocations
		this._boundsResult = { min: [0, 0, 0], max: [0, 0, 0] };

		// Reusable frame info object to avoid allocations in hot path
		this._frameInfo = { frame0: 0, frame1: 0, alpha: 0 };
	}

	async _parseBlob(blob) {
		const buffer = await blob.arrayBuffer();
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

		return { frameRate, frames, bounds };
	}

	// Calculate frame indices and interpolation factor for a given time
	_getFrameInfo(time, loop) {
		const info = this._frameInfo;
		if (this.numFrames <= 1) {
			info.frame0 = 0;
			info.frame1 = 0;
			info.alpha = 0;
			return info;
		}

		let t = time;
		if (loop && this.duration > 0) {
			t = t % this.duration;
			if (t < 0) t += this.duration;
		} else {
			t = Math.max(0, Math.min(t, this.duration));
		}

		const frameTime = t * this.frameRate;
		info.frame0 = Math.min(Math.floor(frameTime), this.numFrames - 1);
		info.frame1 = Math.min(info.frame0 + 1, this.numFrames - 1);
		info.alpha = frameTime - Math.floor(frameTime);

		return info;
	}

	sample(time, outPose, loop = true) {
		if (this.numFrames === 0) return;

		const { frame0, frame1, alpha } = this._getFrameInfo(time, loop);

		if (alpha < 0.001 || frame0 === frame1) {
			outPose.copyFrom(this._framePoses[frame0]);
		} else {
			Pose.lerp(
				outPose,
				this._framePoses[frame0],
				this._framePoses[frame1],
				alpha,
			);
		}
	}

	// Sample bounding box at a given time (reuses internal object)
	sampleBounds(time, loop = true) {
		if (!this.bounds || this.numFrames === 0) return null;

		const { frame0, frame1, alpha } = this._getFrameInfo(time, loop);

		const b0 = this.bounds[frame0];
		const b1 = this.bounds[frame1];
		const out = this._boundsResult;

		if (alpha < 0.001 || frame0 === frame1) {
			out.min[0] = b0.min[0];
			out.min[1] = b0.min[1];
			out.min[2] = b0.min[2];
			out.max[0] = b0.max[0];
			out.max[1] = b0.max[1];
			out.max[2] = b0.max[2];
		} else {
			// Lerp between bounding boxes
			out.min[0] = b0.min[0] + (b1.min[0] - b0.min[0]) * alpha;
			out.min[1] = b0.min[1] + (b1.min[1] - b0.min[1]) * alpha;
			out.min[2] = b0.min[2] + (b1.min[2] - b0.min[2]) * alpha;
			out.max[0] = b0.max[0] + (b1.max[0] - b0.max[0]) * alpha;
			out.max[1] = b0.max[1] + (b1.max[1] - b0.max[1]) * alpha;
			out.max[2] = b0.max[2] + (b1.max[2] - b0.max[2]) * alpha;
		}

		return out;
	}
}

export default Animation;
