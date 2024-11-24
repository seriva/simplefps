import { Resources, Utils, loop } from "./engine/engine.js";

(async () => {
	await Resources.load(["resources.list"]);

	// These modules are dependent on resources so we import them dynamicly after resource loading.
	let imp = await import("./game/controls.js");
	imp = await import("./game/world.js");
	const World = imp.default;
	imp = await import("./game/weapons.js");
	const Weapons = imp.default;

	await World.load("test.map");
	Weapons.load();

	Utils.dispatchCustomEvent("changestate", {
		state: "MENU",
		menu: "MAIN_MENU",
	});

	loop();
})();
