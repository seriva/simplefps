import { mat4 } from "../dependencies/gl-matrix.js";
import { MeshEntity, PointLightEntity } from "../engine/core/engine.js";

// ============================================================================
// Private
// ============================================================================

const _PICKUP_MAP = {
	health: {
		meshName: "meshes/health/health.bmesh",
		lightColor: [0.988, 0.31, 0.051],
	},
	armor: {
		meshName: "meshes/armor/armor.bmesh",
		lightColor: [0, 0.352, 0.662],
	},
	ammo: {
		meshName: "meshes/ammo/ammo.bmesh",
		lightColor: [0.623, 0.486, 0.133],
	},
	rocket_launcher: {
		meshName: "meshes/rocket_launcher/rocket_launcher.bmesh",
		lightColor: [0.752, 0, 0.035],
	},
	energy_scepter: {
		meshName: "meshes/energy_scepter/energy_sceptre.bmesh",
		lightColor: [0.2, 0.8, 1.0],
	},
	laser_gatling: {
		meshName: "meshes/laser_gatling/laser_gatling.bmesh",
		lightColor: [1.0, 0.4, 0.1],
	},
	pulse_cannon: {
		meshName: "meshes/pulse_cannon/pulse_cannon.bmesh",
		lightColor: [0.5, 0.2, 0.8],
	},
};

const _SCALE = 35;
const _ROTATION_SPEED = 1000;
const _BOBBING_AMPLITUDE = 2.5; // World units
const _LIGHT_OFFSET_Y = 0.2 * _SCALE;
const _LIGHT_INTENSITY = 3;
const _LIGHT_RADIUS = 1.8 * _SCALE;
const _PICKUP_OFFSET_Y = 0.19 * _SCALE;
const _SHADOW_HEIGHT = -6.63; // World units relative to pickup center

const _updatePickupEntity = (
	entity,
	frameTime,
	amplitude,
	shouldRotate = false,
) => {
	entity.animationTime += frameTime;
	const animationTimeInSeconds = entity.animationTime / _ROTATION_SPEED;
	mat4.identity(entity.ani_matrix);

	if (shouldRotate) {
		mat4.fromRotation(entity.ani_matrix, animationTimeInSeconds, [0, 1, 0]);
	}

	mat4.translate(entity.ani_matrix, entity.ani_matrix, [
		0,
		Math.cos(Math.PI * animationTimeInSeconds) * amplitude,
		0,
	]);
};

const _createPickup = (type, pos) => {
	if (!_PICKUP_MAP[type]) {
		throw new Error(`Invalid pickup type: ${type}`);
	}

	const { meshName, lightColor } = _PICKUP_MAP[type];
	const pickup = new MeshEntity(
		[pos[0], pos[1] + _PICKUP_OFFSET_Y, pos[2]],
		meshName,
		(entity, frameTime) =>
			_updatePickupEntity(entity, frameTime, _BOBBING_AMPLITUDE / _SCALE, true),
		1 * _SCALE,
	);
	pickup.castShadow = false;
	pickup.shadowHeight = _SHADOW_HEIGHT / _SCALE;

	// const light = new PointLightEntity(
	// 	[pos[0], pos[1] + _LIGHT_OFFSET_Y, pos[2]],
	// 	_LIGHT_RADIUS,
	// 	lightColor,
	// 	_LIGHT_INTENSITY,
	// 	(entity, frameTime) =>
	// 		_updatePickupEntity(entity, frameTime, _BOBBING_AMPLITUDE, false),
	// );

	return [pickup];
};

// ============================================================================
// Public API
// ============================================================================

const Pickup = {
	createPickup: _createPickup,
};

export default Pickup;
