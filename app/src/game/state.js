import { Context, Input, Physics, Scene } from "../engine/core/engine.js";
import { css, Signals } from "../engine/utils/reactive.js";
import UI from "./ui.js";

// ============================================================================
// Private
// ============================================================================

const _GameStates = Object.freeze({
	MENU: "MENU",
	GAME: "GAME",
});

const _currentState = Signals.create(_GameStates.MENU, undefined, "game:state");
const _isBlurred = Signals.create(true, undefined, "game:blur");

const _blurStyle = css`
	transition: filter 25ms linear;
`;

Context.canvas.classList.add(_blurStyle);
// Initialize blur immediately to avoid white flash on load
Context.canvas.style.filter = "blur(8px)";

_isBlurred.subscribe((blurred) => {
	Context.canvas.style.filter = blurred ? "blur(8px)" : "blur(0px)";
});

// Subscribe to state changes to orchestrate system transitions
_currentState.subscribe((state) => {
	switch (state) {
		case _GameStates.GAME:
			Input.toggleVirtualInput(true);
			Input.toggleCursor(false);
			_isBlurred.set(false);
			Scene.pause(false);
			Physics.pause(false);
			break;

		case _GameStates.MENU:
			Input.toggleVirtualInput(false);
			Input.toggleCursor(true);
			_isBlurred.set(true);
			Scene.pause(true);
			Physics.pause(true);
			break;
	}
});

// Listen for changestate events from engine layer (avoids circular dependencies)
window.addEventListener("changestate", (e) => {
	const stateUpper = e.detail.state.toUpperCase();
	if (stateUpper === _GameStates.MENU) {
		State.enterMenu(e.detail.menu);
	} else if (stateUpper === _GameStates.GAME) {
		State.enterGame();
	}
});

// ============================================================================
// Public API
// ============================================================================

const State = {
	get current() {
		return _currentState.get();
	},

	/**
	 * Transitions to the main menu state
	 * @param {string} [menu] - Optional specific menu to show
	 */
	enterMenu(menu) {
		Signals.batch(() => {
			_currentState.set(_GameStates.MENU);
			UI.show(menu);
		});
	},

	/**
	 * Transitions to the in-game state
	 */
	enterGame() {
		Signals.batch(() => {
			_currentState.set(_GameStates.GAME);
			UI.hide();
		});
	},

	signal: _currentState,
	isBlurred: _isBlurred,
};

export default State;
