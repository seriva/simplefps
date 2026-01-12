import { mat4 } from "../dependencies/gl-matrix.js";
import {
	MeshEntity,
	PointLightEntity,
	SpotLightEntity,
} from "../engine/core/engine.js";

// ============================================================================
// Private
// ============================================================================

const _WEAPON_LIGHT_COLOR = [1.0, 1.0, 1.0];

const _PICKUP_MAP = {
	health: {
		meshName: "meshes/health/health.bmesh",
		lightColor: [1.0, 0.1, 0.1],
		yOffset: 0.05, // Lower than default
		hasSpotlight: false,
	},
	armor: {
		meshName: "meshes/armor/armor.bmesh",
		lightColor: [0, 0.352, 0.662],
		yOffset: 0.05, // Lower than default
		hasSpotlight: false,
	},
	ammo: {
		meshName: "meshes/ammo/ammo.bmesh",
		lightColor: [0.623, 0.486, 0.133],
		yOffset: 0.05, // Lower than default
		hasSpotlight: false,
	},
	rocket_launcher: {
		meshName: "meshes/rocket_launcher/rocket_launcher.bmesh",
		lightColor: _WEAPON_LIGHT_COLOR,
		scale: 1.4,
	},
	energy_scepter: {
		meshName: "meshes/energy_scepter/energy_sceptre.bmesh",
		lightColor: _WEAPON_LIGHT_COLOR,
		scale: 1.4,
	},
	laser_gatling: {
		meshName: "meshes/laser_gatling/laser_gatling.bmesh",
		lightColor: _WEAPON_LIGHT_COLOR,
		scale: 1.4,
	},
	pulse_cannon: {
		meshName: "meshes/pulse_cannon/pulse_cannon.bmesh",
		lightColor: _WEAPON_LIGHT_COLOR,
		scale: 1.4,
	},
};

const _SCALE = 35;
const _ROTATION_SPEED = 1000;
const _BOBBING_AMPLITUDE = 2.5; // World units
const _LIGHT_OFFSET_Y = 0.2 * _SCALE;
const _LIGHT_INTENSITY = 3.0; // Increased from 2.0
const _LIGHT_RADIUS = 2.5 * _SCALE; // Increased from 1.8 (was 2.2 originally)
const _SPOTLIGHT_INTENSITY = 0.6; // Increased from 0.4
const _SPOTLIGHT_OFFSET_Y = 2.5 * _SCALE;
const _SPOTLIGHT_ANGLE = 30; // Reduced from 40
const _SPOTLIGHT_RANGE = 6.0 * _SCALE;
const _PICKUP_OFFSET_Y = 0.15 * _SCALE; // Slightly higher default for weapons
const _SHADOW_HEIGHT = -15; // World units relative to pickup center

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

	const {
		meshName,
		lightColor,
		scale = 1.0,
		yOffset,
		hasSpotlight = true,
	} = _PICKUP_MAP[type];

	const hoverHeight =
		(yOffset !== undefined ? yOffset : _PICKUP_OFFSET_Y / _SCALE) * _SCALE;

	const pickup = new MeshEntity(
		[pos[0], pos[1] + hoverHeight, pos[2]],
		meshName,
		(entity, frameTime) =>
			_updatePickupEntity(entity, frameTime, _BOBBING_AMPLITUDE / _SCALE, true),
		scale * _SCALE,
	);
	pickup.castShadow = true;

	const entities = [pickup];

	if (hasSpotlight) {
		const spotBaseY = pos[1] + _SPOTLIGHT_OFFSET_Y;
		const spotLight = new SpotLightEntity(
			[pos[0], spotBaseY, pos[2]],
			[0, -1, 0],
			lightColor,
			_SPOTLIGHT_INTENSITY,
			_SPOTLIGHT_ANGLE,
			_SPOTLIGHT_RANGE,
			(entity, frameTime) => {
				entity.animationTime = (entity.animationTime || 0) + frameTime;
				const animationTimeInSeconds = entity.animationTime / _ROTATION_SPEED;
				const offset =
					Math.cos(Math.PI * animationTimeInSeconds) * _BOBBING_AMPLITUDE;
				entity.setPosition([pos[0], spotBaseY + offset, pos[2]]);
			},
		);
		entities.push(spotLight);
	} else {
		const mesh = pickup.mesh;
		let lightOffsetX = 0;
		let lightOffsetZ = 0;

		if (mesh.boundingBox) {
			const bbCenter = mesh.boundingBox.center;
			const meshScale = scale * _SCALE;
			lightOffsetX = bbCenter[0] * meshScale;
			lightOffsetZ = bbCenter[2] * meshScale;
		} else {
			console.warn(
				`Mesh bounding box not loaded yet for ${type}, using default light position`,
			);
		}

		const light = new PointLightEntity(
			[pos[0] + lightOffsetX, pos[1] + _LIGHT_OFFSET_Y, pos[2] + lightOffsetZ],
			_LIGHT_RADIUS,
			lightColor,
			_LIGHT_INTENSITY,
			(entity, frameTime) =>
				_updatePickupEntity(entity, frameTime, _BOBBING_AMPLITUDE, false),
		);
		entities.push(light);
	}

	return entities;
};

// ============================================================================
// Public API
// ============================================================================

const Pickup = {
	createPickup: _createPickup,
};

export default Pickup;
