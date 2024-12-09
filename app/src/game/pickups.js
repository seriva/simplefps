import { mat4 } from "../dependencies/gl-matrix.js";
import { MeshEntity, PointLightEntity } from "../engine/engine.js";

const pickupMap = {
	"health": {meshName: "meshes/health.mesh", lightColor: [0.952, 0, 0.035]},
	"armor": {meshName: "meshes/armor.mesh", lightColor:  [0, 0.352, 0.662]},
	"ammo": {meshName: "meshes/ammo.mesh", lightColor: [0.623, 0.486, 0.133]},
	"grenade_launcher": {meshName: "meshes/grenade_launcher.mesh", lightColor: [0.752, 0, 0.035]},
	"minigun": {meshName: "meshes/minigun.mesh", lightColor: [0.752, 0, 0.035]},
};

const updatePickup = (entity, frameTime) => {
	entity.animationTime += frameTime;
	mat4.identity(entity.ani_matrix);
	mat4.fromRotation(entity.ani_matrix, entity.animationTime / 1000, [0, 1, 0]);
	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		0,
		Math.cos(Math.PI * (entity.animationTime / 1000)) * 0.1,
		0,
	]);
};

const createPickup = (type, pos) => {
	const pickup = new MeshEntity(pos, pickupMap[type].meshName, updatePickup, 1);
	pickup.castShadow = true;
	pickup.shadowHeight = -0.29;
	const light = new PointLightEntity([pos[0], pos[1] + 0.4, pos[2]], 1, pickupMap[type].lightColor, 2.5, updatePickup);
	return [pickup, light];
};

const Pickup = {
	createPickup,
};

export { Pickup as default };
