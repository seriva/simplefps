import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Physics } from "../engine/core/engine.js";
import { SharedPlayerController } from "../shared/playercontroller.js";
import { ClientPhysicsAdapter } from "./clientphysicsadapter.js";

const _worldUp = vec3.fromValues(0, 1, 0);
const _rightVector = vec3.create();

let _noclip = false;
const _NOCLIP_SPEED = 500;

class FPSController {
	constructor(position, config = {}) {
		this.adapter = new ClientPhysicsAdapter();
		this.sharedController = new SharedPlayerController(
			this.adapter,
			position,
			config,
		);

		// Expose body for legacy access if needed (though we should avoid it)
		this.body = this.sharedController.body;

		// Camera wobble config
		this.wobbleConfig = {
			wobbleFrequency: config.wobbleFrequency || 8,
			wobbleIntensity: config.wobbleIntensity || 1,
		};
		// Camera wobble state
		this.bobPhase = 0;
	}

	isGrounded() {
		return this.sharedController.isGrounded();
	}

	update(frameTime) {
		if (_noclip) return;

		// Shared controller update (damping etc)
		// Note: frameTime is in seconds in SharedPlayerController?
		// Game.js calls it with seconds usually?
		// Let's check Game.js: "const ft = frameTime / 1000;" -> Yes, seconds.
		this.sharedController.update(frameTime);
	}

	// Legacy move method called by Game.js
	move(strafe, move, cameraForward, cameraRight, frameTime) {
		if (_noclip) {
			this._noclipMove(strafe, move, cameraForward, cameraRight, frameTime);
			return;
		}

		// Map inputs to SharedController format
		// Input: { moveX, moveZ, forwardDir (vec3), rightDir (vec3) }
		// strafe is X (Right), move is Z (Forward)

		const input = {
			moveX: strafe,
			moveZ: move,
			forwardDir: cameraForward,
			rightDir: cameraRight,
		};

		this.sharedController.applyInput(input, frameTime);
	}

	jump() {
		this.sharedController.jump();
	}

	// Helper to get input state for networking
	getInputState(strafe, move, cameraForward, cameraRight) {
		// We need serialized vectors for the network
		return {
			moveX: strafe,
			moveZ: move,
			forwardDir: [cameraForward[0], cameraForward[1], cameraForward[2]],
			rightDir: [cameraRight[0], cameraRight[1], cameraRight[2]],
			jump: false, // Handled separately? Or need to poll jump key?
			// Actually jump is an event "onJump".
		};
	}

	setVelocity(x, y, z) {
		this.sharedController.setVelocity([x, y, z]);
	}

	getPosition() {
		return this.sharedController.getPosition();
	}

	getVelocity() {
		return this.sharedController.getVelocity();
	}

	syncCamera(frameTime) {
		if (_noclip) return;

		const pos = this.getPosition();
		if (pos[0] !== 0 || pos[1] !== 0 || pos[2] !== 0) {
			Camera.position[0] = pos[0];
			Camera.position[1] = pos[1];
			Camera.position[2] = pos[2];

			// Wobble Logic (Visuals only)
			const vel = this.getVelocity();
			const horizontalSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);

			let targetRoll = 0;
			if (horizontalSpeed > 10 && this.isGrounded()) {
				const speedFactor = Math.min(
					horizontalSpeed / this.sharedController.config.maxSpeed,
					1,
				);
				this.bobPhase +=
					speedFactor * this.wobbleConfig.wobbleFrequency * frameTime;

				targetRoll =
					((Math.sin(this.bobPhase) *
						(this.wobbleConfig.wobbleIntensity * Math.PI)) /
						180) *
					speedFactor;
			} else {
				this.bobPhase *= 0.9;
			}

			const smoothing = 1 - 0.001 ** frameTime;
			this.currentRoll =
				(this.currentRoll || 0) +
				(targetRoll - (this.currentRoll || 0)) * smoothing;

			vec3.cross(_rightVector, Camera.direction, _worldUp);
			vec3.normalize(_rightVector, _rightVector);

			const cosRoll = Math.cos(this.currentRoll);
			const sinRoll = Math.sin(this.currentRoll);
			Camera.upVector[0] = _worldUp[0] * cosRoll + _rightVector[0] * sinRoll;
			Camera.upVector[1] = _worldUp[1] * cosRoll + _rightVector[1] * sinRoll;
			Camera.upVector[2] = _worldUp[2] * cosRoll + _rightVector[2] * sinRoll;
			vec3.normalize(Camera.upVector, Camera.upVector);
		}
	}

	destroy() {
		this.sharedController.destroy();
	}

	_noclipMove(inputX, inputZ, _cameraForward, cameraRight, frameTime) {
		const moveDir = vec3.create();
		vec3.scaleAndAdd(moveDir, moveDir, Camera.direction, inputZ);
		vec3.scaleAndAdd(moveDir, moveDir, cameraRight, inputX);

		const len = vec3.length(moveDir);
		if (len > 0.001) {
			vec3.scale(moveDir, moveDir, 1 / len);
		}

		const speed = _NOCLIP_SPEED * frameTime;
		Camera.position[0] += moveDir[0] * speed;
		Camera.position[1] += moveDir[1] * speed;
		Camera.position[2] += moveDir[2] * speed;
	}
}

Console.registerCmd("tnc", () => {
	_noclip = !_noclip;
});

export default FPSController;
