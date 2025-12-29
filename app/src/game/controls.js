import { Console, Input, Settings, Utils } from "../engine/core/engine.js";
import Game from "./game.js";
import State from "./state.js";
import Weapons from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _initializeEventListeners = () => {
	// Pointer lock events
	document.addEventListener(
		"pointerlockchange",
		() => {
			if (document.pointerLockElement === null && State.current !== "MENU") {
				State.enterMenu("MAIN_MENU");
			}
		},
		false,
	);

	document.addEventListener("pointerlockerror", () => {
		State.enterGame();
	});

	// Window focus event
	window.addEventListener(
		"focus",
		() => {
			if (State.current !== "MENU") {
				State.enterMenu("MAIN_MENU");
			}
		},
		false,
	);

	// Weapon controls
	window.addEventListener("click", (e) => {
		if (e.button > 0) return;
		if (e.target.tagName.toUpperCase() !== "BODY" && !Utils.isMobile()) return;
		if (e.target.id !== "look" && Utils.isMobile()) return;
		Weapons.shootGrenade();
	});

	window.addEventListener("wheel", (e) => {
		if (State.current !== "GAME") return;
		Weapons.selectNext(e.deltaY < 0);
	});
};

const _initializeConsoleControls = () => {
	Input.addKeyDownEvent(192, Console.toggle);
	Input.addKeyDownEvent(13, Console.executeCmd);
};

const _handleEscapeKey = () => {
	if (Console.isVisible()) return;

	if (State.current === "GAME") {
		State.enterMenu("MAIN_MENU");
	} else if (State.current === "MENU") {
		State.enterGame();
	}
};

const _initializeKeyboardControls = () => {
	window.addEventListener("keyup", (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			_handleEscapeKey();
		}
	});

	// Jump on configurable key (default: Space)
	window.addEventListener("keydown", (e) => {
		if (
			e.keyCode === Settings.jump &&
			State.current === "GAME" &&
			!Console.isVisible()
		) {
			e.preventDefault();
			const controller = Game.getController();
			if (controller) {
				controller.jump();
			}
		}
	});
};

// ============================================================================
// Initialization
// ============================================================================

_initializeEventListeners();
_initializeConsoleControls();
_initializeKeyboardControls();

// ============================================================================
// Public API
// ============================================================================

const Controls = {};

export default Controls;
