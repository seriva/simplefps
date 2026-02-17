import { Signals } from "../dependencies/reactive.js";

// ============================================================================
// Private
// ============================================================================

const _DEFAULTS = {
	health: 100,
	armor: 0,
	ammo: 50,
};

const _MAX = {
	health: 100,
	armor: 100,
	ammo: 100,
};

const _health = Signals.create(_DEFAULTS.health, undefined, "player:health");
const _armor = Signals.create(_DEFAULTS.armor, undefined, "player:armor");
const _ammo = Signals.create(_DEFAULTS.ammo, undefined, "player:ammo");

const _clampedAdd = (signal, amount, max) => {
	signal.set(Math.min(signal.get() + amount, max));
};

// ============================================================================
// Public API
// ============================================================================

const Player = {
	health: _health,
	armor: _armor,
	ammo: _ammo,

	addHealth(amount) {
		_clampedAdd(_health, amount, _MAX.health);
	},

	addArmor(amount) {
		_clampedAdd(_armor, amount, _MAX.armor);
	},

	addAmmo(amount) {
		_clampedAdd(_ammo, amount, _MAX.ammo);
	},

	reset() {
		_health.set(_DEFAULTS.health);
		_armor.set(_DEFAULTS.armor);
		_ammo.set(_DEFAULTS.ammo);
	},
};

export default Player;
