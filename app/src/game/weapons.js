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

// Constants
const GRENADE_RADIUS = 0.095;
const GRENADE_MASS = 0.1;
const GRENADE_VELOCITY = 25;
const GRENADE_LIGHT_RADIUS = 2.5;
const GRENADE_LIGHT_INTENSITY = 1.75;
const GRENADE_LIGHT_COLOR = [0.988, 0.31, 0.051];

const WEAPON_POSITION = {
	x: 0.15,
	y: -0.2,
	z: -0.3
};

const ANIMATION = {
	FIRE_DURATION: 500,
	HORIZONTAL_PERIOD: 350,
	VERTICAL_PERIOD: 300,
	IDLE_PERIOD: {
		HORIZONTAL: 1500,
		VERTICAL: 1400
	},
	AMPLITUDES: {
		FIRE: 0.12,
		HORIZONTAL_MOVE: 0.0125,
		VERTICAL_MOVE: 0.002,
		IDLE: {
			HORIZONTAL: 0.005,
			VERTICAL: 0.01
		}
	}
};

// State
let weaponList = [];
let selected = -1;
let grenadeLauncher = null;
let miniGun = null;
let firing = false;
let firingStart = 0;
let firingTimer = 0;
let isMoving = false;

const grenadeShape = new CANNON.Sphere(GRENADE_RADIUS);

// Weapon management
const setIsMoving = (value) => {
	isMoving = value;
};

const hideAll = () => {
	weaponList.forEach(entity => entity.visible = false);
};

const selectNext = () => {
	hideAll();
	selected = (selected + 1) % weaponList.length;
	weaponList[selected].visible = true;
};

const selectPrevious = () => {
	hideAll();
	selected = (selected - 1 + weaponList.length) % weaponList.length;
	weaponList[selected].visible = true;
};

// Weapon updates
const updateGrenade = (entity) => {
	const { quaternion: q, position: p } = entity.physicsBody;
	mat4.fromRotationTranslation(
		entity.ani_matrix,
		[q.x, q.y, q.z, q.w],
		[p.x, p.y, p.z]
	);

	if (entity.data.light) {
		mat4.fromTranslation(entity.data.light.ani_matrix, [p.x, p.y, p.z]);
	}
};

const createWeaponAnimation = (entity, frameTime) => {
	entity.animationTime += frameTime;
	
	// Fire animation
	let fireAnim = 0;
	if (firing) {
		const dt = performance.now() - firingStart;
		firingTimer += frameTime;
		if (dt > ANIMATION.FIRE_DURATION) {
			firing = false;
		}
		fireAnim = Math.cos(Math.PI * (firingTimer / 1000)) * ANIMATION.AMPLITUDES.FIRE;
	}

	// Movement animation
	let moveHorizontalAnim = 0;
	let moveVerticalAnim = 0;
	if (isMoving) {
		moveHorizontalAnim = Math.cos(Math.PI * (entity.animationTime / ANIMATION.HORIZONTAL_PERIOD)) 
			* ANIMATION.AMPLITUDES.HORIZONTAL_MOVE;
		moveVerticalAnim = -Math.cos(Math.PI * (entity.animationTime / ANIMATION.VERTICAL_PERIOD)) 
			* ANIMATION.AMPLITUDES.VERTICAL_MOVE;
	}

	// Idle animation
	const idleHorizontal = Math.cos(Math.PI * (entity.animationTime / ANIMATION.IDLE_PERIOD.HORIZONTAL)) 
		* ANIMATION.AMPLITUDES.IDLE.HORIZONTAL;
	const idleVertical = Math.sin(Math.PI * (entity.animationTime / ANIMATION.IDLE_PERIOD.VERTICAL)) 
		* ANIMATION.AMPLITUDES.IDLE.VERTICAL;

	// Camera-based positioning
	const dir = vec3.create();
	const pos = vec3.create();
	vec3.copy(dir, Camera.direction);
	vec3.copy(pos, Camera.position);

	mat4.identity(entity.ani_matrix);
	mat4.lookAt(
		entity.ani_matrix,
		pos,
		[pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2]],
		[0, 1, 0]
	);
	mat4.invert(entity.ani_matrix, entity.ani_matrix);
	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		WEAPON_POSITION.x + idleHorizontal + moveHorizontalAnim,
		WEAPON_POSITION.y + idleVertical + moveVerticalAnim,
		WEAPON_POSITION.z + fireAnim
	]);
	mat4.rotateY(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(180));
	mat4.rotateX(entity.ani_matrix, entity.ani_matrix, glMatrix.toRadian(-2.5));
};

const shootGrenade = () => {
	if (firing) return;
	
	firing = true;
	firingStart = performance.now();
	firingTimer = 0;
	
	Resources.get("sounds/shoot.sfx").play();
	
	const p = vec3.create();
	mat4.getTranslation(p, grenadeLauncher.ani_matrix);
	const d = Camera.direction;
	
	const ballEntity = new MeshEntity([0, 0, 0], "meshes/ball.mesh", updateGrenade);
	const spawnPos = [p[0] + d[0], p[1] + d[1] + 0.2, p[2] + d[2]];
	
	// Physics setup
	ballEntity.physicsBody = new CANNON.Body({ mass: GRENADE_MASS });
	ballEntity.physicsBody.position.set(...spawnPos);
	ballEntity.physicsBody.addShape(grenadeShape);
	Physics.addBody(ballEntity.physicsBody);
	ballEntity.physicsBody.velocity.set(
		d[0] * GRENADE_VELOCITY,
		d[1] * GRENADE_VELOCITY,
		d[2] * GRENADE_VELOCITY
	);

	// Light setup
	const lightEntity = new PointLightEntity(
		[0, 0, 0],
		GRENADE_LIGHT_RADIUS,
		GRENADE_LIGHT_COLOR,
		GRENADE_LIGHT_INTENSITY
	);
	lightEntity.visible = true;
	ballEntity.data.light = lightEntity;

	Scene.addEntities([ballEntity, lightEntity]);
};

const load = () => {
	// Initialize weapons
	grenadeLauncher = new FpsMeshEntity(
		[0, 0, 0],
		"meshes/grenade_launcher.mesh",
		createWeaponAnimation
	);
	Scene.addEntities(grenadeLauncher);

	miniGun = new FpsMeshEntity(
		[0, 0, 0],
		"meshes/minigun.mesh",
		createWeaponAnimation
	);
	miniGun.visible = false;
	Scene.addEntities(miniGun);

	// Initialize weapon list
	weaponList = Scene.getEntities(EntityTypes.FPS_MESH);
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
