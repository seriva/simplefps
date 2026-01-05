import {
	Console,
	loop,
	Resources,
	setGameLoop,
	Utils,
} from "./engine/core/engine.js";
import Loading from "./game/loading.js";
import State from "./game/state.js";

// Wire up loading screen to Resources callbacks
Resources.onLoadStart = () => Loading.toggle(true);
Resources.onLoadEnd = () => Loading.toggle(false);

async function loadGameModules() {
	Utils.dispatchCustomEvent("loading", { state: "LOADING_MODULES" });

	const modules = await Promise.all([
		import("./game/controls.js").catch((_err) => null),
		import("./game/game.js").catch((_err) => null),
		import("./game/arena.js").catch((_err) => null),
		import("./game/weapons.js").catch((_err) => null),
		import("./game/menus.js").catch((_err) => null),
		import("./game/hud.js").catch((_err) => null),
	]);

	const [_controls, game, arena, weapons, _menus] = modules;

	if (!game?.default || !arena?.default || !weapons?.default) {
		Console.error("Failed to load required game modules");
	}

	return {
		Game: game.default,
		Arena: arena.default,
		Weapons: weapons.default,
	};
}

(async () => {
	Loading.toggle(true);
	await Resources.load(["resources.list"]);

	const { Game, Arena, Weapons } = await loadGameModules();

	await Arena.load("demo");
	Game.init(Arena.getSpawnPoint());

	// Bind Game logic to Engine loop
	setGameLoop(Game.update, Game.postPhysicsUpdate);

	Weapons.load();

	// Give the game a moment to render, then hide loading screen and show main menu
	State.enterGame();
	setTimeout(() => {
		Loading.toggle(false);
		State.enterMenu("MAIN_MENU");
	}, 100);

	loop();
})();
