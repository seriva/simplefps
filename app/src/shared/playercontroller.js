import * as CANNON from "../dependencies/cannon-es.js";
import { vec3 } from "../dependencies/gl-matrix.js";
import { COLLISION_GROUPS } from "./physicsworld.js";

const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = { skipBackfaces: true };
const _wishDir = vec3.create();
const _currentVel = vec3.create();
const _moveDir = vec3.create();

// Constants
const JUMP_THRESHOLD = 10;
const LAND_TIME_THRESHOLD = 0.15;
const DIRECTION_CHANGE_TIME = 0.15;
const MAX_VELOCITY_CHANGE = 50;
const ACCEL_REDUCTION = 0.3;
const COYOTE_TIME = 0.2;

export class SharedPlayerController {
	constructor(physicsWorld, position, config = {}) {
		this.world = physicsWorld;
		this.config = {
			radius: config.radius || 35,
			height: config.height || 60,
			eyeHeight: config.eyeHeight || 56,
			mass: config.mass || 80,
			linearDamping: config.linearDamping || 0,
			gravity: config.gravity || 800, // Kept for reference, but handled by world
			jumpVelocity: config.jumpVelocity || 350,
			groundAcceleration: config.groundAcceleration || 550000,
			airAcceleration: config.airAcceleration || 800,
			friction: config.friction || 450,
			maxSpeed: config.maxSpeed || 300,
			// Callbacks can be passed, but might need care in shared/server context
			onLand: config.onLand || (() => {}),
			onJump: config.onJump || (() => {}),
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
			collisionFilterGroup: COLLISION_GROUPS.PLAYER,
			collisionFilterMask:
				COLLISION_GROUPS.WORLD |
				COLLISION_GROUPS.PLAYER |
				COLLISION_GROUPS.PROJECTILE,
		});

		// Set up player material
		this.body.material = new CANNON.Material("player");
		this.body.allowSleep = false;

		this.world.addBody(this.body);

		// Set up contact material between player and world
		// Note: The world instance should provide the worldMaterial
		if (this.world.worldMaterial) {
			this.world.addContactMaterial(
				this.body.material,
				this.world.worldMaterial,
				{
					friction: 0.0, // No friction on walls (allows sliding)
					restitution: 0.0, // No bouncing
					contactEquationStiffness: 1e8,
					contactEquationRelaxation: 3,
				},
			);
		}

		// Track last wish direction for direction change detection
		this.lastWishDir = vec3.create();
		this.directionChangeTimer = 0;
		this.wasGrounded = true;
		this.airTime = 0;
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
		this.world.raycastClosest(_rayFrom, _rayTo, _rayOptions, _rayResult);

		return _rayResult.hasHit && _rayResult.body !== this.body;
	}

	update(dt) {
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

	// Input: { moveX, moveZ, forwardDir (vec3), rightDir (vec3) }
	// Note: forwardDir should be horizontal (y=0) if we want standard FPS movement
	applyInput(input, dt) {
		const { moveX, moveZ, forwardDir, rightDir } = input;

		const grounded = this.isGrounded();

		// Calculate wish direction
		vec3.zero(_wishDir);
		vec3.scaleAndAdd(_wishDir, _wishDir, forwardDir, moveZ);
		vec3.scaleAndAdd(_wishDir, _wishDir, rightDir, moveX);
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

	getPosition() {
		return [this.body.position.x, this.body.position.y, this.body.position.z];
	}

	setPosition(pos) {
		this.body.position.set(pos[0], pos[1], pos[2]);
	}

	getVelocity() {
		return [this.body.velocity.x, this.body.velocity.y, this.body.velocity.z];
	}

	setVelocity(vel) {
		this.body.velocity.set(vel[0], vel[1], vel[2]);
	}

	destroy() {
		if (this.world) this.world.removeBody(this.body);
	}
}
