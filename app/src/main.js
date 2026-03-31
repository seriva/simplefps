import { init, setCallbacks, start } from "./engine/engine.js";
import { Controls } from "./game/controls.js";
import { Game } from "./game/game.js";
import { Loading } from "./game/loading.js";
import { Multiplayer } from "./game/multiplayer.js";
import { State } from "./game/state.js";
import { Update } from "./game/update.js";
// Side-effect imports (menus, hud register themselves)
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

		Controls.init();
		State.init();
		Game.init();
		Multiplayer.init();
		Update.init();

		// Enter game state to render first frame, then show menu with backdrop
		State.enterGame();
		start();
		await new Promise((r) => setTimeout(r, 100));
		Loading.toggle(false);
		State.enterMenu("MAIN_MENU");
	} catch (e) {
		console.error("Critical Game Initialization Failure:", e);
	}
})();
