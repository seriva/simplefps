import { Console, Loading, Utils } from "../engine/core/engine.js";
import Translations from "./translations.js";
import UI from "./ui.js";

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
		Utils.dispatchCustomEvent("changestate", {
			state: "GAME",
		});
		Console.log("SW - No new service worker found to update");
	}
};

UI.register("UPDATE_MENU", {
	header: Translations.get("VERSION_NEW"),
	controls: [
		{
			text: Translations.get("YES"),
			callback: () => {
				_update();
			},
		},
		{
			text: Translations.get("NO"),
			callback: () => {
				Utils.dispatchCustomEvent("changestate", {
					state: "GAME",
				});
			},
		},
	],
});

if (navigator.serviceWorker) {
	navigator.serviceWorker
		.register("./sw.js")
		.then((reg) => {
			Console.log("SW - Registered: ", reg);
			_registration = reg;
			_registration.update();
			if (_registration.waiting) {
				_newServiceWorker = _registration.waiting;
				Utils.dispatchCustomEvent("changestate", {
					state: "MENU",
					menu: "UPDATE_MENU",
				});
			} else {
				_registration.addEventListener("updatefound", () => {
					Console.log("SW - Service worker update found");
					_newServiceWorker = _registration.installing;
					_newServiceWorker.addEventListener("statechange", () => {
						if (_newServiceWorker.state === "installed") {
							Utils.dispatchCustomEvent("changestate", {
								state: "MENU",
								menu: "UPDATE_MENU",
							});
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
	force: () => {
		if (_newServiceWorker !== null) {
			Utils.dispatchCustomEvent("changestate", {
				state: "MENU",
				menu: "UPDATE_MENU",
			});
			return;
		}
		if (_registration !== null) {
			_registration.update();
		}
	},
};

export default Update;
