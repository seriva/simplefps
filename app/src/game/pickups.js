import { mat4 } from "../dependencies/gl-matrix.js";
import {
	Console,
	MeshEntity,
	PointLightEntity,
	SpotLightEntity,
} from "../engine/engine.js";
import Player from "./player.js";
import Weapons from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _WEAPON_DEFAULTS = {
	lightColor: [1.0, 1.0, 1.0],
	scale: 1.4,
	hasSpotlight: true,
};

const _PICKUP_MAP = {
	health: {
		meshName: "meshes/health/health.bmesh",
		lightColor: [1.0, 0.1, 0.1],
		yOffset: 0.05,
	},
	armor: {
		meshName: "meshes/armor/armor.bmesh",
		lightColor: [0, 0.352, 0.662],
		yOffset: 0.05,
	},
	ammo: {
		meshName: "meshes/ammo/ammo.bmesh",
		lightColor: [0.623, 0.486, 0.133],
		yOffset: 0.05,
	},
	rocket_launcher: {
		..._WEAPON_DEFAULTS,
		meshName: "meshes/rocket_launcher/rocket_launcher.bmesh",
	},
	energy_scepter: {
		..._WEAPON_DEFAULTS,
		meshName: "meshes/energy_scepter/energy_sceptre.bmesh",
	},
	laser_gatling: {
		..._WEAPON_DEFAULTS,
		meshName: "meshes/laser_gatling/laser_gatling.bmesh",
	},
	pulse_cannon: {
		..._WEAPON_DEFAULTS,
		meshName: "meshes/pulse_cannon/pulse_cannon.bmesh",
	},
};

const _PICKUP_AMOUNTS = {
	health: 25,
	armor: 25,
	ammo: 25,
	rocket_launcher: 25,
	energy_scepter: 25,
	laser_gatling: 25,
	pulse_cannon: 25,
};

const _PICKUP_RADIUS = 60;
const _RESPAWN_TIME = 30000; // 30 seconds

const _SCALE = 35;
const _ROTATION_SPEED = 1000;
const _BOBBING_AMPLITUDE = 2.5;
const _LIGHT_OFFSET_Y = 0.2 * _SCALE;
const _LIGHT_INTENSITY = 3.0;
const _LIGHT_RADIUS = 2.5 * _SCALE;
const _SPOTLIGHT_INTENSITY = 0.6;
const _SPOTLIGHT_OFFSET_Y = 2.5 * _SCALE;
const _SPOTLIGHT_ANGLE = 30;
const _SPOTLIGHT_RANGE = 6.0 * _SCALE;
const _PICKUP_OFFSET_Y = 0.15 * _SCALE;
const _UP_AXIS = [0, 1, 0];
const _bobTranslation = [0, 0, 0];

const _getBobOffset = (animationTime, amplitude) =>
	Math.cos(Math.PI * (animationTime / _ROTATION_SPEED)) * amplitude;

const _updatePickupEntity = (
	entity,
	frameTime,
	amplitude,
	shouldRotate = false,
) => {
	entity.animationTime += frameTime;
	mat4.identity(entity.ani_matrix);

	if (shouldRotate) {
		mat4.fromRotation(
			entity.ani_matrix,
			entity.animationTime / _ROTATION_SPEED,
			_UP_AXIS,
		);
	}

	_bobTranslation[1] = _getBobOffset(entity.animationTime, amplitude);
	mat4.translate(entity.ani_matrix, entity.ani_matrix, _bobTranslation);
};

// Active pickup tracking
const _activePickups = [];

const _isWeaponType = (type) =>
	type in _WEAPON_DEFAULTS ||
	[
		"rocket_launcher",
		"energy_scepter",
		"laser_gatling",
		"pulse_cannon",
	].includes(type);

const _applyPickup = (type) => {
	const amount = _PICKUP_AMOUNTS[type] || 25;

	switch (type) {
		case "health":
			Player.addHealth(amount);
			break;
		case "armor":
			Player.addArmor(amount);
			break;
		case "ammo":
			Player.addAmmo(amount);
			break;
		default:
			if (_isWeaponType(type)) {
				const idx = Weapons.WEAPON_INDEX[type];
				if (idx !== undefined) {
					Weapons.unlock(idx);
				}
				Console.log(`[Pickup] Weapon collected: ${type}`);
			}
			break;
	}
};

const _canPickup = (type) => {
	switch (type) {
		case "health":
			return Player.health.get() < 100;
		case "armor":
			return Player.armor.get() < 100;
		case "ammo":
			return Player.ammo.get() < 100;
		default:
			if (_isWeaponType(type)) {
				const idx = Weapons.WEAPON_INDEX[type];
				if (idx !== undefined) {
					// Don't pick up if already unlocked
					// (User requirement: "When any of the wepaons is already picked up ... dont pick it up")
					return !Weapons.isUnlocked(idx);
				}
			}
			return true;
	}
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
		hasSpotlight = false,
	} = _PICKUP_MAP[type];

	const hoverHeight =
		yOffset !== undefined ? yOffset * _SCALE : _PICKUP_OFFSET_Y;

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
				const offset = _getBobOffset(entity.animationTime, _BOBBING_AMPLITUDE);
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
			Console.warn(
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

	// Track for collection checks
	_activePickups.push({
		type,
		position: [pos[0], pos[1], pos[2]],
		entities,
		collected: false,
		respawnAt: 0,
	});

	return entities;
};

const _update = (playerPosition) => {
	const px = playerPosition.x;
	const py = playerPosition.y;
	const pz = playerPosition.z;
	const now = performance.now();

	for (const pickup of _activePickups) {
		if (pickup.collected) {
			// Check respawn
			if (now >= pickup.respawnAt) {
				pickup.collected = false;
				for (const entity of pickup.entities) {
					entity.visible = true;
				}
			}
			continue;
		}

		// Sphere distance check
		const dx = px - pickup.position[0];
		const dy = py - pickup.position[1];
		const dz = pz - pickup.position[2];
		const distSq = dx * dx + dy * dy + dz * dz;

		if (distSq < _PICKUP_RADIUS * _PICKUP_RADIUS) {
			if (_canPickup(pickup.type)) {
				_applyPickup(pickup.type);
				pickup.collected = true;
				pickup.respawnAt = now + _RESPAWN_TIME;
				for (const entity of pickup.entities) {
					entity.visible = false;
				}
			}
		}
	}
};

const _reset = () => {
	_activePickups.length = 0;
};

// ============================================================================
// Public API
// ============================================================================

const Pickup = {
	createPickup: _createPickup,
	update: _update,
	reset: _reset,
};

export default Pickup;
