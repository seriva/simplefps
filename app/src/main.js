import { Resources, Utils, loop } from "./engine/engine.js";

const MENU_DELAY = 100;
const INITIAL_LEVEL = "demo";

// Load everything in parallel at the top level
const [
	_resources,
	[_controls, { default: Arena }, { default: Weapons }]
] = await Promise.all([
	Resources.load(["resources.list"]),
	Promise.all([
		import("./game/controls.js"),
		import("./game/arena.js"),
		import("./game/weapons.js")
	])
]);

// Initialize game systems
await Promise.all([
	Arena.load(INITIAL_LEVEL),
	Weapons.load()
]);

// Start game loop immediately
loop();

// Show menu after delay
setTimeout(() => {
	Utils.dispatchCustomEvent("changestate", {
		state: "MENU",
		menu: "MAIN_MENU",
	});
}, MENU_DELAY);
