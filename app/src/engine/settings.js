import Console from "./console.js";
import Utils from "./utils.js";

const defaults = {
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

	// controls
	forward: 87,
	backwards: 83,
	left: 65,
	right: 68,
	moveSpeed: 7.5,
	lookSensitivity: 5,
};

const Settings = {};

const saveSettings = () => {
	const success =
		localStorage?.setItem("settings", JSON.stringify(Settings)) ?? false;
	return success;
};

// Initialize settings
const stored = localStorage?.getItem("settings") ?? null;
if (stored) {
	Console.log("Using stored settings");
	Object.assign(Settings, defaults, JSON.parse(stored));
} else {
	Console.log("Using default settings");
	Object.assign(Settings, defaults);
	saveSettings();
}

// Register console commands
Console.registerCmd("settings", Settings);
Console.registerCmd("sstore", saveSettings);

export default Settings;
