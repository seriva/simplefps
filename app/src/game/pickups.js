import { mat4 } from "../dependencies/gl-matrix.js";
import {
	Console,
	MeshEntity,
	PointLightEntity,
	SpotLightEntity,
} from "../engine/engine.js";

import {
	PICKUP_AMOUNTS,
	PICKUP_CONSTANTS,
	PICKUP_MAP_BASE,
	WEAPON_CONFIG,
	WEAPON_INDEX,
	WEAPON_PICKUP_DEFAULTS,
} from "./game_defs.js";
import Player from "./player.js";
import Weapons from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _PICKUP_MAP = { ...PICKUP_MAP_BASE };

// Merge weapon configs into pickup map
for (const key in WEAPON_CONFIG) {
	const weapon = WEAPON_CONFIG[key];
	// Use weapon_defs config but apply pickup-specific defaults
	_PICKUP_MAP[weapon.pickupType] = {
		...WEAPON_PICKUP_DEFAULTS,
		meshName: weapon.mesh,
	};
}

const _PICKUP_AMOUNTS = PICKUP_AMOUNTS;

const _SCALE = PICKUP_CONSTANTS.SCALE;
const _ROTATION_SPEED = PICKUP_CONSTANTS.ROTATION_SPEED;
const _BOBBING_AMPLITUDE = PICKUP_CONSTANTS.BOBBING_AMPLITUDE;
const _RESPAWN_ANIMATION_DURATION = 500;
const _LIGHT_OFFSET_Y = 0.2 * _SCALE;
const _LIGHT_INTENSITY = PICKUP_CONSTANTS.LIGHT_INTENSITY;
const _LIGHT_RADIUS = 2.5 * _SCALE;
const _SPOTLIGHT_INTENSITY = PICKUP_CONSTANTS.SPOTLIGHT_INTENSITY;
const _SPOTLIGHT_OFFSET_Y = 2.5 * _SCALE;
const _SPOTLIGHT_ANGLE = PICKUP_CONSTANTS.SPOTLIGHT_ANGLE;
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
	// Always reset transformation matrix first!
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

	const spawnScale = entity.spawnScale ?? 1.0;
	mat4.scale(entity.ani_matrix, entity.ani_matrix, [
		spawnScale,
		spawnScale,
		spawnScale,
	]);
};

// Active pickup tracking
const _activePickups = [];

const _isWeaponType = (type) => type in WEAPON_INDEX;

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
			[pos[0] + lightOffsetX, pos[1] + hoverHeight, pos[2] + lightOffsetZ],
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
		collectAnimationStart: 0,
		respawnAt: 0,
		respawnAnimationStart: 0,
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
				pickup.respawnAnimationStart = now;
				for (const entity of pickup.entities) {
					entity.visible = true;
					// Start small
					entity.spawnScale = 0.0;
				}
			}
			continue;
		}

		// Handle respawn animation
		if (pickup.respawnAnimationStart > 0) {
			const progress =
				(now - pickup.respawnAnimationStart) / _RESPAWN_ANIMATION_DURATION;

			if (progress >= 1.0) {
				pickup.respawnAnimationStart = 0;
				for (const entity of pickup.entities) {
					entity.spawnScale = 1.0;
				}
			} else {
				// Ease out back
				const t = progress - 1;
				const scale = t * t * t + 1; // Cubic ease out

				for (const entity of pickup.entities) {
					entity.spawnScale = scale;
				}
			}
		}

		// Sphere distance check
		const dx = px - pickup.position[0];
		const dy = py - pickup.position[1];
		const dz = pz - pickup.position[2];
		const distSq = dx * dx + dy * dy + dz * dz;

		if (distSq < PICKUP_CONSTANTS.RADIUS * PICKUP_CONSTANTS.RADIUS) {
			if (_canPickup(pickup.type)) {
				_applyPickup(pickup.type);
				pickup.collected = true;
				pickup.respawnAt = now + PICKUP_CONSTANTS.RESPAWN_TIME;
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
