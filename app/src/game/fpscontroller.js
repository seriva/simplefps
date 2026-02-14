import { vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Scene } from "../engine/core/engine.js";

const _worldUp = vec3.fromValues(0, 1, 0);
const _rightVector = vec3.create();

const _wishDir = vec3.create();
const _noclipDir = vec3.create();

// 8 cardinal + diagonal directions (normalized, reused for ground checks and depenetration)
const _radialDirs = [
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
const _horizontalCheckHeights = [0, 0.35, -0.35];

// Constants
const JUMP_THRESHOLD = 50;
const LAND_TIME_THRESHOLD = 0.15;
const MAX_VELOCITY_CHANGE = 100;
const COYOTE_TIME = 0.2;
const GRAVITY = 9.82 * 80;
const STEP_HEIGHT = 50;
const GROUND_DECEL = 25;

let _noclip = false;
const _NOCLIP_SPEED = 500;

class FPSController {
	constructor(position, config = {}) {
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
			wobbleFrequency: config.wobbleFrequency || 8,
			wobbleIntensity: config.wobbleIntensity || 1,
		};

		// Player position (manually moved via raycasts)
		this.position = {
			x: position[0],
			y: position[1] + this.config.height / 2,
			z: position[2],
		};

		// State
		this.velocity = vec3.create();
		this.grounded = false;
		this.wasGrounded = true;
		this.airTime = 0;
		this.bobPhase = 0;
		this.currentRoll = 0;

		// Camera smoothing
		this.smoothX = undefined;
		this.smoothY = undefined;
		this.smoothZ = undefined;
		this.landingDip = 0;
		this.bobOffsetX = 0;
		this.bobOffsetY = 0;
	}

	isGrounded() {
		return this.grounded;
	}

	update(frameTime) {
		if (_noclip) return;

		this._integratePhysics(frameTime);

		if (this.grounded) {
			if (!this.wasGrounded && this.airTime > LAND_TIME_THRESHOLD) {
				this.config.onLand();
				this.landingDip = Math.min(this.airTime * 3, 8);
			}
			this.airTime = 0;

			const dampingFactorXZ = 0.02 ** frameTime;
			this.velocity[0] *= dampingFactorXZ;
			this.velocity[2] *= dampingFactorXZ;
		} else {
			this.airTime += frameTime;
		}

		this.wasGrounded = this.grounded;
		this.velocity[1] *= 0.99 ** frameTime;
	}

	move(strafe, move, cameraForward, cameraRight, frameTime) {
		if (_noclip) {
			this._noclipMove(strafe, move, cameraForward, cameraRight, frameTime);
			return;
		}

		vec3.zero(_wishDir);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraForward, move);
		vec3.scaleAndAdd(_wishDir, _wishDir, cameraRight, strafe);
		_wishDir[1] = 0;

		const wishDirLength = vec3.length(_wishDir);
		if (wishDirLength > 0.001) {
			vec3.scale(_wishDir, _wishDir, 1 / wishDirLength);
		}

		const wishSpeed = this.config.maxSpeed * Math.min(wishDirLength, 1.0);

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
			this.grounded = false;
			this.config.onJump();
			this.airTime = COYOTE_TIME;
		}
	}

	// --- Movement ---

	_applyGroundMovement(wishDir, wishSpeed, dt) {
		if (wishSpeed < 0.1) {
			const decelAlpha = 1 - Math.exp(-GROUND_DECEL * dt);
			this.velocity[0] *= 1 - decelAlpha;
			this.velocity[2] *= 1 - decelAlpha;
			if (Math.abs(this.velocity[0]) < 1) this.velocity[0] = 0;
			if (Math.abs(this.velocity[2]) < 1) this.velocity[2] = 0;
			return;
		}
		this._accelerate(wishDir, wishSpeed, this.config.groundAcceleration, dt);
	}

	_accelerate(wishDir, wishSpeed, acceleration, dt) {
		const currentSpeed =
			this.velocity[0] * wishDir[0] + this.velocity[2] * wishDir[2];
		const addSpeed = wishSpeed - currentSpeed;
		if (addSpeed <= 0) return;

		const accelSpeed = Math.min(
			acceleration * dt,
			addSpeed,
			MAX_VELOCITY_CHANGE,
		);
		this.velocity[0] += wishDir[0] * accelSpeed;
		this.velocity[2] += wishDir[2] * accelSpeed;
	}

	// --- Physics Integration ---

	_integratePhysics(dt) {
		this.velocity[1] = Math.max(this.velocity[1] - GRAVITY * dt, -2000);

		const dx = this.velocity[0] * dt;
		const dy = this.velocity[1] * dt;
		const dz = this.velocity[2] * dt;
		const startPos = this.position;

		let { x: finalX, z: finalZ } = this._resolveHorizontalCollision(
			startPos,
			dx,
			dz,
			dt,
		);
		({ x: finalX, z: finalZ } = this._resolveDepenetration(
			finalX,
			finalZ,
			startPos.y,
		));

		this.position.x = finalX;
		this.position.z = finalZ;
		this.position.y = this._resolveGroundCollision(
			finalX,
			finalZ,
			startPos.y,
			dy,
		);
		this._resolveCeilingCollision(finalX, startPos.y, finalZ);
	}

	_resolveHorizontalCollision(startPos, dx, dz, dt) {
		let finalX = startPos.x + dx;
		let finalZ = startPos.z + dz;

		const radius = this.config.radius;
		const horizontalSpeed = Math.sqrt(
			this.velocity[0] * this.velocity[0] + this.velocity[2] * this.velocity[2],
		);
		const horizontalDist = horizontalSpeed * dt;

		if (horizontalDist <= 0.001 || horizontalSpeed <= 1) {
			return { x: finalX, z: finalZ };
		}

		const dirX = dx / horizontalDist;
		const dirZ = dz / horizontalDist;
		const rayLength = horizontalDist + radius + 2;

		let hitWall = false;
		let wallNormal = null;
		let closestHitDist = Infinity;

		for (const heightOffset of _horizontalCheckHeights) {
			const checkY = startPos.y + heightOffset * this.config.height * 0.5;
			const result = Scene.raycast(
				startPos.x,
				checkY,
				startPos.z,
				startPos.x + dirX * rayLength,
				checkY,
				startPos.z + dirZ * rayLength,
			);

			if (result.hasHit) {
				const hp = result.hitPointWorld;
				const hitDist = Math.sqrt(
					(hp[0] - startPos.x) ** 2 + (hp[2] - startPos.z) ** 2,
				);
				if (hitDist < closestHitDist) {
					closestHitDist = hitDist;
					hitWall = true;
					wallNormal = result.hitNormalWorld;
				}
			}
		}

		if (hitWall && wallNormal) {
			const safeMoveDist = Math.max(0, closestHitDist - radius - 1);
			if (safeMoveDist < horizontalDist) {
				finalX = startPos.x + dirX * safeMoveDist;
				finalZ = startPos.z + dirZ * safeMoveDist;

				// Wall slide: remove velocity component into wall
				const dot =
					this.velocity[0] * wallNormal[0] + this.velocity[2] * wallNormal[2];
				if (dot < 0) {
					this.velocity[0] -= dot * wallNormal[0];
					this.velocity[2] -= dot * wallNormal[2];
				}
			}
		}

		return { x: finalX, z: finalZ };
	}

	_resolveDepenetration(x, z, y) {
		const radius = this.config.radius;
		const depenetrationRadius = radius + 1;

		for (const dir of _radialDirs) {
			const result = Scene.raycast(
				x,
				y,
				z,
				x + dir.x * depenetrationRadius,
				y,
				z + dir.z * depenetrationRadius,
			);

			if (result.hasHit) {
				const hp = result.hitPointWorld;
				const hitDist = Math.sqrt((hp[0] - x) ** 2 + (hp[2] - z) ** 2);
				if (hitDist < radius) {
					const pushDist = radius - hitDist + 1;
					x -= dir.x * pushDist;
					z -= dir.z * pushDist;
				}
			}
		}

		return { x, z };
	}

	_resolveGroundCollision(finalX, finalZ, startY, dy) {
		let finalY = startY + dy;
		this.grounded = false;

		const radius = this.config.radius;
		const groundCheckDist = radius + STEP_HEIGHT;
		const checkRadius = radius * 0.8;

		// When grounded, start ray higher to detect steps ahead
		const rayStartY = this.wasGrounded ? startY + STEP_HEIGHT * 0.5 : startY;
		const rayEndY =
			rayStartY - groundCheckDist - (this.wasGrounded ? STEP_HEIGHT * 0.5 : 0);

		let bestHitY = -Infinity;
		let hasGroundHit = false;

		// Center ray + 8 radial offsets
		for (let i = -1; i < _radialDirs.length; i++) {
			const ox = i < 0 ? 0 : _radialDirs[i].x * checkRadius;
			const oz = i < 0 ? 0 : _radialDirs[i].z * checkRadius;

			const result = Scene.raycast(
				finalX + ox,
				rayStartY,
				finalZ + oz,
				finalX + ox,
				rayEndY,
				finalZ + oz,
			);

			if (result.hasHit && result.hitPointWorld[1] > bestHitY) {
				bestHitY = result.hitPointWorld[1];
				hasGroundHit = true;
			}
		}

		if (hasGroundHit && this.velocity[1] <= JUMP_THRESHOLD) {
			const distFromFeet = startY - radius - bestHitY;

			let snapUp, snapDown;
			if (this.wasGrounded) {
				snapUp = STEP_HEIGHT;
				snapDown = STEP_HEIGHT;
			} else if (this.velocity[1] <= 0) {
				snapUp = 20;
				snapDown = 20;
			} else {
				snapUp = 2;
				snapDown = 5;
			}

			if (distFromFeet > -snapUp && distFromFeet < snapDown) {
				finalY = bestHitY + radius;
				this.velocity[1] = 0;
				this.grounded = true;
			}
		}

		return finalY;
	}

	_resolveCeilingCollision(finalX, startY, finalZ) {
		if (this.velocity[1] <= 0) return;

		const radius = this.config.radius;
		if (
			Scene.raycast(
				finalX,
				startY,
				finalZ,
				finalX,
				startY + radius + 10,
				finalZ,
			).hasHit
		) {
			this.velocity[1] = 0;
		}
	}

	// --- Camera ---

	syncCamera(frameTime) {
		if (_noclip) return;

		this._smoothPosition(frameTime);

		const vel = this.velocity;
		const horizontalSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);

		this._updateHeadBob(horizontalSpeed, frameTime);

		const eyeOffset = this.config.eyeHeight - this.config.height / 2;
		Camera.position[0] = this.smoothX + this.bobOffsetX;
		Camera.position[1] =
			this.smoothY + eyeOffset + this.bobOffsetY - this.landingDip;
		Camera.position[2] = this.smoothZ;

		this._updateCameraRoll(horizontalSpeed, frameTime);
	}

	_smoothPosition(frameTime) {
		const pos = this.position;

		if (this.smoothX === undefined) {
			this.smoothX = pos.x;
			this.smoothY = pos.y;
			this.smoothZ = pos.z;
		}

		const alphaY = 1 - Math.exp(-25 * frameTime);
		const alphaXZ = 1 - Math.exp(-40 * frameTime);

		this.smoothX += (pos.x - this.smoothX) * alphaXZ;
		this.smoothY += (pos.y - this.smoothY) * alphaY;
		this.smoothZ += (pos.z - this.smoothZ) * alphaXZ;

		if (Math.abs(pos.x - this.smoothX) < 0.01) this.smoothX = pos.x;
		if (Math.abs(pos.y - this.smoothY) < 0.01) this.smoothY = pos.y;
		if (Math.abs(pos.z - this.smoothZ) < 0.01) this.smoothZ = pos.z;

		this.landingDip *= Math.exp(-10 * frameTime);
		if (this.landingDip < 0.01) this.landingDip = 0;
	}

	_updateHeadBob(horizontalSpeed, frameTime) {
		if (horizontalSpeed > 10 && this.grounded) {
			const speedFactor = Math.min(horizontalSpeed / this.config.maxSpeed, 1);
			this.bobPhase += speedFactor * this.config.wobbleFrequency * frameTime;
			const bobIntensity = this.config.wobbleIntensity * speedFactor;
			this.bobOffsetY = Math.sin(this.bobPhase) * bobIntensity * 1.5;
			this.bobOffsetX = Math.sin(this.bobPhase * 2) * bobIntensity * 0.8;
		} else {
			const bobDecay = Math.exp(-10 * frameTime);
			this.bobOffsetX *= bobDecay;
			this.bobOffsetY *= bobDecay;
			this.bobPhase *= 0.9;
		}
	}

	_updateCameraRoll(horizontalSpeed, frameTime) {
		let targetRoll = 0;
		if (horizontalSpeed > 10 && this.grounded) {
			const speedFactor = Math.min(horizontalSpeed / this.config.maxSpeed, 1);
			targetRoll =
				((Math.sin(this.bobPhase) * (this.config.wobbleIntensity * Math.PI)) /
					180) *
				speedFactor;
		}

		const smoothing = 1 - 0.001 ** frameTime;
		this.currentRoll += (targetRoll - this.currentRoll) * smoothing;

		vec3.cross(_rightVector, Camera.direction, _worldUp);
		vec3.normalize(_rightVector, _rightVector);

		const cosRoll = Math.cos(this.currentRoll);
		const sinRoll = Math.sin(this.currentRoll);
		Camera.upVector[0] = _worldUp[0] * cosRoll + _rightVector[0] * sinRoll;
		Camera.upVector[1] = _worldUp[1] * cosRoll + _rightVector[1] * sinRoll;
		Camera.upVector[2] = _worldUp[2] * cosRoll + _rightVector[2] * sinRoll;
		vec3.normalize(Camera.upVector, Camera.upVector);
	}

	destroy() {}

	_noclipMove(inputX, inputZ, _cameraForward, cameraRight, frameTime) {
		vec3.zero(_noclipDir);
		vec3.scaleAndAdd(_noclipDir, _noclipDir, Camera.direction, inputZ);
		vec3.scaleAndAdd(_noclipDir, _noclipDir, cameraRight, inputX);

		const len = vec3.length(_noclipDir);
		if (len > 0.001) vec3.scale(_noclipDir, _noclipDir, 1 / len);

		const speed = _NOCLIP_SPEED * frameTime;
		Camera.position[0] += _noclipDir[0] * speed;
		Camera.position[1] += _noclipDir[1] * speed;
		Camera.position[2] += _noclipDir[2] * speed;

		this.position.x = Camera.position[0];
		this.position.y =
			Camera.position[1] - (this.config.eyeHeight - this.config.height / 2);
		this.position.z = Camera.position[2];
		this.velocity.fill(0);
	}
}

Console.registerCmd("tnc", () => {
	_noclip = !_noclip;
});

export default FPSController;
