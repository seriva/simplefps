import { Context, DOM, Input, Scene } from "../engine/engine.js";
import HUD from "./hud.js";
import UI from "./ui.js";

let State = "MENU";

let doBlur = false;
const blurGameCanvas = (blur) => {
	blur === undefined ? (doBlur = !doBlur) : (doBlur = blur);
	if (doBlur) {
		DOM.animate(
			Context.canvas.domNode,
			{ blur: 8 },
			{
				mobileHA: false,
				duration: 25,
				delay: 0,
				easing: "linear",
			},
		);
	} else {
		DOM.animate(
			Context.canvas.domNode,
			{ blur: 0 },
			{
				mobileHA: false,
				duration: 25,
				delay: 0,
				easing: "linear",
			},
		);
	}
};

const setState = (s, menu) => {
	State = s.toUpperCase();

	switch (State) {
		case "GAME":
			Input.toggleVirtualInput(true);
			Input.toggleCursor(false);
			blurGameCanvas(false);
			HUD.toggle(true);
			UI.hide();
			Scene.pause(false);
			break;
		case "MENU":
			Input.toggleVirtualInput(false);
			Input.toggleCursor(true);
			blurGameCanvas(true);
			HUD.toggle(false);
			UI.show(menu);
			Scene.pause(true);
			break;
		default:
			break;
	}
};

window.addEventListener("changestate", (e) => {
	setState(e.detail.state, e.detail.menu);
});

export { State as default };
