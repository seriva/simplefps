import { mat4 } from "../dependencies/gl-matrix.js";
import { MeshEntity, PointLightEntity } from "../engine/engine.js";

const pickupMap = {
	health: { meshName: "meshes/health.mesh", lightColor: [0.988, 0.31, 0.051] },
	armor: { meshName: "meshes/armor.mesh", lightColor: [0, 0.352, 0.662] },
	ammo: { meshName: "meshes/ammo.mesh", lightColor: [0.623, 0.486, 0.133] },
	grenade_launcher: {
		meshName: "meshes/grenade_launcher.mesh",
		lightColor: [0.752, 0, 0.035],
	},
	minigun: { meshName: "meshes/minigun.mesh", lightColor: [0.752, 0, 0.035] },
};

const ROTATION_SPEED = 1000;
const BOBBING_AMPLITUDE = 0.1;
const LIGHT_OFFSET_Y = 0.2;
const LIGHT_INTENSITY = 3;
const LIGHT_RADIUS = 1.8;
const SHADOW_HEIGHT = -0.29;

const updatePickupEntity = (entity, frameTime, shouldRotate = false) => {
	entity.animationTime += frameTime;
	const animationTimeInSeconds = entity.animationTime / ROTATION_SPEED;
	mat4.identity(entity.ani_matrix);

	if (shouldRotate) {
		mat4.fromRotation(entity.ani_matrix, animationTimeInSeconds, [0, 1, 0]);
	}

	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		0,
		Math.cos(Math.PI * animationTimeInSeconds) * BOBBING_AMPLITUDE,
		0,
	]);
};

const createPickup = (type, pos) => {
	if (!pickupMap[type]) {
		throw new Error(`Invalid pickup type: ${type}`);
	}

	const { meshName, lightColor } = pickupMap[type];
	const pickup = new MeshEntity(
		pos,
		meshName,
		(entity, frameTime) => updatePickupEntity(entity, frameTime, true),
		1,
	);
	pickup.castShadow = true;
	pickup.shadowHeight = SHADOW_HEIGHT;

	const light = new PointLightEntity(
		[pos[0], pos[1] + LIGHT_OFFSET_Y, pos[2]],
		LIGHT_RADIUS,
		lightColor,
		LIGHT_INTENSITY,
		(entity, frameTime) => updatePickupEntity(entity, frameTime, false),
	);

	return [pickup, light];
};

const Pickup = {
	createPickup,
};

export { Pickup as default };
