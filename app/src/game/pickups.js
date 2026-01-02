import { mat4 } from "../dependencies/gl-matrix.js";
import { MeshEntity, PointLightEntity } from "../engine/core/engine.js";

// ============================================================================
// Private
// ============================================================================

const _PICKUP_MAP = {
	health: { meshName: "meshes/health.mesh", lightColor: [0.988, 0.31, 0.051] },
	armor: { meshName: "meshes/armor.mesh", lightColor: [0, 0.352, 0.662] },
	ammo: { meshName: "meshes/ammo.mesh", lightColor: [0.623, 0.486, 0.133] },
	grenade_launcher: {
		meshName: "meshes/grenade_launcher.mesh",
		lightColor: [0.752, 0, 0.035],
	},
	rocket_launcher: {
		meshName: "meshes/rocket_launcher/rocket_launcher.bmesh",
		lightColor: [0.752, 0, 0.035],
	},
};

const _ROTATION_SPEED = 1000;
const _BOBBING_AMPLITUDE = 0.1;
const _LIGHT_OFFSET_Y = 0.2;
const _LIGHT_INTENSITY = 3;
const _LIGHT_RADIUS = 1.8;
const _SHADOW_HEIGHT = -0.29;

const _updatePickupEntity = (entity, frameTime, shouldRotate = false) => {
	entity.animationTime += frameTime;
	const animationTimeInSeconds = entity.animationTime / _ROTATION_SPEED;
	mat4.identity(entity.ani_matrix);

	if (shouldRotate) {
		mat4.fromRotation(entity.ani_matrix, animationTimeInSeconds, [0, 1, 0]);
	}

	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		0,
		Math.cos(Math.PI * animationTimeInSeconds) * _BOBBING_AMPLITUDE,
		0,
	]);
};

const _createPickup = (type, pos) => {
	if (!_PICKUP_MAP[type]) {
		throw new Error(`Invalid pickup type: ${type}`);
	}

	const { meshName, lightColor } = _PICKUP_MAP[type];
	const pickup = new MeshEntity(
		pos,
		meshName,
		(entity, frameTime) => _updatePickupEntity(entity, frameTime, true),
		1,
	);
	pickup.castShadow = true;
	pickup.shadowHeight = _SHADOW_HEIGHT;

	const light = new PointLightEntity(
		[pos[0], pos[1] + _LIGHT_OFFSET_Y, pos[2]],
		_LIGHT_RADIUS,
		lightColor,
		_LIGHT_INTENSITY,
		(entity, frameTime) => _updatePickupEntity(entity, frameTime, false),
	);

	return [pickup, light];
};

// ============================================================================
// Public API
// ============================================================================

const Pickup = {
	createPickup: _createPickup,
};

export default Pickup;
