import { Signals } from "../dependencies/reactive.js";
import { PLAYER_DEFS } from "./game_defs.js";

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

// ============================================================================
// Public API
// ============================================================================

const Player = {
	health: _health,
	armor: _armor,
	ammo: _ammo,

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

export default Player;
