import { init, setGameLoop, start, Utils } from "./engine/core/engine.js";
import Game from "./game/game.js";
import Loading from "./game/loading.js";
import State from "./game/state.js";

// Side-effect imports (controls, menus, hud register themselves)
import "./game/controls.js";
import "./game/menus.js";
import "./game/hud.js";

(async () => {
	try {
		Loading.toggle(true);

		// Initialize engine and load core resources
		await init({ resources: ["resources.list"] });

		// Load map and initialize game
		await Game.load("demo");
		setGameLoop(Game.update, Game.postPhysicsUpdate);

		// Start render loop and show menu
		State.enterGame();
		start();
		await Utils.wait();
		Loading.toggle(false);
		State.enterMenu("MAIN_MENU");
	} catch (e) {
		console.error("Critical Game Initialization Failure:", e);
	}
})();
