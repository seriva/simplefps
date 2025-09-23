import { Context, DOM, Input, Scene } from "../engine/engine.js";
import HUD from "./hud.js";
import UI from "./ui.js";

const GameStates = {
	MENU: "MENU",
	GAME: "GAME",
};

let currentState = GameStates.MENU;

let isBlurred = false;
const blurGameCanvas = (blur) => {
	if (blur === undefined) {
		isBlurred = !isBlurred;
	} else {
		isBlurred = blur;
	}

	const blurConfig = {
		mobileHA: false,
		duration: 25,
		delay: 0,
		easing: "linear",
	};

	DOM.animate(Context.canvas.domNode, { blur: isBlurred ? 8 : 0 }, blurConfig);
};

const setState = (newState, menu) => {
	currentState = newState.toUpperCase();

	switch (currentState) {
		case GameStates.GAME:
			Input.toggleVirtualInput(true);
			Input.toggleCursor(false);
			blurGameCanvas(false);
			HUD.toggle(true);
			UI.hide();
			Scene.pause(false);
			break;

		case GameStates.MENU:
			Input.toggleVirtualInput(false);
			Input.toggleCursor(true);
			blurGameCanvas(true);
			HUD.toggle(false);
			UI.show(menu);
			Scene.pause(true);
			break;
	}
};

window.addEventListener("changestate", (e) => {
	setState(e.detail.state, e.detail.menu);
});

export { currentState as default };
