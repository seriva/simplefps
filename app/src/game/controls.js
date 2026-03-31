import { Console, Input, Settings } from "../engine/engine.js";
import { Game } from "./game.js";
import { State } from "./state.js";
import { Weapons } from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _canUseGameplayInput = () =>
	State.current === "GAME" && !Console.isVisible();

const _handleEscapeKey = () => {
	if (Console.isVisible()) return;

	if (State.current === "GAME") {
		State.enterMenu("MAIN_MENU");
	} else if (State.current === "MENU") {
		State.enterGame();
	}
};

// Named handlers so they can be referenced for removeEventListener
const _onPointerLockChange = () => {
	if (document.pointerLockElement === null && State.current !== "MENU") {
		State.enterMenu("MAIN_MENU");
	}
};

const _onPointerLockError = () => {
	State.enterGame();
};

const _onWindowFocus = () => {
	if (State.current !== "MENU") {
		State.enterMenu("MAIN_MENU");
	}
};

const _onClick = (e) => {
	if (!_canUseGameplayInput()) return;
	if (e.button > 0) return;
	if (Settings.isMobile) return; // Disable tap to shoot on mobile
	if (e.target.tagName.toUpperCase() !== "BODY") return;
	Weapons.shootGrenade();
};

const _onShoot = () => {
	if (!_canUseGameplayInput()) return;
	Weapons.shootGrenade();
};

const _onJump = () => {
	if (!_canUseGameplayInput()) return;
	const controller = Game.getController();
	if (controller) controller.jump();
};

const _onWheel = (e) => {
	if (!_canUseGameplayInput()) return;
	if (e.deltaY < 0) {
		Weapons.selectPrevious();
	} else {
		Weapons.selectNext();
	}
};

const _onKeyUp = (e) => {
	if (e.key === "Escape") {
		e.preventDefault();
		_handleEscapeKey();
	}
};

const _onKeyDown = (e) => {
	if (e.keyCode !== Settings.jump || !_canUseGameplayInput()) return;
	if (e.repeat) return;
	e.preventDefault();
	const controller = Game.getController();
	if (controller) controller.jump();
};

// ============================================================================
// Public API
// ============================================================================

const _init = () => {
	document.addEventListener("pointerlockchange", _onPointerLockChange, false);
	document.addEventListener("pointerlockerror", _onPointerLockError);
	window.addEventListener("focus", _onWindowFocus, false);
	window.addEventListener("click", _onClick);
	window.addEventListener("game:shoot", _onShoot);
	window.addEventListener("game:jump", _onJump);
	window.addEventListener("wheel", _onWheel);
	window.addEventListener("keyup", _onKeyUp);
	window.addEventListener("keydown", _onKeyDown);

	Input.addKeyDownEvent(192, Console.toggle);
	Input.addKeyDownEvent(13, Console.executeCmd);
};

const _dispose = () => {
	document.removeEventListener(
		"pointerlockchange",
		_onPointerLockChange,
		false,
	);
	document.removeEventListener("pointerlockerror", _onPointerLockError);
	window.removeEventListener("focus", _onWindowFocus, false);
	window.removeEventListener("click", _onClick);
	window.removeEventListener("game:shoot", _onShoot);
	window.removeEventListener("game:jump", _onJump);
	window.removeEventListener("wheel", _onWheel);
	window.removeEventListener("keyup", _onKeyUp);
	window.removeEventListener("keydown", _onKeyDown);
};

const Controls = {
	init: _init,
	dispose: _dispose,
};

export { Controls };
