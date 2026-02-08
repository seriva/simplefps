import * as CANNON from "../dependencies/cannon-es.js";
import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Physics } from "../engine/core/engine.js";

const _worldUp = vec3.fromValues(0, 1, 0);
const _rightVector = vec3.create();

// Internal physics vectors (reused)
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = {
	skipBackfaces: true,
	collisionFilterMask: 1 | 4, // WORLD | PROJECTILE (Exclude PLAYER)
};
const _wishDir = vec3.create();
const _currentVel = vec3.create();

// Constants
const JUMP_THRESHOLD = 50; // Increased threshold for explicit jump check
const LAND_TIME_THRESHOLD = 0.15;
const DIRECTION_CHANGE_TIME = 0.15;
const MAX_VELOCITY_CHANGE = 50;
const ACCEL_REDUCTION = 0.3;
const COYOTE_TIME = 0.2;
const GRAVITY = 9.82 * 80; // Match Physics system gravity scale
const STEP_HEIGHT = 50; // Use a generous step height since we don't have a capsule

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
			jumpVelocity: config.jumpVelocity || 250,
			groundAcceleration: config.groundAcceleration || 1000,
			airAcceleration: config.airAcceleration || 100,
			friction: config.friction || 475,
			maxSpeed: config.maxSpeed || 250,
			onLand: config.onLand || (() => {}),
			onJump: config.onJump || (() => {}),

			// Wobble config
			wobbleFrequency: config.wobbleFrequency || 8,
			wobbleIntensity: config.wobbleIntensity || 1,
		};

		// Physics Body
		// We use KINEMATIC so Cannon doesn't solve it, and we set mass to 0 or
		// behave as if it's infinite. KINEMATIC bodies are moved manually.
		const shape = new CANNON.Sphere(this.config.radius);
		this.body = new CANNON.Body({
			mass: 0, // Kinematic bodies usually have 0 mass in Cannon
			type: CANNON.Body.KINEMATIC,
			shape: shape,
			position: new CANNON.Vec3(
				position[0],
				position[1] + this.config.height / 2,
				position[2],
			),
			fixedRotation: true,
			collisionFilterGroup: COLLISION_GROUPS.PLAYER,
			collisionFilterMask:
				COLLISION_GROUPS.WORLD |
				COLLISION_GROUPS.PLAYER |
				COLLISION_GROUPS.PROJECTILE,
		});

		this.body.gravityScale = 0; // Disable engine gravity
		this.body.material = new CANNON.Material("player");
		this.body.allowSleep = false;
		Physics.addBody(this.body);

		// Contact Material - Keeping this for potential projectile interactions,
		// though manual movement won't trigger standard friction/restitution.
		const worldMaterial = Physics.getWorldMaterial();
		if (worldMaterial) {
			Physics.addContactMaterial(this.body.material, worldMaterial, {
				friction: 0.0,
				restitution: 0.0,
			});
		}

		// State
		this.velocity = vec3.create(); // Manual velocity tracking
		this.lastWishDir = vec3.create();
		this.directionChangeTimer = 0;
		this.grounded = false; // Explicit grounded state
		this.wasGrounded = true;
		this.airTime = 0;
		this.bobPhase = 0;
		this.currentRoll = 0;
	}

	isGrounded() {
		return this.grounded;
	}

	update(frameTime) {
		if (_noclip) return;

		const dt = frameTime;

		// 1. Integrate Physics (Gravity, Collision, Move)
		this._integratePhysics(dt);

		// 2. Friction
		if (this.grounded) {
			if (!this.wasGrounded && this.airTime > LAND_TIME_THRESHOLD) {
				this.config.onLand();
			}
			this.airTime = 0;

			const horizontalDamping = 0.98; // Original damping
			const dampingFactorXZ = (1 - horizontalDamping) ** dt;
			this.velocity[0] *= dampingFactorXZ;
			this.velocity[2] *= dampingFactorXZ;
		} else {
			this.airTime += dt;
		}

		this.wasGrounded = this.grounded;

		// Keep vertical damping small (air resistance)
		const verticalDamping = 0.01;
		const dampingFactorY = (1 - verticalDamping) ** dt;
		this.velocity[1] *= dampingFactorY;

		// Update Cannon Body velocity for other systems to see (optional, mostly for debug/projectiles)
		this.body.velocity.set(
			this.velocity[0],
			this.velocity[1],
			this.velocity[2],
		);
	}

	move(strafe, move, cameraForward, cameraRight, frameTime) {
		if (_noclip) {
			this._noclipMove(strafe, move, cameraForward, cameraRight, frameTime);
			return;
		}

		const dt = frameTime;

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

		if (this.grounded) {
			this._applyGroundMovement(_wishDir, wishSpeed, dt);
		} else {
			this._applyAirMovement(_wishDir, wishSpeed, dt);
		}
	}

	jump() {
		if (this.grounded || this.airTime < COYOTE_TIME) {
			this.velocity[1] = this.config.jumpVelocity;
			this.grounded = false; // Immediately unground
			this.config.onJump();
			this.airTime = COYOTE_TIME;
		}
	}

	_applyGroundMovement(wishDir, wishSpeed, dt) {
		// Instant stop if no input (fixes skating)
		if (wishSpeed < 0.1) {
			this.velocity[0] = 0;
			this.velocity[2] = 0;
			return;
		}

		const acceleration = this.config.groundAcceleration;
		this._accelerate(wishDir, wishSpeed, acceleration, dt);
	}

	_applyAirMovement(wishDir, wishSpeed, dt) {
		this._accelerate(wishDir, wishSpeed, this.config.airAcceleration, dt);
	}

	_accelerate(wishDir, wishSpeed, acceleration, dt) {
		// Project current velocity onto wish direction
		const currentSpeed =
			this.velocity[0] * wishDir[0] + this.velocity[2] * wishDir[2];
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

		this.velocity[0] += wishDir[0] * accelSpeed;
		this.velocity[2] += wishDir[2] * accelSpeed;
	}

	_integratePhysics(dt) {
		// Apply Gravity
		this.velocity[1] -= GRAVITY * dt;

		// Limit terminal velocity to prevent tunneling (approx 2000 units/s)
		this.velocity[1] = Math.max(this.velocity[1], -2000);

		// Calculate target displacement
		const dx = this.velocity[0] * dt;
		const dy = this.velocity[1] * dt;
		const dz = this.velocity[2] * dt;

		const startPos = this.body.position; // CANNON.Vec3 (reference)

		// --- Interaction 1: Horizontal Collision (Wall Slide) ---
		let finalX = startPos.x + dx;
		let finalZ = startPos.z + dz;

		// Check for horizontal collision
		const horizontalDist = Math.sqrt(dx * dx + dz * dz);
		if (horizontalDist > 0.001) {
			const dirX = dx / horizontalDist;
			const dirZ = dz / horizontalDist;
			const padding = 2.0;

			_rayFrom.set(startPos.x, startPos.y, startPos.z);
			_rayTo.set(
				startPos.x + dx + dirX * (this.config.radius + padding),
				startPos.y, // Check at center height
				startPos.z + dz + dirZ * (this.config.radius + padding),
			);

			_rayResult.reset();
			_rayOptions.collisionFilterMask = COLLISION_GROUPS.WORLD;
			Physics.getWorld().raycastClosest(
				_rayFrom,
				_rayTo,
				_rayOptions,
				_rayResult,
			);

			if (_rayResult.hasHit) {
				const normal = _rayResult.hitNormalWorld;
				const dot =
					this.velocity[0] * normal.x +
					this.velocity[1] * normal.y +
					this.velocity[2] * normal.z;

				if (dot < 0) {
					this.velocity[0] -= dot * normal.x;
					this.velocity[1] -= dot * normal.y;
					this.velocity[2] -= dot * normal.z;

					// Re-calculate final position based on slid velocity
					finalX = startPos.x + this.velocity[0] * dt;
					finalZ = startPos.z + this.velocity[2] * dt;
				}
			}
		}

		// Apply Horizontal Move
		this.body.position.x = finalX;
		this.body.position.z = finalZ;

		// --- Interaction 2: Vertical Collision (Ground) ---
		let finalY = startPos.y + dy;
		this.grounded = false;

		// Multi-Ray Ground Check (Center + 4 offsets)
		// This prevents falling through cracks or edges
		const footOffset = this.config.radius;
		const groundCheckDist = footOffset + STEP_HEIGHT;
		const checkRadius = this.config.radius * 0.8; // Slightly inside the sphere

		const offsets = [
			{ x: 0, z: 0 },
			{ x: checkRadius, z: 0 },
			{ x: -checkRadius, z: 0 },
			{ x: 0, z: checkRadius },
			{ x: 0, z: -checkRadius },
		];

		let bestHitY = -Infinity;
		let hasGroundHit = false;

		for (const offset of offsets) {
			// Start ray slightly above center to ensure we don't start inside geometry if we clipped
			// But careful not to hit ceilings. Center is safe.
			const testX = finalX + offset.x;
			const testZ = finalZ + offset.z;

			_rayFrom.set(testX, startPos.y, testZ);
			_rayTo.set(testX, startPos.y - groundCheckDist, testZ);

			_rayResult.reset();
			Physics.getWorld().raycastClosest(
				_rayFrom,
				_rayTo,
				_rayOptions,
				_rayResult,
			);

			if (_rayResult.hasHit) {
				const hitY = _rayResult.hitPointWorld.y;
				// We want the highest ground point that is below us
				if (hitY > bestHitY) {
					bestHitY = hitY;
					hasGroundHit = true;
				}
			}
		}

		if (hasGroundHit) {
			// Check if valid ground (slope check could be added here)
			// For now, just distance check
			// We check distance relative to the *intended* new vertical position (without snap) logic?
			// Actually, bestHitY is the absolute Y of the ground.
			// Our feet are currently at (startPos.y - radius).
			// If velocity is downwards or small upwards
			if (this.velocity[1] <= JUMP_THRESHOLD) {
				// dist from feet to floor
				// Predicted feet Y = finalY - radius
				// We want to snap if we are close enough.
				// However, we used groundCheckDist from Center.
				// If bestHitY is within [finalY - radius - tolerance, finalY - radius + stepHeight]

				// Calculate distance from feet to floor (bestHitY)
				// dist > 0 means we are above ground, dist < 0 means penetrating
				const distToFloor = startPos.y + dy - this.config.radius - bestHitY;

				// Snap threshold logic:
				// If we were grounded, use STEP_HEIGHT to maintain contact (slope/stairs).
				// If we were AIRBORNE, only snap if we are very close (actual landing) to avoid teleporting.
				const snapThreshold = this.wasGrounded ? STEP_HEIGHT : 5.0;

				// Snap if we are penetrating (dist < 0) or close above (dist < snapThreshold)
				if (distToFloor < snapThreshold && distToFloor > -snapThreshold) {
					finalY = bestHitY + this.config.radius;
					this.velocity[1] = 0;
					this.grounded = true;
				}
			}
		}

		// Apply Vertical Move
		this.body.position.y = finalY;

		// --- Interaction 3: Ceiling Collision ---
		if (this.velocity[1] > 0) {
			_rayFrom.set(finalX, startPos.y, finalZ);
			_rayTo.set(finalX, startPos.y + this.config.radius + 10, finalZ);
			_rayResult.reset();
			Physics.getWorld().raycastClosest(
				_rayFrom,
				_rayTo,
				_rayOptions,
				_rayResult,
			);
			if (_rayResult.hasHit) {
				this.velocity[1] = 0;
			}
		}
	}

	syncCamera(frameTime) {
		if (_noclip) return;

		const pos = this.body.position;

		// Initialize smoothY if not set
		if (this.smoothY === undefined) {
			this.smoothY = pos.y;
		}

		// Smooth the vertical camera movement (fixes stutter on steps/snaps)
		// Use a high lerp factor so it's responsive but filters out instant snaps
		const decay = 25;
		const alpha = 1 - Math.exp(-decay * frameTime);
		this.smoothY += (pos.y - this.smoothY) * alpha;

		// If we are very close, just snap to avoid micro-jitter at rest
		if (Math.abs(pos.y - this.smoothY) < 0.01) {
			this.smoothY = pos.y;
		}

		Camera.position[0] = pos.x;

		// Eye offset: BodyY is center. Eye is offset from center.
		const eyeOffset = this.config.eyeHeight - this.config.height / 2;

		// Use smoothed Y for camera
		Camera.position[1] = this.smoothY + eyeOffset;
		Camera.position[2] = pos.z;

		// Wobble Logic (Visuals only)
		const vel = this.velocity; // Use our manual velocity
		const horizontalSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);

		let targetRoll = 0;
		if (horizontalSpeed > 10 && this.grounded) {
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

		// update body for noclip so physics doesn't desync too hard if we toggle back
		this.body.position.set(
			Camera.position[0],
			Camera.position[1] - (this.config.eyeHeight - this.config.height / 2),
			Camera.position[2],
		);
		this.velocity.fill(0);
	}
}

Console.registerCmd("tnc", () => {
	_noclip = !_noclip;
});

export default FPSController;
