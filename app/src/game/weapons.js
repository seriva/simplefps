import { glMatrix, mat4, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	EntityTypes,
	FpsMeshEntity,
	MeshEntity,
	PointLightEntity,
	Resources,
	Scene,
} from "../engine/engine.js";
import { Backend } from "../engine/rendering/backend.js";
import {
	ANIMATION_CONFIG,
	PROJECTILE_CONFIG,
	WEAPON_CONFIG,
	WEAPON_INDEX,
	WEAPON_POSITION_BASE,
	WEAPON_SCALE_BASE,
} from "./game_defs.js";

// ============================================================================
// Private
// ============================================================================

// ============================================================================
// Private
// ============================================================================

const _state = {
	list: [], // Will be populated based on Scene entities
	selected: -1,
	unlocked: [], // tracks which weapon indices are available
	firing: false,
	firingStart: 0,
	firingTimer: 0,
	isMoving: false,
	isGrounded: true,
	movementBlend: 0,
	recoil: { pos: 0, vel: 0 },
	switchState: {
		active: false,
		phase: "NONE", // 'LOWER', 'RAISE'
		startTime: 0,
		nextIndex: -1,
	},
};

// Pre-allocated vectors to avoid per-frame allocations
const _weaponDir = vec3.create();
const _weaponPos = vec3.create();
const _weaponUp = vec3.create();
const _lookTarget = vec3.create();
const _projectileRight = vec3.create();
const _worldUp = [0, 1, 0];
const _translationVec = [0, 0, 0]; // Simple array for vec3 operations that don't need glMatrix
const _weaponScaleVec = [
	WEAPON_SCALE_BASE.x,
	WEAPON_SCALE_BASE.y,
	WEAPON_SCALE_BASE.z,
];
const _nextPos = [0, 0, 0];
const _inDir = [0, 0, 0];
const _reflectDir = [0, 0, 0];
const _projectileScaleVec = [1, 1, 1];
const _ROT_Y_180 = glMatrix.toRadian(180);
const _ROT_X_NEG2_5 = glMatrix.toRadian(-2.5);

// Weapons use both-sided faces for projectile hits
const _bothSidesRayOptions = { skipBackfaces: false, collisionFilterMask: 1 };

// Projectile trajectory constants
const _TRAJECTORY = {
	SPEED: 900, // Units per second
	GRAVITY: 300, // Affects arc curvature
	LIFETIME: 15000, // Max lifetime in ms
};

// Track active projectiles for update
const _activeProjectiles = new Set();

// Reuse animation objects to avoid GC
const _movementAni = { horizontal: 0, vertical: 0 };
const _idleAni = { horizontal: 0, vertical: 0 };
const _aniValues = {
	fire: 0,
	movement: _movementAni,
	idle: _idleAni,
	land: 0,
	switch: 0,
};

const _setIsMoving = (value) => {
	_state.isMoving = value;
};

const _setIsGrounded = (value) => {
	_state.isGrounded = value;
};

const _hideAll = () => {
	for (let i = 0; i < _state.list.length; i++) {
		_state.list[i].visible = false;
	}
};

const _startSwitch = (nextIndex) => {
	if (_state.switchState.active || nextIndex === _state.selected) return;

	_state.switchState.active = true;
	_state.switchState.phase = "LOWER";
	_state.switchState.startTime = performance.now();
	_state.switchState.nextIndex = nextIndex;
};

const _selectNext = () => {
	const count = _state.list.length;
	for (let i = 1; i < count; i++) {
		const idx = (_state.selected + i) % count;
		if (_state.unlocked[idx]) {
			_startSwitch(idx);
			return;
		}
	}
};

const _selectPrevious = () => {
	const count = _state.list.length;
	for (let i = 1; i < count; i++) {
		const idx = (_state.selected - i + count) % count;
		if (_state.unlocked[idx]) {
			_startSwitch(idx);
			return;
		}
	}
};

const _onLand = () => {
	_state.recoil.vel += ANIMATION_CONFIG.LAND_IMPULSE;
};

const _onJump = () => {
	_state.recoil.vel += ANIMATION_CONFIG.JUMP_IMPULSE;
};

// Update projectile - simple velocity-based physics
const _updateProjectile = (entity, frameTime) => {
	const traj = entity.trajectory;
	const scale = entity.data.meshScale || 1;
	const now = performance.now();

	// Check lifetime
	if (now - entity.data.createdAt > _TRAJECTORY.LIFETIME) {
		if (entity.linkedLight) {
			Scene.removeEntity(entity.linkedLight);
		}
		_activeProjectiles.delete(entity);
		Console.log("Grenade removed: lifetime expired");
		return false;
	}

	// Physics step
	const dt = frameTime / 1000; // Convert to seconds

	// Apply gravity to velocity
	traj.velocity[1] -= _TRAJECTORY.GRAVITY * dt;

	// Calculate next position
	_nextPos[0] = traj.position[0] + traj.velocity[0] * dt;
	_nextPos[1] = traj.position[1] + traj.velocity[1] * dt;
	_nextPos[2] = traj.position[2] + traj.velocity[2] * dt;

	// Raycast from current to next position + lookahead for slow projectiles
	const dx = _nextPos[0] - traj.position[0];
	const dy = _nextPos[1] - traj.position[1];
	const dz = _nextPos[2] - traj.position[2];
	const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

	// Minimum lookahead to prevent tunneling when moving slowly
	const minLookahead = 5;
	const lookahead = Math.max(dist, minLookahead);
	const dirX = dist > 0.01 ? dx / dist : 0;
	const dirY = dist > 0.01 ? dy / dist : -1;
	const dirZ = dist > 0.01 ? dz / dist : 0;

	const result = Scene.raycast(
		traj.position[0],
		traj.position[1],
		traj.position[2],
		traj.position[0] + dirX * lookahead,
		traj.position[1] + dirY * lookahead,
		traj.position[2] + dirZ * lookahead,
		_bothSidesRayOptions,
	);

	if (result.hasHit) {
		// Bounce!
		const hp = result.hitPointWorld;
		const hn = result.hitNormalWorld;

		traj.bounceCount++;

		// Normalize velocity for reflection
		const speed = Math.sqrt(
			traj.velocity[0] ** 2 + traj.velocity[1] ** 2 + traj.velocity[2] ** 2,
		);

		// If too slow, just stop (prevents floor tunneling)
		if (speed < 50) {
			if (entity.linkedLight) {
				Scene.removeEntity(entity.linkedLight);
			}
			_activeProjectiles.delete(entity);
			Console.log(`Grenade removed: too slow (speed: ${speed.toFixed(1)})`);
			return false;
		}

		_inDir[0] = traj.velocity[0] / speed;
		_inDir[1] = traj.velocity[1] / speed;
		_inDir[2] = traj.velocity[2] / speed;

		// Reflect: v' = v - 2(v·n)n
		const dot = _inDir[0] * hn[0] + _inDir[1] * hn[1] + _inDir[2] * hn[2];
		_reflectDir[0] = _inDir[0] - 2 * dot * hn[0];
		_reflectDir[1] = _inDir[1] - 2 * dot * hn[1];
		_reflectDir[2] = _inDir[2] - 2 * dot * hn[2];

		// Apply restitution (energy loss)
		const newSpeed = speed * 0.6;
		traj.velocity[0] = _reflectDir[0] * newSpeed;
		traj.velocity[1] = _reflectDir[1] * newSpeed;
		traj.velocity[2] = _reflectDir[2] * newSpeed;

		// Move to hit point + larger offset to stay above surface
		const offset = 3.0;
		traj.position[0] = hp[0] + hn[0] * offset;
		traj.position[1] = hp[1] + hn[1] * offset;
		traj.position[2] = hp[2] + hn[2] * offset;
	} else {
		// No hit, update position
		traj.position[0] = _nextPos[0];
		traj.position[1] = _nextPos[1];
		traj.position[2] = _nextPos[2];
	}

	// Build transform (no rotation)
	mat4.fromTranslation(entity.ani_matrix, traj.position);
	_projectileScaleVec[0] =
		_projectileScaleVec[1] =
		_projectileScaleVec[2] =
			scale;
	mat4.scale(entity.ani_matrix, entity.ani_matrix, _projectileScaleVec);
	mat4.identity(entity.base_matrix);

	// Update light
	if (entity.linkedLight) {
		mat4.fromTranslation(entity.linkedLight.ani_matrix, traj.position);
	}

	return true;
};

const _createWeaponAnimation = (entity, frameTime) => {
	entity.animationTime += frameTime;

	// Smoothly blend movement animation based on movement state
	// If airborne, force movement blend to 0 to stop sway
	const targetBlend = _state.isMoving && _state.isGrounded ? 1 : 0;
	_state.movementBlend +=
		(targetBlend - _state.movementBlend) *
		ANIMATION_CONFIG.MOVEMENT_FADE_SPEED *
		frameTime;

	// Simulate spring physics for recoil/landing
	const dt = frameTime / 1000;
	const force =
		-ANIMATION_CONFIG.LAND_SPRING_STIFFNESS * _state.recoil.pos -
		ANIMATION_CONFIG.LAND_SPRING_DAMPING * _state.recoil.vel;
	const accel = force; // mass = 1
	_state.recoil.vel += accel * dt;
	_state.recoil.pos += _state.recoil.vel * dt;

	// Handle Switching Logic
	let switchOffset = 0;
	if (_state.switchState.active) {
		const now = performance.now();
		const dt = now - _state.switchState.startTime;
		const progress = Math.min(dt / ANIMATION_CONFIG.SWITCH_DURATION, 1.0);

		// Simple ease-in/out
		const ease = progress * progress * (3 - 2 * progress);

		if (_state.switchState.phase === "LOWER") {
			switchOffset = ease * ANIMATION_CONFIG.SWITCH_LOWER_Y;

			if (progress >= 1.0) {
				// Finish lowering, swap models
				_state.list[_state.selected].visible = false;
				_state.selected = _state.switchState.nextIndex;
				_state.list[_state.selected].visible = true;

				// Start raising
				_state.switchState.phase = "RAISE";
				_state.switchState.startTime = now;

				// Reset recoil/movement for new weapon
				_state.recoil.pos = 0;
				_state.recoil.vel = 0;
				entity.animationTime = 0;
			}
		} else if (_state.switchState.phase === "RAISE") {
			switchOffset = (1.0 - ease) * ANIMATION_CONFIG.SWITCH_LOWER_Y;

			if (progress >= 1.0) {
				_state.switchState.active = false;
				_state.switchState.phase = "NONE";
			}
		}
	}

	// Update reused animation state object
	_aniValues.fire = _calculateFireAnimation(frameTime);
	_calculateMovementAnimation(entity.animationTime); // Updates _movementAni
	_calculateIdleAnimation(entity.animationTime); // Updates _idleAni
	_aniValues.land = _state.recoil.pos;
	_aniValues.switch = switchOffset;

	_applyWeaponTransforms(entity, _aniValues);
};

const _calculateFireAnimation = (frameTime) => {
	if (!_state.firing) return 0;

	const dt = performance.now() - _state.firingStart;
	_state.firingTimer += frameTime;

	if (dt > ANIMATION_CONFIG.FIRE_DURATION) {
		_state.firing = false;
	}

	return (
		Math.cos(Math.PI * (_state.firingTimer / 1000)) *
		ANIMATION_CONFIG.AMPLITUDES.FIRE
	);
};

const _calculateMovementAnimation = (animationTime) => {
	_movementAni.horizontal =
		Math.cos(Math.PI * (animationTime / ANIMATION_CONFIG.HORIZONTAL_PERIOD)) *
		ANIMATION_CONFIG.AMPLITUDES.HORIZONTAL_MOVE *
		_state.movementBlend;
	_movementAni.vertical =
		-Math.cos(Math.PI * (animationTime / ANIMATION_CONFIG.VERTICAL_PERIOD)) *
		ANIMATION_CONFIG.AMPLITUDES.VERTICAL_MOVE *
		_state.movementBlend;

	return _movementAni;
};

const _calculateIdleAnimation = (animationTime) => {
	_idleAni.horizontal =
		Math.cos(
			Math.PI * (animationTime / ANIMATION_CONFIG.IDLE_PERIOD.HORIZONTAL),
		) * ANIMATION_CONFIG.AMPLITUDES.IDLE.HORIZONTAL;
	_idleAni.vertical =
		Math.sin(
			Math.PI * (animationTime / ANIMATION_CONFIG.IDLE_PERIOD.VERTICAL),
		) * ANIMATION_CONFIG.AMPLITUDES.IDLE.VERTICAL;

	return _idleAni;
};

const _applyWeaponTransforms = (entity, animations) => {
	// Use pre-allocated vectors to avoid per-frame GC pressure
	vec3.copy(_weaponDir, Camera.direction);
	vec3.copy(_weaponPos, Camera.position);

	// Calculate a safe up vector that avoids singularity when looking straight up/down
	// When camera direction is nearly vertical, use a different reference vector
	const verticalDot = Math.abs(_weaponDir[1]);

	if (verticalDot > 0.9999) {
		// Nearly vertical - use forward/back vector as up reference instead
		vec3.set(_weaponUp, 0, 0, _weaponDir[1] > 0 ? 1 : -1);
	} else {
		// Normal case - use standard up vector
		vec3.set(_weaponUp, 0, 1, 0);
	}

	mat4.identity(entity.ani_matrix);
	vec3.set(
		_lookTarget,
		_weaponPos[0] + _weaponDir[0],
		_weaponPos[1] + _weaponDir[1],
		_weaponPos[2] + _weaponDir[2],
	);
	mat4.lookAt(entity.ani_matrix, _weaponPos, _lookTarget, _weaponUp);
	mat4.invert(entity.ani_matrix, entity.ani_matrix);

	// Update reusable translation vector
	// Correct for aspect ratio (pull closer to center on wide screens to avoid distortion)
	// We mix the correction 50% so it's not too aggressive
	const aspect = Backend.getAspectRatio();
	const targetFactor = 1.8 / Math.max(1.8, aspect);
	const aspectFactor = 0.5 + targetFactor * 0.5;

	const offset = entity.weaponConfig?.positionOffset || { x: 0, y: 0, z: 0 };

	_translationVec[0] =
		(WEAPON_POSITION_BASE.x + offset.x) * aspectFactor +
		animations.idle.horizontal +
		animations.movement.horizontal;
	_translationVec[1] =
		WEAPON_POSITION_BASE.y +
		offset.y +
		animations.idle.vertical +
		animations.movement.vertical +
		animations.land +
		animations.switch;
	_translationVec[2] = WEAPON_POSITION_BASE.z + offset.z + animations.fire;

	mat4.translate(entity.ani_matrix, entity.ani_matrix, _translationVec);
	mat4.rotateY(entity.ani_matrix, entity.ani_matrix, _ROT_Y_180);
	mat4.rotateX(entity.ani_matrix, entity.ani_matrix, _ROT_X_NEG2_5);
	mat4.scale(entity.ani_matrix, entity.ani_matrix, _weaponScaleVec);
};

const _shootGrenade = () => {
	if (_state.firing) return;

	_state.firing = true;
	_state.firingStart = performance.now();
	_state.firingTimer = 0;

	Resources.get("sounds/shoot.sfx").play();

	Resources.get("sounds/shoot.sfx").play();

	const projectileConfig = PROJECTILE_CONFIG;
	const spawnPosition = _calculateProjectileSpawnPosition();
	const projectile = _createProjectile(spawnPosition, projectileConfig);

	Scene.addEntities([projectile.entity, projectile.light]);
};

const _calculateProjectileSpawnPosition = () => {
	const p = Camera.position;
	const d = Camera.direction;

	// Calculate right vector for offset (cross product of direction and up)
	// Use pre-allocated vector
	vec3.cross(_projectileRight, d, _worldUp);
	vec3.normalize(_projectileRight, _projectileRight);

	// Offset to the right to match weapon barrel position
	const barrelOffset = 8; // Units to the right

	// Spawn further in front of camera to avoid collision with player/nearby geometry
	return [
		p[0] + d[0] * 30 + _projectileRight[0] * barrelOffset,
		p[1] + d[1] * 30 - 5,
		p[2] + d[2] * 30 + _projectileRight[2] * barrelOffset,
	];
};

const _createProjectile = (spawnPos, config) => {
	const entity = new MeshEntity([0, 0, 0], config.mesh, _updateProjectile);
	entity.data.meshScale = config.meshScale || 1;

	// Get firing direction
	const direction = [
		Camera.direction[0],
		Camera.direction[1],
		Camera.direction[2],
	];

	// Normalize direction
	const len = Math.sqrt(
		direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2,
	);
	direction[0] /= len;
	direction[1] /= len;
	direction[2] /= len;

	// Initial speed
	const speed = config.velocity || _TRAJECTORY.SPEED;

	// Store trajectory data on entity - simple position/velocity
	entity.trajectory = {
		position: [...spawnPos],
		velocity: [
			direction[0] * speed,
			direction[1] * speed,
			direction[2] * speed,
		],
		bounceCount: 0,
	};

	// Register for tracking
	_activeProjectiles.add(entity);

	// Create light
	const light = new PointLightEntity(
		[0, 0, 0],
		config.light.radius,
		config.light.color,
		config.light.intensity,
	);
	light.visible = true;

	entity.linkedLight = light;
	entity.data.createdAt = performance.now();

	return { entity, light };
};

const _load = () => {
	// Dynamically load all weapons from config
	// Sort by index to ensure correct order in list
	const configs = Object.values(WEAPON_CONFIG).sort(
		(a, b) => a.index - b.index,
	);

	for (const config of configs) {
		const weapon = new FpsMeshEntity(
			[0, 0, 0],
			config.mesh,
			_createWeaponAnimation,
		);
		weapon.weaponConfig = config; // Attach config for offets etc
		weapon.visible = false;
		Scene.addEntities(weapon);
	}

	_state.list = Scene.getEntities(EntityTypes.FPS_MESH);

	// Initialize unlock state - ensures we match the list size
	_state.unlocked = new Array(_state.list.length).fill(false);

	// Default unlock (Plasma Pistol)
	if (WEAPON_INDEX.plasma_pistol < _state.list.length) {
		_state.unlocked[WEAPON_INDEX.plasma_pistol] = true;
		_state.selected = WEAPON_INDEX.plasma_pistol;
	} else {
		// Fallback if plasma pistol missing
		_state.unlocked[0] = true;
		_state.selected = 0;
	}

	_hideAll();
	if (_state.selected >= 0 && _state.selected < _state.list.length) {
		_state.list[_state.selected].visible = true;
	}
};

const _unlock = (index) => {
	if (index < 0 || index >= _state.list.length) return;
	if (_state.unlocked[index]) return; // already unlocked
	_state.unlocked[index] = true;
	_startSwitch(index); // auto-switch to newly unlocked weapon
};

const _reset = () => {
	_state.unlocked = new Array(_state.list.length).fill(false);
	_state.unlocked = new Array(_state.list.length).fill(false);
	if (_state.list.length > WEAPON_INDEX.plasma_pistol) {
		_state.unlocked[WEAPON_INDEX.plasma_pistol] = true;
		_state.selected = WEAPON_INDEX.plasma_pistol;
		_hideAll();
		_state.list[_state.selected].visible = true;
	}
};

// ============================================================================
// Public API
// ============================================================================

const Weapons = {
	load: _load,
	setIsMoving: _setIsMoving,
	setIsGrounded: _setIsGrounded,
	shootGrenade: _shootGrenade,
	selectNext: _selectNext,
	selectPrevious: _selectPrevious,
	onLand: _onLand,
	onJump: _onJump,
	unlock: _unlock,
	isUnlocked: (index) => _state.unlocked[index],
	reset: _reset,
	WEAPON_INDEX: WEAPON_INDEX,
};

export { Weapons as default };
