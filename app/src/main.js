import { init, setCallbacks, start, Utils } from "./engine/core/engine.js";
import Game from "./game/game.js";
import Loading from "./game/loading.js";
import Multiplayer from "./game/multiplayer.js";
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
		// Pass Multiplayer.update as alwaysUpdate so it runs even when paused
		setCallbacks(Game.update, (dt) => Multiplayer.update(dt / 1000));

		// Enter game state to render first frame, then show menu with backdrop
		State.enterGame();
		start();
		await Utils.wait();
		Loading.toggle(false);
		State.enterMenu("MAIN_MENU");
	} catch (e) {
		console.error("Critical Game Initialization Failure:", e);
	}
})();
