import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	Input,
	Resources,
	Settings,
	Utils,
} from "../engine/core/engine.js";
import State from "./state.js";
import Translations from "./translations.js";
import UI from "./ui.js";
import Update from "./update.js";
import Weapons from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _CAMERA_SENSITIVITY_DIVISOR = 33.0;
const _MAX_VERTICAL_ROTATION = 89;
const _MOVEMENT_SPEED_MULTIPLIER = 5;

const _music = Resources.get("sounds/music.sfx");

UI.register("MAIN_MENU", {
	header: Translations.get("MAIN_MENU"),
	controls: [
		{
			text: Translations.get("CONTINUE_GAME"),
			callback: () => {
				Utils.dispatchCustomEvent("changestate", {
					state: "GAME",
				});
				_music.resume();
			},
		},
		{
			text: Translations.get("VERSION_CHECK"),
			callback: () => {
				Update.force();
			},
		},
	],
});

const _initializeEventListeners = () => {
	// Pointer lock events
	document.addEventListener(
		"pointerlockchange",
		() => {
			if (document.pointerLockElement === null && State.current !== "MENU") {
				Utils.dispatchCustomEvent("changestate", {
					state: "MENU",
					menu: "MAIN_MENU",
				});
				music.pause();
			}
		},
		false,
	);

	document.addEventListener("pointerlockerror", () => {
		Utils.dispatchCustomEvent("changestate", { state: "GAME" });
	});

	// Window focus event
	window.addEventListener(
		"focus",
		() => {
			if (State.current !== "MENU") {
				Utils.dispatchCustomEvent("changestate", {
					state: "MENU",
					menu: "MAIN_MENU",
				});
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

Input.setUpdateCallback((frameTime) => {
	if (Console.isVisible() || State.current === "MENU") return;
	const ft = frameTime / 1000;

	// look
	const mpos = Input.cursorMovement();
	Camera.rotation[0] -=
		(mpos.x / _CAMERA_SENSITIVITY_DIVISOR) * Settings.lookSensitivity;
	Camera.rotation[1] +=
		(mpos.y / _CAMERA_SENSITIVITY_DIVISOR) * Settings.lookSensitivity;
	if (Camera.rotation[1] > _MAX_VERTICAL_ROTATION) {
		Camera.rotation[1] = _MAX_VERTICAL_ROTATION;
	}
	if (Camera.rotation[1] < -_MAX_VERTICAL_ROTATION) {
		Camera.rotation[1] = -_MAX_VERTICAL_ROTATION;
	}
	if (Camera.rotation[0] < 0) {
		Camera.rotation[0] = 360;
	}
	if (Camera.rotation[0] > 360) {
		Camera.rotation[0] = 0;
	}
	Camera.direction[0] = 0;
	Camera.direction[1] = 0;
	Camera.direction[2] = 1;
	vec3.rotateX(
		Camera.direction,
		Camera.direction,
		[0, 0, 0],
		glMatrix.toRadian(Camera.rotation[1]),
	);
	vec3.rotateY(
		Camera.direction,
		Camera.direction,
		[0, 0, 0],
		glMatrix.toRadian(Camera.rotation[0]),
	);
	vec3.normalize(Camera.direction, Camera.direction);

	// movement
	let move = 0;
	let strafe = 0;

	Weapons.setIsMoving(false);
	if (Input.isDown(Settings.forward)) {
		move += _MOVEMENT_SPEED_MULTIPLIER;
		Weapons.setIsMoving(true);
	}
	if (Input.isDown(Settings.backwards)) {
		move -= _MOVEMENT_SPEED_MULTIPLIER;
		Weapons.setIsMoving(true);
	}
	if (Input.isDown(Settings.left)) {
		strafe -= _MOVEMENT_SPEED_MULTIPLIER;
		Weapons.setIsMoving(true);
	}
	if (Input.isDown(Settings.right)) {
		strafe += _MOVEMENT_SPEED_MULTIPLIER;
		Weapons.setIsMoving(true);
	}

	// calculate new position and view direction
	const v = vec3.clone(Camera.direction);
	v[1] = 0;
	vec3.rotateY(v, v, [0, 0, 0], glMatrix.toRadian(-90));
	vec3.normalize(v, v);
	move *= ft * Settings.moveSpeed;
	strafe *= ft * Settings.moveSpeed;
	Camera.position[0] =
		Camera.position[0] + Camera.direction[0] * move + v[0] * strafe;
	Camera.position[1] =
		Camera.position[1] + Camera.direction[1] * move + v[1] * strafe;
	Camera.position[2] =
		Camera.position[2] + Camera.direction[2] * move + v[2] * strafe;
});

// ============================================================================
// Initialization
// ============================================================================

_initializeEventListeners();
_initializeConsoleControls();

// ============================================================================
// Public API
// ============================================================================

// Controls module - auto-initializes, no exports needed
const Controls = {};

export default Controls;
