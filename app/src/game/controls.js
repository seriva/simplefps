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
		if (Utils.isMobile()) return; // Disable tap to shoot on mobile
		if (e.target.tagName.toUpperCase() !== "BODY") return;
		Weapons.shootGrenade();
	});

	// Virtual button events
	window.addEventListener("game:shoot", () => {
		Weapons.shootGrenade();
	});

	window.addEventListener("game:jump", () => {
		if (State.current === "GAME" && !Console.isVisible()) {
			const controller = Game.getController();
			if (controller) {
				controller.jump();
			}
		}
	});

	window.addEventListener("wheel", (e) => {
		if (State.current !== "GAME") return;
		if (e.deltaY < 0) {
			Weapons.selectPrevious();
		} else {
			Weapons.selectNext();
		}
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
			if (e.repeat) return;
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
// Public API (side-effect only module)
// ============================================================================

export default {};
