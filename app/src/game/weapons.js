import * as CANNON from "../dependencies/cannon-es.js";
import { glMatrix, mat4, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	EntityTypes,
	FpsMeshEntity,
	MeshEntity,
	Physics,
	PointLightEntity,
	Resources,
	Scene,
} from "../engine/core/engine.js";
import { Backend } from "../engine/rendering/backend.js";

// ============================================================================
// Private
// ============================================================================

// Projectile config (used by all weapons as placeholder)
const _PROJECTILE = {
	mesh: "meshes/ball.mesh",
	meshScale: 33,
	radius: 2,
	mass: 0.5,
	velocity: 900,
	light: {
		radius: 150,
		intensity: 4,
		color: [0.988, 0.31, 0.051],
	},
};

const _WEAPONS = {
	ROCKET_LAUNCHER: {
		mesh: "meshes/rocket_launcher/rocket_launcher.bmesh",
	},
	ENERGY_SCEPTER: {
		mesh: "meshes/energy_scepter/energy_sceptre.bmesh",
	},
	LASER_GATLING: {
		mesh: "meshes/laser_gatling/laser_gatling.bmesh",
		positionOffset: { x: 0, y: -0.05, z: 0 },
	},
	PLASMA_PISTOL: {
		mesh: "meshes/plasma_pistol/plasma_pistol.bmesh",
	},
	PULSE_CANNON: {
		mesh: "meshes/pulse_cannon/pulse_cannon.bmesh",
	},
};

const _WEAPON_POSITION = {
	x: 0.19,
	y: -0.25,
	z: -0.45,
};

const _WEAPON_SCALE = {
	x: 1.05,
	y: 1.05,
	z: 0.7, // Squash depth to hide backfaces
};

const _ANIMATION = {
	FIRE_DURATION: 500,
	HORIZONTAL_PERIOD: 350,
	VERTICAL_PERIOD: 300,
	IDLE_PERIOD: {
		HORIZONTAL: 1500,
		VERTICAL: 1400,
	},
	AMPLITUDES: {
		FIRE: 0.12,
		HORIZONTAL_MOVE: 0.0125,
		VERTICAL_MOVE: 0.002,
		IDLE: {
			HORIZONTAL: 0.005,
			VERTICAL: 0.01,
		},
	},
	MOVEMENT_FADE_SPEED: 0.005,
	LAND_SPRING_STIFFNESS: 60.0,
	LAND_SPRING_DAMPING: 8.0,
	LAND_IMPULSE: -0.6,
	JUMP_IMPULSE: 0.35,
	SWITCH_DURATION: 150, // ms for one phase (lower or raise)
	SWITCH_LOWER_Y: -0.4, // Units to lower the weapon
};

const _state = {
	list: [],
	selected: -1,
	rocketLauncher: null,
	energyScepter: null,
	laserGatling: null,
	plasmaPistol: null,
	pulseCannon: null,
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

// Raycast helpers for trajectory calculation
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();

// Projectile trajectory constants
const _TRAJECTORY = {
	MAX_BOUNCES: 5,
	MAX_DISTANCE: 2000, // Max raycast distance per segment
	SPEED: 900, // Units per second
	GRAVITY: 300, // Affects arc curvature
	LIFETIME: 15000, // Max lifetime in ms
};

// Track active projectiles for update
const _activeProjectiles = new Set();

// Raycast to find where trajectory hits
const _raycastTrajectory = (from, direction, maxDistance) => {
	_rayFrom.set(from[0], from[1], from[2]);
	_rayTo.set(
		from[0] + direction[0] * maxDistance,
		from[1] + direction[1] * maxDistance,
		from[2] + direction[2] * maxDistance,
	);

	_rayResult.reset();
	Physics.getWorld().raycastClosest(
		_rayFrom,
		_rayTo,
		{ skipBackfaces: false, collisionFilterMask: 1 }, // WORLD only
		_rayResult,
	);

	if (_rayResult.hasHit) {
		const hp = _rayResult.hitPointWorld;
		const hn = _rayResult.hitNormalWorld;

		// Calculate distance from start to hit
		const dx = hp.x - from[0];
		const dy = hp.y - from[1];
		const dz = hp.z - from[2];
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

		// Offset hit point slightly away from surface to prevent getting stuck
		const offset = 1.0;
		return {
			hit: true,
			point: [hp.x + hn.x * offset, hp.y + hn.y * offset, hp.z + hn.z * offset],
			normal: [hn.x, hn.y, hn.z],
			distance: distance,
		};
	}

	return {
		hit: false,
		point: [
			from[0] + direction[0] * maxDistance,
			from[1] + direction[1] * maxDistance,
			from[2] + direction[2] * maxDistance,
		],
		normal: [0, 1, 0],
		distance: maxDistance,
	};
};

// Calculate bounce direction: reflect incoming across normal
const _calculateBounceDirection = (incoming, normal) => {
	const dot =
		incoming[0] * normal[0] + incoming[1] * normal[1] + incoming[2] * normal[2];
	return [
		incoming[0] - 2 * dot * normal[0],
		incoming[1] - 2 * dot * normal[1],
		incoming[2] - 2 * dot * normal[2],
	];
};

// Calculate next trajectory segment from current position and direction
const _calculateNextSegment = (startPos, direction, speed) => {
	const result = _raycastTrajectory(
		startPos,
		direction,
		_TRAJECTORY.MAX_DISTANCE,
	);
	const duration = (result.distance / speed) * 1000; // Convert to ms

	return {
		start: [...startPos],
		end: result.point,
		normal: result.normal,
		direction: [...direction],
		duration: duration,
		startTime: performance.now(),
		hit: result.hit,
	};
};

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

// Projectiles use raycast trajectories, no physics shapes/materials needed

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
	const next = (_state.selected + 1) % _state.list.length;
	_startSwitch(next);
};

const _selectPrevious = () => {
	const next = (_state.selected - 1 + _state.list.length) % _state.list.length;
	_startSwitch(next);
};

const _onLand = () => {
	_state.recoil.vel += _ANIMATION.LAND_IMPULSE;
};

const _onJump = () => {
	_state.recoil.vel += _ANIMATION.JUMP_IMPULSE;
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
		console.log("Grenade removed: lifetime expired");
		return false;
	}

	// Max bounces check disabled for now
	// if (traj.bounceCount >= _TRAJECTORY.MAX_BOUNCES) {
	// 	if (entity.linkedLight) {
	// 		Scene.removeEntity(entity.linkedLight);
	// 	}
	// 	_activeProjectiles.delete(entity);
	// 	console.log("Grenade removed: max bounces reached");
	// 	return false;
	// }

	// Physics step
	const dt = frameTime / 1000; // Convert to seconds

	// Apply gravity to velocity
	traj.velocity[1] -= _TRAJECTORY.GRAVITY * dt;

	// Calculate next position
	const nextPos = [
		traj.position[0] + traj.velocity[0] * dt,
		traj.position[1] + traj.velocity[1] * dt,
		traj.position[2] + traj.velocity[2] * dt,
	];

	// Raycast from current to next position + lookahead for slow projectiles
	const dx = nextPos[0] - traj.position[0];
	const dy = nextPos[1] - traj.position[1];
	const dz = nextPos[2] - traj.position[2];
	const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

	// Minimum lookahead to prevent tunneling when moving slowly
	const minLookahead = 5;
	const lookahead = Math.max(dist, minLookahead);
	const dirX = dist > 0.01 ? dx / dist : 0;
	const dirY = dist > 0.01 ? dy / dist : -1;
	const dirZ = dist > 0.01 ? dz / dist : 0;

	_rayFrom.set(traj.position[0], traj.position[1], traj.position[2]);
	_rayTo.set(
		traj.position[0] + dirX * lookahead,
		traj.position[1] + dirY * lookahead,
		traj.position[2] + dirZ * lookahead,
	);
	_rayResult.reset();

	Physics.getWorld().raycastClosest(
		_rayFrom,
		_rayTo,
		{ skipBackfaces: false, collisionFilterMask: 1 },
		_rayResult,
	);

	if (_rayResult.hasHit) {
		// Bounce!
		const hp = _rayResult.hitPointWorld;
		const hn = _rayResult.hitNormalWorld;

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
			console.log("Grenade removed: too slow (speed:", speed.toFixed(1), ")");
			return false;
		}

		const inDir = [
			traj.velocity[0] / speed,
			traj.velocity[1] / speed,
			traj.velocity[2] / speed,
		];

		// Reflect: v' = v - 2(v·n)n
		const dot = inDir[0] * hn.x + inDir[1] * hn.y + inDir[2] * hn.z;
		const reflectDir = [
			inDir[0] - 2 * dot * hn.x,
			inDir[1] - 2 * dot * hn.y,
			inDir[2] - 2 * dot * hn.z,
		];

		// Apply restitution (energy loss)
		const newSpeed = speed * 0.6;
		traj.velocity[0] = reflectDir[0] * newSpeed;
		traj.velocity[1] = reflectDir[1] * newSpeed;
		traj.velocity[2] = reflectDir[2] * newSpeed;

		// Move to hit point + larger offset to stay above surface
		const offset = 3.0;
		traj.position[0] = hp.x + hn.x * offset;
		traj.position[1] = hp.y + hn.y * offset;
		traj.position[2] = hp.z + hn.z * offset;
	} else {
		// No hit, update position
		traj.position[0] = nextPos[0];
		traj.position[1] = nextPos[1];
		traj.position[2] = nextPos[2];
	}

	// Build transform (no rotation)
	mat4.fromTranslation(entity.ani_matrix, traj.position);
	mat4.scale(entity.ani_matrix, entity.ani_matrix, [scale, scale, scale]);
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
		_ANIMATION.MOVEMENT_FADE_SPEED *
		frameTime;

	// Simulate spring physics for recoil/landing
	const dt = frameTime / 1000;
	const force =
		-_ANIMATION.LAND_SPRING_STIFFNESS * _state.recoil.pos -
		_ANIMATION.LAND_SPRING_DAMPING * _state.recoil.vel;
	const accel = force; // mass = 1
	_state.recoil.vel += accel * dt;
	_state.recoil.pos += _state.recoil.vel * dt;

	// Handle Switching Logic
	let switchOffset = 0;
	if (_state.switchState.active) {
		const now = performance.now();
		const dt = now - _state.switchState.startTime;
		const progress = Math.min(dt / _ANIMATION.SWITCH_DURATION, 1.0);

		// Simple ease-in/out
		const ease = progress * progress * (3 - 2 * progress);

		if (_state.switchState.phase === "LOWER") {
			switchOffset = ease * _ANIMATION.SWITCH_LOWER_Y;

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
			switchOffset = (1.0 - ease) * _ANIMATION.SWITCH_LOWER_Y;

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

	if (dt > _ANIMATION.FIRE_DURATION) {
		_state.firing = false;
	}

	return (
		Math.cos(Math.PI * (_state.firingTimer / 1000)) * _ANIMATION.AMPLITUDES.FIRE
	);
};

const _calculateMovementAnimation = (animationTime) => {
	_movementAni.horizontal =
		Math.cos(Math.PI * (animationTime / _ANIMATION.HORIZONTAL_PERIOD)) *
		_ANIMATION.AMPLITUDES.HORIZONTAL_MOVE *
		_state.movementBlend;
	_movementAni.vertical =
		-Math.cos(Math.PI * (animationTime / _ANIMATION.VERTICAL_PERIOD)) *
		_ANIMATION.AMPLITUDES.VERTICAL_MOVE *
		_state.movementBlend;

	return _movementAni;
};

const _calculateIdleAnimation = (animationTime) => {
	_idleAni.horizontal =
		Math.cos(Math.PI * (animationTime / _ANIMATION.IDLE_PERIOD.HORIZONTAL)) *
		_ANIMATION.AMPLITUDES.IDLE.HORIZONTAL;
	_idleAni.vertical =
		Math.sin(Math.PI * (animationTime / _ANIMATION.IDLE_PERIOD.VERTICAL)) *
		_ANIMATION.AMPLITUDES.IDLE.VERTICAL;

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
	// We mix the correction 50% so it's not too aggressive
	const aspect = Backend.getAspectRatio();
	const targetFactor = 1.8 / Math.max(1.8, aspect);
	const aspectFactor = 0.5 + targetFactor * 0.5;

	const offset = entity.weaponConfig?.positionOffset || { x: 0, y: 0, z: 0 };

	_translationVec[0] =
		(_WEAPON_POSITION.x + offset.x) * aspectFactor +
		animations.idle.horizontal +
		animations.movement.horizontal;
	_translationVec[1] =
		_WEAPON_POSITION.y +
		offset.y +
		animations.idle.vertical +
		animations.movement.vertical +
		animations.land +
		animations.switch;
	_translationVec[2] = _WEAPON_POSITION.z + offset.z + animations.fire;

	mat4.translate(entity.ani_matrix, entity.ani_matrix, _translationVec);
	mat4.rotateY(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(180));
	mat4.rotateX(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(-2.5));
	mat4.scale(entity.ani_matrix, entity.ani_matrix, [
		_WEAPON_SCALE.x,
		_WEAPON_SCALE.y,
		_WEAPON_SCALE.z,
	]);
};

const _shootGrenade = () => {
	if (_state.firing) return;

	_state.firing = true;
	_state.firingStart = performance.now();
	_state.firingTimer = 0;

	Resources.get("sounds/shoot.sfx").play();

	const projectileConfig = _PROJECTILE;
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
	// Projectiles now use raycast-animated trajectories, no physics registration needed

	_state.rocketLauncher = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.ROCKET_LAUNCHER.mesh,
		_createWeaponAnimation,
	);
	_state.rocketLauncher.visible = false;
	Scene.addEntities(_state.rocketLauncher);

	_state.energyScepter = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.ENERGY_SCEPTER.mesh,
		_createWeaponAnimation,
	);
	_state.energyScepter.visible = false;
	Scene.addEntities(_state.energyScepter);

	_state.laserGatling = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.LASER_GATLING.mesh,
		_createWeaponAnimation,
	);
	_state.laserGatling.weaponConfig = _WEAPONS.LASER_GATLING;
	_state.laserGatling.visible = false;
	Scene.addEntities(_state.laserGatling);

	_state.plasmaPistol = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.PLASMA_PISTOL.mesh,
		_createWeaponAnimation,
	);
	Scene.addEntities(_state.plasmaPistol);

	_state.pulseCannon = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.PULSE_CANNON.mesh,
		_createWeaponAnimation,
	);
	_state.pulseCannon.visible = false;
	Scene.addEntities(_state.pulseCannon);

	_state.list = Scene.getEntities(EntityTypes.FPS_MESH);
	// Default to Plasma Pistol (index 3 in the list order)
	_state.selected = 3;
	_hideAll();
	_state.list[_state.selected].visible = true;
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
};

export { Weapons as default };
