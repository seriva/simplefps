// ============================================================================
// Game Definitions & Configuration
// ============================================================================

// ----------------------------------------------------------------------------
// Player
// ----------------------------------------------------------------------------

export const PLAYER_DEFS = {
	DEFAULTS: {
		health: 100,
		armor: 0,
		ammo: 50,
	},
	MAX: {
		health: 100,
		armor: 100,
		ammo: 100,
	},
};

// ----------------------------------------------------------------------------
// Weapons
// ----------------------------------------------------------------------------

export const WEAPON_INDEX = {
	rocket_launcher: 0,
	energy_scepter: 1,
	laser_gatling: 2,
	plasma_pistol: 3,
	pulse_cannon: 4,
};

export const WEAPON_CONFIG = {
	ROCKET_LAUNCHER: {
		mesh: "meshes/rocket_launcher/rocket_launcher.bmesh",
		index: WEAPON_INDEX.rocket_launcher,
		pickupType: "rocket_launcher",
	},
	ENERGY_SCEPTER: {
		mesh: "meshes/energy_scepter/energy_sceptre.bmesh",
		index: WEAPON_INDEX.energy_scepter,
		pickupType: "energy_scepter",
	},
	LASER_GATLING: {
		mesh: "meshes/laser_gatling/laser_gatling.bmesh",
		positionOffset: { x: 0, y: -0.05, z: 0 },
		index: WEAPON_INDEX.laser_gatling,
		pickupType: "laser_gatling",
	},
	PLASMA_PISTOL: {
		mesh: "meshes/plasma_pistol/plasma_pistol.bmesh",
		index: WEAPON_INDEX.plasma_pistol,
		pickupType: "plasma_pistol",
	},
	PULSE_CANNON: {
		mesh: "meshes/pulse_cannon/pulse_cannon.bmesh",
		index: WEAPON_INDEX.pulse_cannon,
		pickupType: "pulse_cannon",
	},
};

export const PROJECTILE_CONFIG = {
	mesh: "meshes/ball.mesh",
	meshScale: 33,
	velocity: 1200,
	light: {
		radius: 150,
		intensity: 4,
		color: [0.988, 0.31, 0.051],
	},
};

export const WEAPON_POSITION_BASE = {
	x: 0.19,
	y: -0.25,
	z: -0.45,
};

export const WEAPON_SCALE_BASE = {
	x: 1.05,
	y: 1.05,
	z: 0.7, // Squash depth to hide backfaces
};

export const ANIMATION_CONFIG = {
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
	MOVEMENT_FADE_SPEED: 0.005,
	LAND_SPRING_STIFFNESS: 60.0,
	LAND_SPRING_DAMPING: 8.0,
	LAND_IMPULSE: -0.6,
	JUMP_IMPULSE: 0.35,
	SWITCH_DURATION: 150, // ms for one phase (lower or raise)
	SWITCH_LOWER_Y: -0.4, // Units to lower the weapon
};

// ----------------------------------------------------------------------------
// Pickups
// ----------------------------------------------------------------------------

export const WEAPON_PICKUP_DEFAULTS = {
	lightColor: [1.0, 1.0, 1.0],
	scale: 1.4,
	hasSpotlight: true,
};

export const PICKUP_MAP_BASE = {
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
};

export const PICKUP_AMOUNTS = {
	health: 25,
	armor: 25,
	ammo: 25,
};

export const PICKUP_CONSTANTS = {
	RADIUS: 60,
	RESPAWN_TIME: 30000, // 30 seconds
	SCALE: 35,
	ROTATION_SPEED: 1000,
	BOBBING_AMPLITUDE: 2.5,
	LIGHT_INTENSITY: 3.0,
	SPOTLIGHT_INTENSITY: 0.6,
	SPOTLIGHT_ANGLE: 30,
};
