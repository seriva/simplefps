import { Context, Input, Scene } from "../engine/core/engine.js";
import { css, Signals } from "../engine/utils/reactive.js";
import HUD from "./hud.js";
import UI from "./ui.js";

// ============================================================================
// Private
// ============================================================================

const _GameStates = {
	MENU: "MENU",
	GAME: "GAME",
};

const _currentState = Signals.create(_GameStates.MENU, undefined, "game:state");
const _isBlurred = Signals.create(true, undefined, "game:blur");

const _blurStyle = css`
	transition: filter 25ms linear;
`;

Context.canvas.classList.add(_blurStyle);

_isBlurred.subscribe((blurred) => {
	Context.canvas.style.filter = blurred ? "blur(8px)" : "blur(0px)";
});

const _setState = (newState, menu) => {
	const state = newState.toUpperCase();

	Signals.batch(() => {
		_currentState.set(state);

		switch (state) {
			case _GameStates.GAME:
				Input.toggleVirtualInput(true);
				Input.toggleCursor(false);
				_isBlurred.set(false);
				HUD.toggle(true);
				UI.hide();
				Scene.pause(false);
				break;

			case _GameStates.MENU:
				Input.toggleVirtualInput(false);
				Input.toggleCursor(true);
				_isBlurred.set(true);
				HUD.toggle(false);
				UI.show(menu);
				Scene.pause(true);
				break;
		}
	});
};

window.addEventListener("changestate", (e) => {
	_setState(e.detail.state, e.detail.menu);
});

// ============================================================================
// Public API
// ============================================================================

const State = {
	get current() {
		return _currentState.get();
	},
	signal: _currentState,
	isBlurred: _isBlurred,
};

export default State;
