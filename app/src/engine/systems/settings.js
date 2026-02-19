import Console from "./console.js";

// Compute once at init — device type never changes at runtime
const _isMobile =
	navigator.userAgentData?.mobile ??
	(window.matchMedia("(max-width: 768px)").matches ||
		/Mobi|Android/i.test(navigator.userAgent));

// Public Settings object
const Settings = {
	isMobile: _isMobile,
	save: () => _saveSettings(),
};

export default Settings;

// Private defaults
const _defaults = {
	// rendering
	useWebGPU: true,
	zNear: 0.1,
	zFar: 8192,
	renderScale: _isMobile ? 0.5 : 1.0,
	anisotropicFiltering: 16,
	gamma: 1.0,
	doFXAA: true,
	proceduralDetail: true,
	emissiveOffset: 1.35,
	emissiveMult: 1.75,
	emissiveIteration: 6,
	showStats: false,
	shadowBlurIterations: 1,
	shadowBlurOffset: 0.3,
	shadowIntensity: 0.5,
	lightBlurIterations: 4,
	occlusionCulling: true,

	// SSAO settings
	doSSAO: false,
	ssaoRadius: 12,
	ssaoBias: 2.0,
	ssaoStrength: 0.8,
	ssaoBlurIterations: 5,

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
	localStorage?.setItem("settings", JSON.stringify(Settings));
};

// Initialize settings
const _stored = localStorage?.getItem("settings") ?? null;
if (_stored) {
	Console.log("[Settings] Using stored settings");
	// Merge stored settings into defaults (so new defaults get added)
	Object.assign(Settings, _defaults, JSON.parse(_stored));
} else {
	Console.log("[Settings] Using default settings");
	Object.assign(Settings, _defaults);
	_saveSettings();
}

// Ensure isMobile is always the detected value, not what was stored
Settings.isMobile = _isMobile;

// Register console commands
Console.registerCmd("settings", Settings);
Console.registerCmd("sstore", _saveSettings);
