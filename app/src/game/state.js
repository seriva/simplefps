import { css, Signals } from "../dependencies/reactive.js";
import { getCanvas, Input, pause } from "../engine/engine.js";
import { UI } from "./ui.js";

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

// Canvas is not available until backendReady resolves, so access it lazily.
let _canvas = null;
const _getCanvas = () => {
	if (!_canvas) {
		_canvas = getCanvas();
		if (_canvas) {
			_canvas.classList.add(_blurStyle);
			_canvas.style.filter = "blur(8px)";
		}
	}
	return _canvas;
};

_isBlurred.subscribe((blurred) => {
	const canvas = _getCanvas();
	if (canvas) canvas.style.filter = blurred ? "blur(8px)" : "blur(0px)";
});

// Subscribe to state changes to orchestrate system transitions
_currentState.subscribe((state) => {
	switch (state) {
		case _GameStates.GAME:
			Input.toggleVirtualInput(true);
			Input.toggleCursor(false);
			_isBlurred.set(false);
			pause(false);
			break;

		case _GameStates.MENU:
			Input.toggleVirtualInput(false);
			Input.toggleCursor(true);
			_isBlurred.set(true);
			pause(true);
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

	enterMenu(menu) {
		Signals.batch(() => {
			_currentState.set(_GameStates.MENU);
			UI.show(menu);
		});
	},

	enterGame() {
		Signals.batch(() => {
			_currentState.set(_GameStates.GAME);
			UI.hide();
		});
	},

	signal: _currentState,
	isBlurred: _isBlurred,
};

export { State };
