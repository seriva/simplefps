import { Loading, Utils } from "../engine/core/engine.js";
import Translations from "./translations.js";
import UI from "./ui.js";

let newServiceWorker = null;
let registration = null;

const update = () => {
	if (newServiceWorker !== null) {
		Loading.toggle(true, true);
		newServiceWorker.postMessage({
			action: "skipWaiting",
		});
	} else {
		Utils.dispatchCustomEvent("changestate", {
			state: "GAME",
		});
		console.log("SW - No new service worker found to update");
	}
};

UI.register("UPDATE_MENU", {
	header: Translations.get("VERSION_NEW"),
	controls: [
		{
			text: Translations.get("YES"),
			callback: () => {
				update();
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
			console.log("SW - Registered: ", reg);
			registration = reg;
			registration.update();
			if (registration.waiting) {
				newServiceWorker = registration.waiting;
				Utils.dispatchCustomEvent("changestate", {
					state: "MENU",
					menu: "UPDATE_MENU",
				});
			} else {
				registration.addEventListener("updatefound", () => {
					console.log("SW - Service worker update found");
					newServiceWorker = registration.installing;
					newServiceWorker.addEventListener("statechange", () => {
						if (newServiceWorker.state === "installed") {
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
			console.log("SW - Registration failed: ", error);
		});

	let refreshing;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (refreshing) return;
		console.log("SW - Refreshing to load new version");
		window.location.reload();
		refreshing = true;
	});
}

const Update = {
	force: () => {
		if (newServiceWorker !== null) {
			Utils.dispatchCustomEvent("changestate", {
				state: "MENU",
				menu: "UPDATE_MENU",
			});
			return;
		}
		if (registration !== null) {
			registration.update();
		}
	},
};

export default Update;
