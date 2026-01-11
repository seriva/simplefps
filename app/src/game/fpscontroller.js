import * as CANNON from "../dependencies/cannon-es.js";
import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Physics } from "../engine/core/engine.js";

const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = { skipBackfaces: true };
const _wishDir = vec3.create();
const _currentVel = vec3.create();
const _moveDir = vec3.create();
const _positionArray = [0, 0, 0];
const _velocityArray = [0, 0, 0];
const _worldUp = vec3.fromValues(0, 1, 0);
const _rightVector = vec3.create();

let _noclip = false;
const _NOCLIP_SPEED = 500;
const _JUMP_THRESHOLD = 10;
const _LAND_TIME_THRESHOLD = 0.15;
const _DIRECTION_CHANGE_TIME = 0.15;
const _MAX_VELOCITY_CHANGE = 50;
const _ACCEL_REDUCTION = 0.3;
const _COYOTE_TIME = 0.2;

class FPSController {
	constructor(position, config = {}) {
		this.config = {
			radius: config.radius || 35,
			height: config.height || 60,
			eyeHeight: config.eyeHeight || 56,
			mass: config.mass || 80,
			linearDamping: config.linearDamping || 0,
			gravity: config.gravity || 800,
			jumpVelocity: config.jumpVelocity || 350,
			groundAcceleration: config.groundAcceleration || 550000,
			airAcceleration: config.airAcceleration || 800,
			friction: config.friction || 450,
			maxSpeed: config.maxSpeed || 300,
			onLand: config.onLand || (() => {}),
			onJump: config.onJump || (() => {}),
			// Camera wobble settings
			wobbleFrequency: config.wobbleFrequency || 8, // How fast the wobble cycles
			wobbleIntensity: config.wobbleIntensity || 1, // Roll wobble amount (degrees)
		};

		// Camera wobble state
		this.bobPhase = 0;

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
			collisionFilterGroup: 2, // PLAYER group
			collisionFilterMask: 1, // Only collide with WORLD
		});

		// Set up player material
		this.body.material = new CANNON.Material("player");

		this.body.allowSleep = false;

		Physics.addBody(this.body);

		// Set up contact material between player and world
		const worldMaterial = Physics.getWorldMaterial();
		Physics.addContactMaterial(this.body.material, worldMaterial, {
			friction: 0.0, // No friction on walls (allows sliding)
			restitution: 0.0, // No bouncing
			contactEquationStiffness: 1e8,
			contactEquationRelaxation: 3,
		});

		// Track last wish direction for direction change detection
		this.lastWishDir = vec3.create();
		this.directionChangeTimer = 0;
		this.wasGrounded = true;
		this.airTime = 0;
	}

	isGrounded() {
		// If moving upward fast (jumping), definitely not grounded
		// More forgiving threshold allows jump buffering
		if (this.body.velocity.y > _JUMP_THRESHOLD) {
			return false;
		}

		// Use a forgiving raycast downward to detect ground
		// Reuse pre-allocated vectors to avoid GC pressure
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

		// Reset result for reuse
		_rayResult.reset();

		Physics.getWorld().raycastClosest(
			_rayFrom,
			_rayTo,
			_rayOptions,
			_rayResult,
		);

		// Make sure we didn't hit our own body
		return _rayResult.hasHit && _rayResult.body !== this.body;
	}

	update(frameTime) {
		// Skip physics updates in noclip mode
		if (_noclip) return;

		// Gravity is now handled by the physics system

		// Only apply horizontal damping when grounded (friction with ground)
		// Only apply horizontal damping when grounded (friction with ground)
		const grounded = this.isGrounded();
		if (grounded) {
			// Trigger landing animation if we were airborne for a noticeable time (>150ms)
			// This prevents constant triggering while walking down slopes or over small bumps
			if (!this.wasGrounded && this.airTime > _LAND_TIME_THRESHOLD) {
				this.config.onLand();
			}
			this.airTime = 0;

			const horizontalDamping = 0.98; // 98% damping per second for fast stopping
			const dampingFactorXZ = (1 - horizontalDamping) ** frameTime;
			this.body.velocity.x *= dampingFactorXZ;
			this.body.velocity.z *= dampingFactorXZ;
		} else {
			this.airTime += frameTime;
		}

		this.wasGrounded = grounded;

		// Apply slight damping to Y axis (same as grenades) for air resistance
		const verticalDamping = 0.01; // 1% damping like grenades
		const dampingFactorY = (1 - verticalDamping) ** frameTime;
		this.body.velocity.y *= dampingFactorY;
	}

	jump() {
		if (this.isGrounded() || this.airTime < _COYOTE_TIME) {
			this.body.velocity.y = this.config.jumpVelocity;
			this.config.onJump();
			this.airTime = _COYOTE_TIME; // Consume coyote time to prevent double jump
		}
	}

	move(inputX, inputZ, cameraForward, cameraRight, frameTime) {
		// Noclip mode: free-fly movement
		if (_noclip) {
			this._noclipMove(inputX, inputZ, cameraForward, cameraRight, frameTime);
			return;
		}

		const grounded = this.isGrounded();

		// Calculate wish direction from input
		// Use pre-allocated vector to avoid GC pressure
		vec3.zero(_wishDir);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraForward, inputZ);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraRight, inputX);
		_wishDir[1] = 0;

		const wishDirLength = vec3.length(_wishDir);
		if (wishDirLength > 0.001) {
			vec3.scale(_wishDir, _wishDir, 1 / wishDirLength);
		}

		// Detect rapid direction changes (WASD mashing)
		const directionDot = vec3.dot(_wishDir, this.lastWishDir);
		// If direction change is significant (angle > 90 degrees), it's likely WASD mashing
		if (directionDot < 0 && wishDirLength > 0.1) {
			this.directionChangeTimer = _DIRECTION_CHANGE_TIME; // Reduce acceleration for 150ms
		}
		vec3.copy(this.lastWishDir, _wishDir);

		// Decay the timer
		this.directionChangeTimer = Math.max(
			0,
			this.directionChangeTimer - frameTime,
		);

		// Clamp to 1.0 to prevent diagonal movement from being faster
		const clampedLength = Math.min(wishDirLength, 1.0);
		const wishSpeed = this.config.maxSpeed * clampedLength;

		if (grounded) {
			this._applyGroundMovement(_wishDir, wishSpeed, frameTime);
		} else {
			this._applyAirMovement(_wishDir, wishSpeed, frameTime);
		}
	}

	_applyGroundMovement(wishDir, wishSpeed, frameTime) {
		// If no input, stop immediately
		if (wishSpeed < 0.1) {
			this.body.velocity.x = 0;
			this.body.velocity.z = 0;
			return;
		}

		// Reduce acceleration if rapidly changing direction
		let acceleration = this.config.groundAcceleration;
		if (this.directionChangeTimer > 0) {
			acceleration *= _ACCEL_REDUCTION; // 30% acceleration during direction changes
		}

		// Accelerate
		this._accelerate(wishDir, wishSpeed, acceleration, frameTime);
	}

	_applyAirMovement(wishDir, wishSpeed, frameTime) {
		this._accelerate(
			wishDir,
			wishSpeed,
			this.config.airAcceleration,
			frameTime,
		);
	}

	_accelerate(wishDir, wishSpeed, acceleration, frameTime) {
		const vel = this.body.velocity;
		// Use pre-allocated vector to avoid GC pressure
		vec3.set(_currentVel, vel.x, vel.y, vel.z);

		// Current velocity in wish direction
		const currentSpeed = vec3.dot(_currentVel, wishDir);

		// How much to add
		const addSpeed = wishSpeed - currentSpeed;
		if (addSpeed <= 0) return;

		// How much acceleration to add
		let accelSpeed = acceleration * frameTime;
		if (accelSpeed > addSpeed) {
			accelSpeed = addSpeed;
		}

		// Cap maximum velocity change per frame to prevent spikes from rapid key presses
		const maxVelocityChangePerFrame = _MAX_VELOCITY_CHANGE; // Units per frame
		if (accelSpeed > maxVelocityChangePerFrame) {
			accelSpeed = maxVelocityChangePerFrame;
		}

		// Add acceleration
		vel.x += wishDir[0] * accelSpeed;
		vel.z += wishDir[2] * accelSpeed;
	}

	setVelocity(x, y, z) {
		this.body.velocity.x = x;
		this.body.velocity.y = y;
		this.body.velocity.z = z;
	}

	getPosition() {
		const p = this.body.position;
		_positionArray[0] = p.x;
		_positionArray[1] = p.y - this.config.height / 2 + this.config.eyeHeight;
		_positionArray[2] = p.z;
		return _positionArray;
	}

	getVelocity() {
		const v = this.body.velocity;
		_velocityArray[0] = v.x;
		_velocityArray[1] = v.y;
		_velocityArray[2] = v.z;
		return _velocityArray;
	}

	syncCamera(frameTime) {
		// In noclip mode, camera is moved directly - don't sync from physics body
		if (_noclip) return;

		const pos = this.getPosition();
		if (pos[0] !== 0 || pos[1] !== 0 || pos[2] !== 0) {
			Camera.position[0] = pos[0];
			Camera.position[1] = pos[1];
			Camera.position[2] = pos[2];

			// Calculate horizontal speed for wobble intensity
			const vel = this.body.velocity;
			const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

			// Calculate target roll (in radians)
			let targetRoll = 0;

			// Apply roll wobble when moving and grounded
			if (horizontalSpeed > 10 && this.isGrounded()) {
				// Advance bob phase based on movement speed
				const speedFactor = Math.min(horizontalSpeed / this.config.maxSpeed, 1);
				this.bobPhase += speedFactor * this.config.wobbleFrequency * frameTime;

				// Calculate target roll wobble (tilt left/right) - convert degrees to radians
				targetRoll =
					((Math.sin(this.bobPhase) * (this.config.wobbleIntensity * Math.PI)) /
						180) *
					speedFactor;
			} else {
				// Decay phase when not moving
				this.bobPhase *= 0.9;
			}

			// Smoothly interpolate current roll towards target
			const smoothing = 1 - Math.pow(0.001, frameTime);
			this.currentRoll =
				(this.currentRoll || 0) +
				(targetRoll - (this.currentRoll || 0)) * smoothing;

			// Calculate rolled up vector
			// Get right vector (perpendicular to direction and world up)
			vec3.cross(_rightVector, Camera.direction, _worldUp);
			vec3.normalize(_rightVector, _rightVector);

			// Roll the up vector by mixing world up with right vector
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
		vec3.zero(_moveDir);
		vec3.scaleAndAdd(_moveDir, _moveDir, Camera.direction, inputZ);
		vec3.scaleAndAdd(_moveDir, _moveDir, cameraRight, inputX);

		const len = vec3.length(_moveDir);
		if (len > 0.001) {
			vec3.scale(_moveDir, _moveDir, 1 / len);
		}

		const speed = _NOCLIP_SPEED * frameTime;
		Camera.position[0] += _moveDir[0] * speed;
		Camera.position[1] += _moveDir[1] * speed;
		Camera.position[2] += _moveDir[2] * speed;
	}
}

Console.registerCmd("tnc", () => {
	_noclip = !_noclip;
});

export default FPSController;
