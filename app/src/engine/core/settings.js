import Console from "../systems/console.js";
import Utils from "../utils/utils.js";

// Public Settings object
const Settings = {};

export default Settings;

// Private defaults
const _defaults = {
	// rendering
	zNear: 1,
	zFar: 256,
	renderScale: Utils.isMobile() ? 0.5 : 1.0,
	anisotropicFiltering: 16,
	gamma: 1.0,
	doFXAA: true,
	emissiveOffset: 1.7,
	emissiveMult: 4.25,
	emissiveIteration: 8,

	// SSAO settings
	doSSAO: Utils.isMobile() ? false : true,
	ssaoRadius: 1.0,
	ssaoBias: 0.025,
	ssaoStrength: 0.7,
	ssaoBlurIterations: 8,

	// controls
	forward: 87,
	backwards: 83,
	left: 65,
	right: 68,
	moveSpeed: 7.5,
	lookSensitivity: 5,
};

// Private functions
const _saveSettings = () => {
	const success =
		localStorage?.setItem("settings", JSON.stringify(Settings)) ?? false;
	return success;
};

// Initialize settings
const _stored = localStorage?.getItem("settings") ?? null;
if (_stored) {
	Console.log("Using stored settings");
	// Merge stored settings into defaults (so new defaults get added)
	Object.assign(Settings, _defaults, JSON.parse(_stored));
	// Ensure new properties from defaults exist
	for (const key in _defaults) {
		if (!(key in Settings)) {
			Settings[key] = _defaults[key];
		}
	}
} else {
	Console.log("Using default settings");
	Object.assign(Settings, _defaults);
	_saveSettings();
}

// Register console commands
Console.registerCmd("settings", Settings);
Console.registerCmd("sstore", _saveSettings);
