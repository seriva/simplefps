import { mat4 } from "../dependencies/gl-matrix.js";
import { MeshEntity, PointLightEntity } from "../engine/engine.js";

const meshMap = new Map();
meshMap.set(1, "meshes/health.mesh");
meshMap.set(2, "meshes/armor.mesh");
meshMap.set(3, "meshes/ammo.mesh");
meshMap.set(4, "meshes/grenade_launcher.mesh");
meshMap.set(5, "meshes/minigun.mesh");

const updatePickup = (entity, frameTime) => {
	entity.animationTime += frameTime;
	mat4.identity(entity.ani_matrix);
	mat4.fromRotation(entity.ani_matrix, entity.animationTime / 1000, [0, 1, 0]);
	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		0,
		Math.cos(Math.PI * (entity.animationTime / 1000)) * 0.1,
		0,
	]);
	for (const e of entity.children) {
		mat4.copy(e.ani_matrix, entity.ani_matrix);
		mat4.translate(e.ani_matrix, e.ani_matrix, [0, 0.25, 0]);
	}
};
const createPickup = (type, pos) => {
	const mesh = meshMap.get(type);
	const pickup = new MeshEntity(pos, mesh, updatePickup, 2);
	pickup.castShadow = true;
	pickup.shadowHeight = -0.29;
	switch (type) {
		case 1:
			pickup.addChild(new PointLightEntity(pos, 1.8, [0.752, 0, 0.035], 3));
			break;
		case 2:
			pickup.addChild(new PointLightEntity(pos, 1.8, [0, 0.352, 0.662], 3));
			break;
		case 3:
			pickup.addChild(new PointLightEntity(pos, 1.8, [0.623, 0.486, 0.133], 3));
			break;
		case 4:
			pickup.addChild(new PointLightEntity(pos, 1.8, [0.2, 0.552, 0.862], 3));
			break;
		case 5:
			pickup.addChild(new PointLightEntity(pos, 1.8, [0.752, 0, 0.035], 3));
			break;
		default:
		// code block
	}
	return pickup;
};

const Pickup = {
	createPickup,
};

export { Pickup as default };
