import * as CANNON from "../dependencies/cannon-es.js";
import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Physics } from "../engine/core/engine.js";

const _worldUp = vec3.fromValues(0, 1, 0);
const _rightVector = vec3.create();

// Internal physics vectors (reused)
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = { skipBackfaces: true };
const _wishDir = vec3.create();
const _currentVel = vec3.create();

// Constants
const JUMP_THRESHOLD = 10;
const LAND_TIME_THRESHOLD = 0.15;
const DIRECTION_CHANGE_TIME = 0.15;
const MAX_VELOCITY_CHANGE = 50;
const ACCEL_REDUCTION = 0.3;
const COYOTE_TIME = 0.2;

// Collision groups
const COLLISION_GROUPS = {
	WORLD: 1,
	PLAYER: 2,
	PROJECTILE: 4,
};

let _noclip = false;
const _NOCLIP_SPEED = 500;

class FPSController {
	constructor(position, config = {}) {
		// Configuration
		this.config = {
			radius: config.radius || 35,
			height: config.height || 60,
			eyeHeight: config.eyeHeight || 56,
			mass: config.mass || 80,
			linearDamping: config.linearDamping || 0,
			jumpVelocity: config.jumpVelocity || 350,
			groundAcceleration: config.groundAcceleration || 550000,
			airAcceleration: config.airAcceleration || 800,
			friction: config.friction || 450,
			maxSpeed: config.maxSpeed || 300,
			onLand: config.onLand || (() => {}),
			onJump: config.onJump || (() => {}),

			// Wobble config
			wobbleFrequency: config.wobbleFrequency || 8,
			wobbleIntensity: config.wobbleIntensity || 1,
		};

		// Physics Body
		const shape = new CANNON.Sphere(this.config.radius);
		this.body = new CANNON.Body({
			mass: this.config.mass,
			shape: shape,
			position: new CANNON.Vec3(
				position[0],
				position[1] + this.config.height / 2,
				position[2],
			),
			fixedRotation: true,
			linearDamping: this.config.linearDamping,
			collisionFilterGroup: COLLISION_GROUPS.PLAYER,
			collisionFilterMask:
				COLLISION_GROUPS.WORLD |
				COLLISION_GROUPS.PLAYER |
				COLLISION_GROUPS.PROJECTILE,
		});

		this.body.material = new CANNON.Material("player");
		this.body.allowSleep = false;
		Physics.addBody(this.body);

		// Contact Material
		const worldMaterial = Physics.getWorldMaterial();
		if (worldMaterial) {
			Physics.addContactMaterial(this.body.material, worldMaterial, {
				friction: 0.0,
				restitution: 0.0,
				contactEquationStiffness: 1e8,
				contactEquationRelaxation: 3,
			});
		}

		// State
		this.lastWishDir = vec3.create();
		this.directionChangeTimer = 0;
		this.wasGrounded = true;
		this.airTime = 0;
		this.bobPhase = 0;
		this.currentRoll = 0;
	}

	isGrounded() {
		if (this.body.velocity.y > JUMP_THRESHOLD) {
			return false;
		}

		const rayLength = this.config.radius + 5;
		_rayFrom.set(
			this.body.position.x,
			this.body.position.y,
			this.body.position.z,
		);
		_rayTo.set(
			this.body.position.x,
			this.body.position.y - rayLength,
			this.body.position.z,
		);

		_rayResult.reset();
		Physics.getWorld().raycastClosest(
			_rayFrom,
			_rayTo,
			_rayOptions,
			_rayResult,
		);

		return _rayResult.hasHit && _rayResult.body !== this.body;
	}

	update(frameTime) {
		if (_noclip) return;

		const dt = frameTime;
		const grounded = this.isGrounded();
		if (grounded) {
			if (!this.wasGrounded && this.airTime > LAND_TIME_THRESHOLD) {
				this.config.onLand();
			}
			this.airTime = 0;

			const horizontalDamping = 0.98;
			const dampingFactorXZ = (1 - horizontalDamping) ** dt;
			this.body.velocity.x *= dampingFactorXZ;
			this.body.velocity.z *= dampingFactorXZ;
		} else {
			this.airTime += dt;
		}

		this.wasGrounded = grounded;

		const verticalDamping = 0.01;
		const dampingFactorY = (1 - verticalDamping) ** dt;
		this.body.velocity.y *= dampingFactorY;
	}

	move(strafe, move, cameraForward, cameraRight, frameTime) {
		if (_noclip) {
			this._noclipMove(strafe, move, cameraForward, cameraRight, frameTime);
			return;
		}

		const dt = frameTime;
		const grounded = this.isGrounded();

		// Calculate wish direction
		vec3.zero(_wishDir);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraForward, move);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraRight, strafe);
		_wishDir[1] = 0; // Enforce horizontal

		const wishDirLength = vec3.length(_wishDir);
		if (wishDirLength > 0.001) {
			vec3.scale(_wishDir, _wishDir, 1 / wishDirLength);
		}

		// Detect rapid direction changes
		const directionDot = vec3.dot(_wishDir, this.lastWishDir);
		if (directionDot < 0 && wishDirLength > 0.1) {
			this.directionChangeTimer = DIRECTION_CHANGE_TIME;
		}
		vec3.copy(this.lastWishDir, _wishDir);

		this.directionChangeTimer = Math.max(0, this.directionChangeTimer - dt);

		const clampedLength = Math.min(wishDirLength, 1.0);
		const wishSpeed = this.config.maxSpeed * clampedLength;

		if (grounded) {
			this._applyGroundMovement(_wishDir, wishSpeed, dt);
		} else {
			this._applyAirMovement(_wishDir, wishSpeed, dt);
		}
	}

	jump() {
		if (this.isGrounded() || this.airTime < COYOTE_TIME) {
			this.body.velocity.y = this.config.jumpVelocity;
			this.config.onJump();
			this.airTime = COYOTE_TIME;
		}
	}

	_applyGroundMovement(wishDir, wishSpeed, dt) {
		if (wishSpeed < 0.1) {
			this.body.velocity.x = 0;
			this.body.velocity.z = 0;
			return;
		}

		let acceleration = this.config.groundAcceleration;
		if (this.directionChangeTimer > 0) {
			acceleration *= ACCEL_REDUCTION;
		}

		this._accelerate(wishDir, wishSpeed, acceleration, dt);
	}

	_applyAirMovement(wishDir, wishSpeed, dt) {
		this._accelerate(wishDir, wishSpeed, this.config.airAcceleration, dt);
	}

	_accelerate(wishDir, wishSpeed, acceleration, dt) {
		const vel = this.body.velocity;
		vec3.set(_currentVel, vel.x, vel.y, vel.z);

		const currentSpeed = vec3.dot(_currentVel, wishDir);
		const addSpeed = wishSpeed - currentSpeed;

		if (addSpeed <= 0) return;

		let accelSpeed = acceleration * dt;
		if (accelSpeed > addSpeed) {
			accelSpeed = addSpeed;
		}

		const maxVelocityChangePerFrame = MAX_VELOCITY_CHANGE;
		if (accelSpeed > maxVelocityChangePerFrame) {
			accelSpeed = maxVelocityChangePerFrame;
		}

		vel.x += wishDir[0] * accelSpeed;
		vel.z += wishDir[2] * accelSpeed;
	}

	syncCamera(frameTime) {
		if (_noclip) return;

		const pos = this.body.position;
		if (pos.x !== 0 || pos.y !== 0 || pos.z !== 0) {
			Camera.position[0] = pos.x;

			// Body is at height/2 (30), Eye is at 56.
			// So CameraY = BodyY - 30 + 56 = BodyY + 26
			const eyeOffset = this.config.eyeHeight - this.config.height / 2;
			Camera.position[1] = pos.y + eyeOffset;

			Camera.position[2] = pos.z;

			// Wobble Logic (Visuals only)
			const vel = this.body.velocity;
			const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

			let targetRoll = 0;
			if (horizontalSpeed > 10 && this.isGrounded()) {
				const speedFactor = Math.min(horizontalSpeed / this.config.maxSpeed, 1);
				this.bobPhase += speedFactor * this.config.wobbleFrequency * frameTime;

				targetRoll =
					((Math.sin(this.bobPhase) * (this.config.wobbleIntensity * Math.PI)) /
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
		Physics.removeBody(this.body);
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
