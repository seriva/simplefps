import * as CANNON from "../dependencies/cannon-es.js";
import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Physics } from "../engine/core/engine.js";

const { COLLISION_GROUPS } = Physics;

const _worldUp = vec3.fromValues(0, 1, 0);
const _rightVector = vec3.create();

// Internal physics vectors (reused)
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _rayOptions = {
	skipBackfaces: true,
	collisionFilterMask: 1, // WORLD only (set per-raycast if needed)
};
const _wishDir = vec3.create();
const _noclipDir = vec3.create(); // Pre-allocated for noclip movement

// Pre-allocated offsets for multi-ray ground check (8-point pattern for better edge coverage)
const _groundCheckOffsets = [
	{ x: 0, z: 0 }, // Center
	{ x: 1, z: 0 }, // Cardinal
	{ x: -1, z: 0 },
	{ x: 0, z: 1 },
	{ x: 0, z: -1 },
	{ x: Math.SQRT1_2, z: Math.SQRT1_2 }, // Diagonals (normalized)
	{ x: -Math.SQRT1_2, z: Math.SQRT1_2 },
	{ x: Math.SQRT1_2, z: -Math.SQRT1_2 },
	{ x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
];

// Pre-allocated directions for radial depenetration check
const _depenetrationDirs = [
	{ x: 1, z: 0 },
	{ x: -1, z: 0 },
	{ x: 0, z: 1 },
	{ x: 0, z: -1 },
	{ x: Math.SQRT1_2, z: Math.SQRT1_2 },
	{ x: -Math.SQRT1_2, z: Math.SQRT1_2 },
	{ x: Math.SQRT1_2, z: -Math.SQRT1_2 },
	{ x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
];

// Height offsets for horizontal collision checks (relative to center)
const _horizontalCheckHeights = [
	0, // Center
	0.35, // Upper (35% toward top)
	-0.35, // Lower (35% toward bottom)
];

// Constants
const JUMP_THRESHOLD = 50; // Increased threshold for explicit jump check
const LAND_TIME_THRESHOLD = 0.15;
const MAX_VELOCITY_CHANGE = 100;
const COYOTE_TIME = 0.2;
const GRAVITY = 9.82 * 80; // Match Physics system gravity scale
const STEP_HEIGHT = 50; // Use a generous step height since we don't have a capsule
const GROUND_DECEL = 25; // Smooth deceleration rate (higher = faster stop)

let _noclip = false;
const _NOCLIP_SPEED = 500;

class FPSController {
	constructor(position, config = {}) {
		// Configuration
		this.config = {
			radius: config.radius || 35,
			height: config.height || 60,
			eyeHeight: config.eyeHeight || 56,
			jumpVelocity: config.jumpVelocity || 320,
			groundAcceleration: config.groundAcceleration || 4000,
			airAcceleration: config.airAcceleration || 200,
			maxSpeed: config.maxSpeed || 400,
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
			// Don't collide with WORLD or PROJECTILE - we handle those via raycasts/sphere checks
			// Keep PLAYER for multiplayer pushing
			collisionFilterMask: COLLISION_GROUPS.PLAYER,
		});

		this.body.gravityScale = 0; // Disable engine gravity
		this.body.allowSleep = false;
		Physics.addBody(this.body);

		// State
		this.velocity = vec3.create(); // Manual velocity tracking
		this.grounded = false; // Explicit grounded state
		this.wasGrounded = true;
		this.airTime = 0;
		this.bobPhase = 0;
		this.currentRoll = 0;

		// Camera smoothing state
		this.smoothX = undefined;
		this.smoothY = undefined;
		this.smoothZ = undefined;
		this.landingDip = 0; // Landing impact effect
		this.bobOffsetX = 0; // Figure-8 horizontal bob
		this.bobOffsetY = 0; // Figure-8 vertical bob
	}

	isGrounded() {
		return this.grounded;
	}

	update(frameTime) {
		if (_noclip) return;

		// 1. Integrate Physics (Gravity, Collision, Move)
		this._integratePhysics(frameTime);

		// 2. Handle landing and friction
		if (this.grounded) {
			if (!this.wasGrounded && this.airTime > LAND_TIME_THRESHOLD) {
				this.config.onLand();
				// Trigger landing dip based on air time (capped)
				const dipAmount = Math.min(this.airTime * 3, 8);
				this.landingDip = dipAmount;
			}
			this.airTime = 0;

			const horizontalDamping = 0.98;
			const dampingFactorXZ = (1 - horizontalDamping) ** frameTime;
			this.velocity[0] *= dampingFactorXZ;
			this.velocity[2] *= dampingFactorXZ;
		} else {
			this.airTime += frameTime;
		}

		this.wasGrounded = this.grounded;

		// Keep vertical damping small (air resistance)
		const verticalDamping = 0.01;
		const dampingFactorY = (1 - verticalDamping) ** frameTime;
		this.velocity[1] *= dampingFactorY;
	}

	move(strafe, move, cameraForward, cameraRight, frameTime) {
		if (_noclip) {
			this._noclipMove(strafe, move, cameraForward, cameraRight, frameTime);
			return;
		}

		// Calculate wish direction
		vec3.zero(_wishDir);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraForward, move);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraRight, strafe);
		_wishDir[1] = 0; // Enforce horizontal

		const wishDirLength = vec3.length(_wishDir);
		if (wishDirLength > 0.001) {
			vec3.scale(_wishDir, _wishDir, 1 / wishDirLength);
		}

		const clampedLength = Math.min(wishDirLength, 1.0);
		const wishSpeed = this.config.maxSpeed * clampedLength;

		if (this.grounded) {
			this._applyGroundMovement(_wishDir, wishSpeed, frameTime);
		} else {
			this._accelerate(
				_wishDir,
				wishSpeed,
				this.config.airAcceleration,
				frameTime,
			);
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
		// Smooth deceleration if no input (instead of instant stop)
		if (wishSpeed < 0.1) {
			const decelAlpha = 1 - Math.exp(-GROUND_DECEL * dt);
			this.velocity[0] *= 1 - decelAlpha;
			this.velocity[2] *= 1 - decelAlpha;
			// Snap to zero if very slow
			if (Math.abs(this.velocity[0]) < 1) this.velocity[0] = 0;
			if (Math.abs(this.velocity[2]) < 1) this.velocity[2] = 0;
			return;
		}

		const acceleration = this.config.groundAcceleration;
		this._accelerate(wishDir, wishSpeed, acceleration, dt);
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

		const radius = this.config.radius; // Cache for hot path

		const startPos = this.body.position; // CANNON.Vec3 (reference)

		// --- Interaction 1: Horizontal Collision (Wall Slide) ---
		let finalX = startPos.x + dx;
		let finalZ = startPos.z + dz;

		// Check for horizontal collision (skip if barely moving to save performance)
		const horizontalSpeed = Math.sqrt(
			this.velocity[0] * this.velocity[0] + this.velocity[2] * this.velocity[2],
		);
		const horizontalDist = horizontalSpeed * dt; // Derived from speed to avoid redundant sqrt
		if (horizontalDist > 0.001 && horizontalSpeed > 1) {
			const dirX = dx / horizontalDist;
			const dirZ = dz / horizontalDist;
			const padding = 2.0;
			const rayLength = horizontalDist + radius + padding;

			// Check at multiple heights for better wall detection
			let hitWall = false;
			let wallNormal = null;
			let closestHitDist = Infinity;

			for (const heightOffset of _horizontalCheckHeights) {
				const checkY = startPos.y + heightOffset * this.config.height * 0.5;

				_rayFrom.set(startPos.x, checkY, startPos.z);
				_rayTo.set(
					startPos.x + dirX * rayLength,
					checkY,
					startPos.z + dirZ * rayLength,
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
					// Calculate distance to hit
					const hp = _rayResult.hitPointWorld;
					const hitDist = Math.sqrt(
						(hp.x - startPos.x) ** 2 + (hp.z - startPos.z) ** 2,
					);
					if (hitDist < closestHitDist) {
						closestHitDist = hitDist;
						hitWall = true;
						wallNormal = _rayResult.hitNormalWorld;
					}
				}
			}

			if (hitWall && wallNormal) {
				// Calculate how far we can safely move (stop before wall)
				const safeMoveDist = Math.max(0, closestHitDist - radius - 1);

				if (safeMoveDist < horizontalDist) {
					// We would hit the wall, limit movement
					finalX = startPos.x + dirX * safeMoveDist;
					finalZ = startPos.z + dirZ * safeMoveDist;

					// Also apply wall slide for remaining velocity
					const dot =
						this.velocity[0] * wallNormal.x + this.velocity[2] * wallNormal.z;

					if (dot < 0) {
						this.velocity[0] -= dot * wallNormal.x;
						this.velocity[2] -= dot * wallNormal.z;
					}
				}
			}
		}

		// Radial depenetration check - cast rays outward from final position to detect overlap
		// This catches cases where the movement ray missed a wall at an oblique angle
		const depenetrationRadius = radius + 1;
		for (const dir of _depenetrationDirs) {
			_rayFrom.set(finalX, startPos.y, finalZ);
			_rayTo.set(
				finalX + dir.x * depenetrationRadius,
				startPos.y,
				finalZ + dir.z * depenetrationRadius,
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
				const hp = _rayResult.hitPointWorld;
				const hitDist = Math.sqrt((hp.x - finalX) ** 2 + (hp.z - finalZ) ** 2);
				// If wall is closer than radius, push out
				if (hitDist < radius) {
					const pushDist = radius - hitDist + 1;
					finalX -= dir.x * pushDist;
					finalZ -= dir.z * pushDist;
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
		const footOffset = radius;
		const groundCheckDist = footOffset + STEP_HEIGHT;
		const checkRadius = radius * 0.8; // Slightly inside the sphere

		// When grounded and moving forward (e.g. stairs), start ray from higher up
		// to detect steps ahead that are above our current feet position
		const rayStartY = this.wasGrounded
			? startPos.y + STEP_HEIGHT * 0.5
			: startPos.y;
		const rayEndY =
			rayStartY - groundCheckDist - (this.wasGrounded ? STEP_HEIGHT * 0.5 : 0);

		let bestHitY = -Infinity;
		let hasGroundHit = false;

		for (const offset of _groundCheckOffsets) {
			// Scale offset by checkRadius (pre-allocated offsets are normalized)
			const testX = finalX + offset.x * checkRadius;
			const testZ = finalZ + offset.z * checkRadius;

			_rayFrom.set(testX, rayStartY, testZ);
			_rayTo.set(testX, rayEndY, testZ);

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
			// Only snap if not jumping upward
			if (this.velocity[1] <= JUMP_THRESHOLD) {
				// Current feet position (before any vertical movement)
				const currentFeetY = startPos.y - radius;

				// Distance from current feet to detected ground
				// Positive = ground is below current feet, Negative = ground is above (stairs)
				const distFromFeet = currentFeetY - bestHitY;

				// Snap threshold depends on state
				let snapUp, snapDown;
				if (this.wasGrounded) {
					// Walking on ground - generous step height
					snapUp = STEP_HEIGHT;
					snapDown = STEP_HEIGHT;
				} else if (this.velocity[1] <= 0) {
					// Falling - balance between stair reliability and smooth landings
					snapUp = 20;
					snapDown = 20;
				} else {
					// Still ascending - very tight snap to avoid premature landing
					snapUp = 2;
					snapDown = 5;
				}

				// Snap if ground is within range (above or below current feet)
				if (distFromFeet > -snapUp && distFromFeet < snapDown) {
					finalY = bestHitY + radius;
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
			_rayTo.set(finalX, startPos.y + radius + 10, finalZ);
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

		// Initialize smooth positions if not set
		if (this.smoothX === undefined) {
			this.smoothX = pos.x;
			this.smoothY = pos.y;
			this.smoothZ = pos.z;
		}

		// Smooth all axes (Y more aggressively, XZ lightly)
		const decayY = 25;
		const decayXZ = 40; // Higher = more responsive
		const alphaY = 1 - Math.exp(-decayY * frameTime);
		const alphaXZ = 1 - Math.exp(-decayXZ * frameTime);

		this.smoothX += (pos.x - this.smoothX) * alphaXZ;
		this.smoothY += (pos.y - this.smoothY) * alphaY;
		this.smoothZ += (pos.z - this.smoothZ) * alphaXZ;

		// Snap if very close
		if (Math.abs(pos.x - this.smoothX) < 0.01) this.smoothX = pos.x;
		if (Math.abs(pos.y - this.smoothY) < 0.01) this.smoothY = pos.y;
		if (Math.abs(pos.z - this.smoothZ) < 0.01) this.smoothZ = pos.z;

		// Landing dip decay
		this.landingDip *= Math.exp(-10 * frameTime);
		if (this.landingDip < 0.01) this.landingDip = 0;

		// Eye offset
		const eyeOffset = this.config.eyeHeight - this.config.height / 2;

		// Figure-8 head bob
		const vel = this.velocity;
		const horizontalSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);

		if (horizontalSpeed > 10 && this.grounded) {
			const speedFactor = Math.min(horizontalSpeed / this.config.maxSpeed, 1);
			this.bobPhase += speedFactor * this.config.wobbleFrequency * frameTime;

			// Figure-8 pattern: vertical = sin(phase), horizontal = sin(2*phase)
			const bobIntensity = this.config.wobbleIntensity * speedFactor;
			this.bobOffsetY = Math.sin(this.bobPhase) * bobIntensity * 1.5;
			this.bobOffsetX = Math.sin(this.bobPhase * 2) * bobIntensity * 0.8;
		} else {
			// Decay bob offsets
			const bobDecay = Math.exp(-10 * frameTime);
			this.bobOffsetX *= bobDecay;
			this.bobOffsetY *= bobDecay;
			this.bobPhase *= 0.9;
		}

		// Apply smoothed position + bob + landing dip
		Camera.position[0] = this.smoothX + this.bobOffsetX;
		Camera.position[1] =
			this.smoothY + eyeOffset + this.bobOffsetY - this.landingDip;
		Camera.position[2] = this.smoothZ;

		// Roll effect (tilt when moving)
		let targetRoll = 0;
		if (horizontalSpeed > 10 && this.grounded) {
			const speedFactor = Math.min(horizontalSpeed / this.config.maxSpeed, 1);
			targetRoll =
				((Math.sin(this.bobPhase) * (this.config.wobbleIntensity * Math.PI)) /
					180) *
				speedFactor;
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
		vec3.zero(_noclipDir);
		vec3.scaleAndAdd(_noclipDir, _noclipDir, Camera.direction, inputZ);
		vec3.scaleAndAdd(_noclipDir, _noclipDir, cameraRight, inputX);

		const len = vec3.length(_noclipDir);
		if (len > 0.001) {
			vec3.scale(_noclipDir, _noclipDir, 1 / len);
		}

		const speed = _NOCLIP_SPEED * frameTime;
		Camera.position[0] += _noclipDir[0] * speed;
		Camera.position[1] += _noclipDir[1] * speed;
		Camera.position[2] += _noclipDir[2] * speed;

		// Update body position for noclip so physics doesn't desync if we toggle back
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
