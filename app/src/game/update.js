import { Console, Loading } from "../engine/core/engine.js";
import State from "./state.js";

// ============================================================================
// Private
// ============================================================================

let _newServiceWorker = null;
let _registration = null;

const _update = () => {
	if (_newServiceWorker !== null) {
		Loading.toggle(true, true);
		_newServiceWorker.postMessage({
			action: "skipWaiting",
		});
	} else {
		State.enterGame();
		Console.log("SW - No new service worker found to update");
	}
};

if (navigator.serviceWorker) {
	navigator.serviceWorker
		.register("./sw.js")
		.then((reg) => {
			Console.log("SW - Registered: ", reg);
			_registration = reg;
			_registration.update();
			if (_registration.waiting) {
				_newServiceWorker = _registration.waiting;
				State.enterMenu("UPDATE_MENU");
			} else {
				_registration.addEventListener("updatefound", () => {
					Console.log("SW - Service worker update found");
					_newServiceWorker = _registration.installing;
					_newServiceWorker.addEventListener("statechange", () => {
						if (_newServiceWorker.state === "installed") {
							State.enterMenu("UPDATE_MENU");
						}
					});
				});
			}
		})
		.catch((error) => {
			Console.error("SW - Registration failed: ", error);
		});

	let refreshing;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (refreshing) return;
		Console.log("SW - Refreshing to load new version");
		window.location.reload();
		refreshing = true;
	});
}

// ============================================================================
// Public API
// ============================================================================

const Update = {
	update: _update,
	force: () => {
		if (_newServiceWorker !== null) {
			State.enterMenu("UPDATE_MENU");
			return;
		}
		if (_registration !== null) {
			_registration.update();
		}
	},
};

export default Update;
