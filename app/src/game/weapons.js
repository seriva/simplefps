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
	x: 1.2,
	y: 1.2,
	z: 0.6, // Squash depth to hide backfaces
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

// Raycast helpers for projectile anti-tunneling
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();

// Track active projectiles for pre-step raycast checking
const _activeProjectiles = new Set();

// Pre-step raycast check - runs BEFORE physics moves bodies
const _preStepRaycast = () => {
	for (const body of _activeProjectiles) {
		const p = body.position;
		const v = body.velocity;
		const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

		if (speed < 10) continue; // Skip slow-moving projectiles

		const radius = _PROJECTILE.radius;
		// At 900 velocity and 120hz physics, grenade moves 7.5 units/step
		// Check ahead by 2x that distance to catch tunneling
		const lookAhead = Math.max(radius * 3, speed / 60);

		// Normalize velocity direction
		const dirX = v.x / speed;
		const dirY = v.y / speed;
		const dirZ = v.z / speed;

		// Ray from current position in velocity direction
		_rayFrom.set(p.x, p.y, p.z);
		_rayTo.set(
			p.x + dirX * lookAhead,
			p.y + dirY * lookAhead,
			p.z + dirZ * lookAhead,
		);

		_rayResult.reset();
		// Only raycast against WORLD (group 1), skip player (group 2) and projectiles (group 4)
		Physics.getWorld().raycastClosest(
			_rayFrom,
			_rayTo,
			{ skipBackfaces: false, collisionFilterMask: 1 },
			_rayResult,
		);

		if (_rayResult.hasHit && _rayResult.body !== body) {
			// Will hit something before next step - stop and bounce
			const hitNormal = _rayResult.hitNormalWorld;
			const hitPoint = _rayResult.hitPointWorld;

			// Position at hit point, offset by radius
			p.x = hitPoint.x + hitNormal.x * radius;
			p.y = hitPoint.y + hitNormal.y * radius;
			p.z = hitPoint.z + hitNormal.z * radius;

			// Reflect velocity: v' = v - 2(v·n)n
			const dot = v.x * hitNormal.x + v.y * hitNormal.y + v.z * hitNormal.z;
			const restitution = 0.6;

			v.x = (v.x - 2 * dot * hitNormal.x) * restitution;
			v.y = (v.y - 2 * dot * hitNormal.y) * restitution;
			v.z = (v.z - 2 * dot * hitNormal.z) * restitution;
		}
	}
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

const _grenadeShape = new CANNON.Sphere(_PROJECTILE.radius);

// Create bouncy material for grenades
const _grenadeMaterial = new CANNON.Material("grenade");
_grenadeMaterial.restitution = 1;

// Create world material for BSP geometry
const _worldMaterial = new CANNON.Material("world");

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

const _updateGrenade = (entity, _frameTime) => {
	const body = entity.physicsBody;
	const { quaternion: q, position: p } = body;
	const scale = entity.data.meshScale || 1;

	// Check lifetime and signal removal if expired
	const LIFETIME = 15000; // 15 seconds
	if (performance.now() - entity.data.createdAt > LIFETIME) {
		// Remove linked light
		if (entity.linkedLight) {
			Scene.removeEntity(entity.linkedLight);
		}
		// Unregister from pre-step raycast
		_activeProjectiles.delete(body);
		return false; // Signal this entity should be removed
	}

	// Build transform: position + rotation + scale
	mat4.fromRotationTranslation(
		entity.ani_matrix,
		[q.x, q.y, q.z, q.w],
		[p.x, p.y, p.z],
	);
	mat4.scale(entity.ani_matrix, entity.ani_matrix, [scale, scale, scale]);

	// Reset base_matrix to identity
	mat4.identity(entity.base_matrix);

	if (entity.linkedLight) {
		mat4.fromTranslation(entity.linkedLight.ani_matrix, [p.x, p.y, p.z]);
	}

	return true; // Continue existing
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
	_translationVec[0] =
		_WEAPON_POSITION.x +
		animations.idle.horizontal +
		animations.movement.horizontal;
	_translationVec[1] =
		_WEAPON_POSITION.y +
		animations.idle.vertical +
		animations.movement.vertical +
		animations.land +
		animations.switch;
	_translationVec[2] = _WEAPON_POSITION.z + animations.fire;

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
	const entity = new MeshEntity([0, 0, 0], config.mesh, _updateGrenade);
	entity.data.meshScale = config.meshScale || 1; // Store scale for update callback

	entity.physicsBody = new CANNON.Body({
		mass: config.mass,
		material: _grenadeMaterial, // Bouncy material
		allowSleep: true, // Allow grenades to sleep when stationary
		sleepSpeedLimit: 0.5, // Sleep threshold
		sleepTimeLimit: 1, // Seconds before sleeping
		collisionFilterGroup: 4, // PROJECTILE group
		collisionFilterMask: 1, // Only collide with WORLD (not other projectiles)
		isTrigger: false, // Normal collision
		linearDamping: 0.0, // Very low air resistance for fast projectile flight
	});
	// Custom gravity scale for longer flight distance
	entity.physicsBody.gravityScale = 0.4; // 40% of normal gravity
	entity.physicsBody.position.set(...spawnPos);
	entity.physicsBody.addShape(_grenadeShape);

	// Add to physics world with gravity
	Physics.addBodyWithGravity(entity.physicsBody);

	// Register for pre-step raycast anti-tunneling
	_activeProjectiles.add(entity.physicsBody);

	// Set velocity AFTER adding to physics world
	const dx = Camera.direction[0];
	const dy = Camera.direction[1];
	const dz = Camera.direction[2];

	// Apply impulse for launch
	const impulse = new CANNON.Vec3(
		dx * config.velocity * config.mass,
		dy * config.velocity * config.mass,
		dz * config.velocity * config.mass,
	);
	entity.physicsBody.applyImpulse(impulse, new CANNON.Vec3(0, 0, 0));

	const light = new PointLightEntity(
		[0, 0, 0],
		config.light.radius,
		config.light.color,
		config.light.intensity,
	);
	light.visible = true;

	// Link light to entity for cleanup
	entity.linkedLight = light;

	// Store creation time for lifetime tracking
	entity.data.createdAt = performance.now();

	return { entity, light };
};

const _load = () => {
	// Register pre-step raycast callback for anti-tunneling
	Physics.getWorld().addEventListener("preStep", _preStepRaycast);

	// Register contact material between grenades and world
	Physics.addContactMaterial(_grenadeMaterial, _worldMaterial, {
		restitution: 0.95,
		friction: 0.3,
	});

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
