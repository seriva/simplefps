import { Signals } from "../dependencies/reactive.js";
import { PLAYER_DEFS } from "./gamedefs.js";

// ============================================================================
// Private
// ============================================================================

const _health = Signals.create(
	PLAYER_DEFS.DEFAULTS.health,
	undefined,
	"player:health",
);
const _armor = Signals.create(
	PLAYER_DEFS.DEFAULTS.armor,
	undefined,
	"player:armor",
);
const _ammo = Signals.create(
	PLAYER_DEFS.DEFAULTS.ammo,
	undefined,
	"player:ammo",
);

const _clampedAdd = (signal, amount, max) => {
	signal.set(Math.min(signal.get() + amount, max));
};

const _readOnly = (signal) => ({
	get: () => signal.get(),
	subscribe: (fn) => signal.subscribe(fn),
});

// ============================================================================
// Public API
// ============================================================================

const Player = {
	health: _readOnly(_health),
	armor: _readOnly(_armor),
	ammo: _readOnly(_ammo),

	addHealth(amount) {
		_clampedAdd(_health, amount, PLAYER_DEFS.MAX.health);
	},

	addArmor(amount) {
		_clampedAdd(_armor, amount, PLAYER_DEFS.MAX.armor);
	},

	addAmmo(amount) {
		_clampedAdd(_ammo, amount, PLAYER_DEFS.MAX.ammo);
	},

	reset() {
		_health.set(PLAYER_DEFS.DEFAULTS.health);
		_armor.set(PLAYER_DEFS.DEFAULTS.armor);
		_ammo.set(PLAYER_DEFS.DEFAULTS.ammo);
	},
};

export { Player };
