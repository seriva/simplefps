import * as CANNON from "../dependencies/cannon-es.js";
import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Physics } from "../engine/core/engine.js";

const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = { skipBackfaces: true };
const _wishDir = vec3.create();
const _currentVel = vec3.create();

let _noclip = false;
const _NOCLIP_SPEED = 500;

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
		};

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
		});

		// Set up player material
		this.body.material = new CANNON.Material("player");

		this.body.allowSleep = false;

		Physics.addBodyWithGravity(this.body);

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
	}

	isGrounded() {
		// If moving upward fast (jumping), definitely not grounded
		// More forgiving threshold allows jump buffering
		if (this.body.velocity.y > 10) {
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
		if (this.isGrounded()) {
			const horizontalDamping = 0.98; // 98% damping per second for fast stopping
			const dampingFactorXZ = (1 - horizontalDamping) ** frameTime;
			this.body.velocity.x *= dampingFactorXZ;
			this.body.velocity.z *= dampingFactorXZ;
		}

		// Apply slight damping to Y axis (same as grenades) for air resistance
		const verticalDamping = 0.01; // 1% damping like grenades
		const dampingFactorY = (1 - verticalDamping) ** frameTime;
		this.body.velocity.y *= dampingFactorY;
	}

	jump() {
		if (this.isGrounded()) {
			this.body.velocity.y = this.config.jumpVelocity;
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
			this.directionChangeTimer = 0.15; // Reduce acceleration for 150ms
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
			acceleration *= 0.3; // 30% acceleration during direction changes
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
		const maxVelocityChangePerFrame = 50; // Units per frame
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
		return [p.x, p.y - this.config.height / 2 + this.config.eyeHeight, p.z];
	}

	getVelocity() {
		const v = this.body.velocity;
		return [v.x, v.y, v.z];
	}

	syncCamera() {
		// In noclip mode, camera is moved directly - don't sync from physics body
		if (_noclip) return;

		const pos = this.getPosition();
		if (pos[0] !== 0 || pos[1] !== 0 || pos[2] !== 0) {
			Camera.position[0] = pos[0];
			Camera.position[1] = pos[1];
			Camera.position[2] = pos[2];
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
	Console.log(`Noclip: ${_noclip ? "ON" : "OFF"}`);
});

export default FPSController;
