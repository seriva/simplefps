import { Pose } from "./skeleton.js";

class AnimationPlayer {
	constructor(skeleton) {
		this.skeleton = skeleton;
		this.currentAnimation = null;
		this.currentTime = 0;
		this.speed = 1.0;
		this.loop = true;
		this.playing = false;

		this.pose = new Pose(skeleton.jointCount);

		for (let i = 0; i < skeleton.jointCount; i++) {
			const joint = skeleton.joints[i];
			this.pose.setJointTransform(i, joint.localBindPos, joint.localBindRot);
		}
	}

	play(animation, reset = true) {
		this.currentAnimation = animation;
		if (reset) {
			this.currentTime = 0;
		}
		this.playing = true;
	}

	pause() {
		this.playing = false;
	}

	resume() {
		this.playing = true;
	}

	stop() {
		this.playing = false;
		this.currentTime = 0;
		this.currentAnimation = null;

		for (let i = 0; i < this.skeleton.jointCount; i++) {
			const joint = this.skeleton.joints[i];
			this.pose.setJointTransform(i, joint.localBindPos, joint.localBindRot);
		}
	}

	update(deltaTime) {
		if (this.playing && this.currentAnimation) {
			this.currentTime += deltaTime * this.speed;

			if (!this.loop && this.currentTime >= this.currentAnimation.duration) {
				this.currentTime = this.currentAnimation.duration;
				this.playing = false;
			}

			this.currentAnimation.sample(this.currentTime, this.pose, this.loop);
		}

		return this.pose;
	}

	getPose() {
		return this.pose;
	}

	// Get the current animation's bounding box at current time
	getCurrentBounds() {
		if (!this.currentAnimation) return null;
		return this.currentAnimation.sampleBounds(this.currentTime, this.loop);
	}

	isPlaying() {
		return this.playing;
	}

	getDuration() {
		return this.currentAnimation?.duration || 0;
	}

	getProgress() {
		const duration = this.getDuration();
		if (duration <= 0) return 0;
		return Math.min(this.currentTime / duration, 1);
	}

	seek(time) {
		this.currentTime = time;
		if (this.currentAnimation) {
			this.currentAnimation.sample(this.currentTime, this.pose, this.loop);
		}
	}

	seekProgress(progress) {
		this.seek(progress * this.getDuration());
	}
}

export default AnimationPlayer;
