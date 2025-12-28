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

const _WEAPONS = {
	GRENADE_LAUNCHER: {
		mesh: "meshes/grenade_launcher.mesh",
		projectile: {
			mesh: "meshes/ball.mesh",
			meshScale: 33,
			radius: 5,
			mass: 1,
			velocity: 700,
			light: {
				radius: 150,
				intensity: 4,
				color: [0.988, 0.31, 0.051],
			},
		},
	},
	MINIGUN: {
		mesh: "meshes/minigun.mesh",
	},
};

const _WEAPON_POSITION = {
	x: 0.15,
	y: -0.2,
	z: -0.3,
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
};

const _state = {
	list: [],
	selected: -1,
	grenadeLauncher: null,
	miniGun: null,
	firing: false,
	firingStart: 0,
	firingTimer: 0,
	isMoving: false,
	movementBlend: 0,
};

const _grenadeShape = new CANNON.Sphere(
	_WEAPONS.GRENADE_LAUNCHER.projectile.radius,
);

// Create bouncy material for grenades
const _grenadeMaterial = new CANNON.Material("grenade");
_grenadeMaterial.restitution = 1; // High bounciness (0-1)

const _setIsMoving = (value) => {
	_state.isMoving = value;
};

const _hideAll = () => {
	for (let i = 0; i < _state.list.length; i++) {
		_state.list[i].visible = false;
	}
};

const _selectNext = () => {
	_hideAll();
	_state.selected = (_state.selected + 1) % _state.list.length;
	_state.list[_state.selected].visible = true;
};

const _selectPrevious = () => {
	_hideAll();
	_state.selected =
		(_state.selected - 1 + _state.list.length) % _state.list.length;
	_state.list[_state.selected].visible = true;
};

const _updateGrenade = (entity) => {
	const { quaternion: q, position: p } = entity.physicsBody;
	const scale = entity.data.meshScale || 1;

	// Build transform: position + rotation + scale
	mat4.fromRotationTranslation(
		entity.ani_matrix,
		[q.x, q.y, q.z, q.w],
		[p.x, p.y, p.z],
	);
	mat4.scale(entity.ani_matrix, entity.ani_matrix, [scale, scale, scale]);

	// Reset base_matrix to identity
	mat4.identity(entity.base_matrix);

	if (entity.data.light) {
		mat4.fromTranslation(entity.data.light.ani_matrix, [p.x, p.y, p.z]);
	}
};

const _createWeaponAnimation = (entity, frameTime) => {
	entity.animationTime += frameTime;

	// Smoothly blend movement animation based on movement state
	const targetBlend = _state.isMoving ? 1 : 0;
	_state.movementBlend +=
		(targetBlend - _state.movementBlend) *
		_ANIMATION.MOVEMENT_FADE_SPEED *
		frameTime;

	const animations = {
		fire: _calculateFireAnimation(frameTime),
		movement: _calculateMovementAnimation(entity.animationTime),
		idle: _calculateIdleAnimation(entity.animationTime),
	};

	_applyWeaponTransforms(entity, animations);
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
	const horizontal =
		Math.cos(Math.PI * (animationTime / _ANIMATION.HORIZONTAL_PERIOD)) *
		_ANIMATION.AMPLITUDES.HORIZONTAL_MOVE *
		_state.movementBlend;
	const vertical =
		-Math.cos(Math.PI * (animationTime / _ANIMATION.VERTICAL_PERIOD)) *
		_ANIMATION.AMPLITUDES.VERTICAL_MOVE *
		_state.movementBlend;

	return { horizontal, vertical };
};

const _calculateIdleAnimation = (animationTime) => ({
	horizontal:
		Math.cos(Math.PI * (animationTime / _ANIMATION.IDLE_PERIOD.HORIZONTAL)) *
		_ANIMATION.AMPLITUDES.IDLE.HORIZONTAL,
	vertical:
		Math.sin(Math.PI * (animationTime / _ANIMATION.IDLE_PERIOD.VERTICAL)) *
		_ANIMATION.AMPLITUDES.IDLE.VERTICAL,
});

const _applyWeaponTransforms = (entity, animations) => {
	const dir = vec3.create();
	const pos = vec3.create();
	vec3.copy(dir, Camera.direction);
	vec3.copy(pos, Camera.position);

	mat4.identity(entity.ani_matrix);
	mat4.lookAt(
		entity.ani_matrix,
		pos,
		[pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2]],
		[0, 1, 0],
	);
	mat4.invert(entity.ani_matrix, entity.ani_matrix);
	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		_WEAPON_POSITION.x +
			animations.idle.horizontal +
			animations.movement.horizontal,
		_WEAPON_POSITION.y +
			animations.idle.vertical +
			animations.movement.vertical,
		_WEAPON_POSITION.z + animations.fire,
	]);
	mat4.rotateY(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(180));
	mat4.rotateX(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(-2.5));
};

const _shootGrenade = () => {
	if (_state.firing) return;

	_state.firing = true;
	_state.firingStart = performance.now();
	_state.firingTimer = 0;

	Resources.get("sounds/shoot.sfx").play();

	const projectileConfig = _WEAPONS.GRENADE_LAUNCHER.projectile;
	const spawnPosition = _calculateProjectileSpawnPosition();
	const projectile = _createProjectile(spawnPosition, projectileConfig);

	Scene.addEntities([projectile.entity, projectile.light]);
};

const _calculateProjectileSpawnPosition = () => {
	const p = Camera.position;
	const d = Camera.direction;

	// Calculate right vector for offset (cross product of direction and up)
	const right = vec3.create();
	vec3.cross(right, d, [0, 1, 0]);
	vec3.normalize(right, right);

	// Offset to the right to match weapon barrel position
	const barrelOffset = 8; // Units to the right

	// Spawn further in front of camera to avoid collision with player/nearby geometry
	return [
		p[0] + d[0] * 30 + right[0] * barrelOffset,
		p[1] + d[1] * 30 - 5,
		p[2] + d[2] * 30 + right[2] * barrelOffset,
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
	});
	entity.physicsBody.position.set(...spawnPos);
	entity.physicsBody.addShape(_grenadeShape);

	// Enable CCD to prevent tunneling through walls at high speed
	entity.physicsBody.ccdSpeedThreshold = 1;
	entity.physicsBody.ccdIterations = 20; // Higher for better tunneling prevention

	// Add to physics world with gravity
	Physics.addBodyWithGravity(entity.physicsBody);

	// Set velocity AFTER adding to physics world
	const dx = Camera.direction[0];
	const dy = Camera.direction[1];
	const dz = Camera.direction[2];

	// Apply impulse for more powerful launch
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
	entity.data.light = light;

	return { entity, light };
};

const _load = () => {
	_state.grenadeLauncher = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.GRENADE_LAUNCHER.mesh,
		_createWeaponAnimation,
	);
	Scene.addEntities(_state.grenadeLauncher);

	_state.miniGun = new FpsMeshEntity(
		[0, 0, 0],
		_WEAPONS.MINIGUN.mesh,
		_createWeaponAnimation,
	);
	_state.miniGun.visible = false;
	Scene.addEntities(_state.miniGun);

	_state.list = Scene.getEntities(EntityTypes.FPS_MESH);
	_selectNext();
};

// ============================================================================
// Public API
// ============================================================================

const Weapons = {
	load: _load,
	setIsMoving: _setIsMoving,
	shootGrenade: _shootGrenade,
	selectNext: _selectNext,
	selectPrevious: _selectPrevious,
};

export { Weapons as default };
