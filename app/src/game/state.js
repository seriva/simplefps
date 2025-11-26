import { Context, Input, Scene } from "../engine/engine.js";
import { css, Signals } from "../engine/reactive.js";
import HUD from "./hud.js";
import UI from "./ui.js";

const GameStates = {
	MENU: "MENU",
	GAME: "GAME",
};

// Reactive game state
const currentState = Signals.create(GameStates.MENU, undefined, "game:state");
const isBlurred = Signals.create(true, undefined, "game:blur");

// Add blur styles to canvas
const blurStyle = css`
	transition: filter 25ms linear;
`;

Context.canvas.classList.add(blurStyle);

// Apply blur effect based on signal
isBlurred.subscribe((blurred) => {
	Context.canvas.style.filter = blurred ? "blur(8px)" : "blur(0px)";
});

const setState = (newState, menu) => {
	const state = newState.toUpperCase();

	// Batch all state changes together
	Signals.batch(() => {
		currentState.set(state);

		switch (state) {
			case GameStates.GAME:
				Input.toggleVirtualInput(true);
				Input.toggleCursor(false);
				isBlurred.set(false);
				HUD.toggle(true);
				UI.hide();
				Scene.pause(false);
				break;

			case GameStates.MENU:
				Input.toggleVirtualInput(false);
				Input.toggleCursor(true);
				isBlurred.set(true);
				HUD.toggle(false);
				UI.show(menu);
				Scene.pause(true);
				break;
		}
	});
};

window.addEventListener("changestate", (e) => {
	setState(e.detail.state, e.detail.menu);
});

// Export the current state getter
const State = {
	get current() {
		return currentState.get();
	},
	signal: currentState,
	isBlurred,
};

export default State;
