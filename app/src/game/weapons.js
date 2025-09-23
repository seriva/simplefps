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
} from "../engine/engine.js";

// Weapon configurations
const WEAPONS = {
	GRENADE_LAUNCHER: {
		mesh: "meshes/grenade_launcher.mesh",
		projectile: {
			mesh: "meshes/ball.mesh",
			radius: 0.095,
			mass: 0.1,
			velocity: 25,
			light: {
				radius: 4,
				intensity: 4,
				color: [0.988, 0.31, 0.051],
			},
		},
	},
	MINIGUN: {
		mesh: "meshes/minigun.mesh",
	},
};

const WEAPON_POSITION = {
	x: 0.15,
	y: -0.2,
	z: -0.3,
};

const ANIMATION = {
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
};

const state = {
	list: [],
	selected: -1,
	grenadeLauncher: null,
	miniGun: null,
	firing: false,
	firingStart: 0,
	firingTimer: 0,
	isMoving: false,
};

const grenadeShape = new CANNON.Sphere(
	WEAPONS.GRENADE_LAUNCHER.projectile.radius,
);

const setIsMoving = (value) => {
	state.isMoving = value;
};

const hideAll = () => {
	for (let i = 0; i < state.list.length; i++) {
		state.list[i].visible = false;
	}
};

const selectNext = () => {
	hideAll();
	state.selected = (state.selected + 1) % state.list.length;
	state.list[state.selected].visible = true;
};

const selectPrevious = () => {
	hideAll();
	state.selected = (state.selected - 1 + state.list.length) % state.list.length;
	state.list[state.selected].visible = true;
};

const updateGrenade = (entity) => {
	const { quaternion: q, position: p } = entity.physicsBody;
	mat4.fromRotationTranslation(
		entity.ani_matrix,
		[q.x, q.y, q.z, q.w],
		[p.x, p.y, p.z],
	);

	if (entity.data.light) {
		mat4.fromTranslation(entity.data.light.ani_matrix, [p.x, p.y, p.z]);
	}
};

const createWeaponAnimation = (entity, frameTime) => {
	entity.animationTime += frameTime;

	const animations = {
		fire: calculateFireAnimation(frameTime),
		movement: calculateMovementAnimation(entity.animationTime),
		idle: calculateIdleAnimation(entity.animationTime),
	};

	applyWeaponTransforms(entity, animations);
};

const calculateFireAnimation = (frameTime) => {
	if (!state.firing) return 0;

	const dt = performance.now() - state.firingStart;
	state.firingTimer += frameTime;

	if (dt > ANIMATION.FIRE_DURATION) {
		state.firing = false;
	}

	return (
		Math.cos(Math.PI * (state.firingTimer / 1000)) * ANIMATION.AMPLITUDES.FIRE
	);
};

const calculateMovementAnimation = (animationTime) => {
	if (!state.isMoving) return { horizontal: 0, vertical: 0 };

	return {
		horizontal:
			Math.cos(Math.PI * (animationTime / ANIMATION.HORIZONTAL_PERIOD)) *
			ANIMATION.AMPLITUDES.HORIZONTAL_MOVE,
		vertical:
			-Math.cos(Math.PI * (animationTime / ANIMATION.VERTICAL_PERIOD)) *
			ANIMATION.AMPLITUDES.VERTICAL_MOVE,
	};
};

const calculateIdleAnimation = (animationTime) => ({
	horizontal:
		Math.cos(Math.PI * (animationTime / ANIMATION.IDLE_PERIOD.HORIZONTAL)) *
		ANIMATION.AMPLITUDES.IDLE.HORIZONTAL,
	vertical:
		Math.sin(Math.PI * (animationTime / ANIMATION.IDLE_PERIOD.VERTICAL)) *
		ANIMATION.AMPLITUDES.IDLE.VERTICAL,
});

const applyWeaponTransforms = (entity, animations) => {
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
		WEAPON_POSITION.x +
			animations.idle.horizontal +
			animations.movement.horizontal,
		WEAPON_POSITION.y + animations.idle.vertical + animations.movement.vertical,
		WEAPON_POSITION.z + animations.fire,
	]);
	mat4.rotateY(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(180));
	mat4.rotateX(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(-2.5));
};

const shootGrenade = () => {
	if (state.firing) return;

	state.firing = true;
	state.firingStart = performance.now();
	state.firingTimer = 0;

	Resources.get("sounds/shoot.sfx").play();

	const projectileConfig = WEAPONS.GRENADE_LAUNCHER.projectile;
	const spawnPosition = calculateProjectileSpawnPosition();
	const projectile = createProjectile(spawnPosition, projectileConfig);

	Scene.addEntities([projectile.entity, projectile.light]);
};

const calculateProjectileSpawnPosition = () => {
	const p = vec3.create();
	mat4.getTranslation(p, state.grenadeLauncher.ani_matrix);
	const d = Camera.direction;
	return [p[0] + d[0], p[1] + d[1] + 0.2, p[2] + d[2]];
};

const createProjectile = (spawnPos, config) => {
	const entity = new MeshEntity([0, 0, 0], config.mesh, updateGrenade);

	entity.physicsBody = new CANNON.Body({ mass: config.mass });
	entity.physicsBody.position.set(...spawnPos);
	entity.physicsBody.addShape(grenadeShape);
	Physics.addBody(entity.physicsBody);

	const d = Camera.direction;
	entity.physicsBody.velocity.set(
		d[0] * config.velocity,
		d[1] * config.velocity,
		d[2] * config.velocity,
	);

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

const load = () => {
	state.grenadeLauncher = new FpsMeshEntity(
		[0, 0, 0],
		WEAPONS.GRENADE_LAUNCHER.mesh,
		createWeaponAnimation,
	);
	Scene.addEntities(state.grenadeLauncher);

	state.miniGun = new FpsMeshEntity(
		[0, 0, 0],
		WEAPONS.MINIGUN.mesh,
		createWeaponAnimation,
	);
	state.miniGun.visible = false;
	Scene.addEntities(state.miniGun);

	state.list = Scene.getEntities(EntityTypes.FPS_MESH);
	selectNext();
};

const Weapons = {
	load,
	setIsMoving,
	shootGrenade,
	selectNext,
	selectPrevious,
};

export { Weapons as default };
