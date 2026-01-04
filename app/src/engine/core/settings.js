import Console from "../systems/console.js";
import Utils from "../utils/utils.js";

// Public Settings object
const Settings = {
	save: () => _saveSettings(),
};

export default Settings;

// Private defaults
const _defaults = {
	// rendering
	zNear: 0.1,
	zFar: 8192,
	renderScale: Utils.isMobile() ? 0.5 : 1.0,
	anisotropicFiltering: 16,
	gamma: 1.0,
	doFXAA: true,
	detailTexture: true,
	emissiveOffset: 1.35,
	emissiveMult: 1.75,
	emissiveIteration: 6,
	showStats: false,
	shadowBlurIterations: 2,
	shadowBlurOffset: 0.8,

	// SSAO settings
	doSSAO: false,
	ssaoRadius: 20,
	ssaoBias: 2.0,
	ssaoStrength: 1.2,
	ssaoBlurIterations: 6,

	// Dirt/vignette effect
	doDirt: true,
	dirtIntensity: 0.25,

	// controls
	forward: 87,
	backwards: 83,
	left: 65,
	right: 68,
	jump: 32,
	lookSensitivity: 0.25,
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
