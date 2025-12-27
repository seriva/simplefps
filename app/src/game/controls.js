import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	Input,
	Physics,
	Settings,
	Utils,
} from "../engine/core/engine.js";
import State from "./state.js";
import Weapons from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _CAMERA_SENSITIVITY_DIVISOR = 33.0;
const _MAX_VERTICAL_ROTATION = 89;
const _MOVEMENT_SPEED_MULTIPLIER = 1.1;

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

	// calculate movement direction (full 3D for flying)
	const forwardDir = vec3.clone(Camera.direction);

	// get strafe direction (perpendicular, horizontal only)
	const horizontalForward = vec3.clone(Camera.direction);
	horizontalForward[1] = 0;
	vec3.normalize(horizontalForward, horizontalForward);
	const strafeDir = vec3.create();
	vec3.rotateY(strafeDir, horizontalForward, [0, 0, 0], glMatrix.toRadian(-90));

	// calculate velocity (forward includes Y, strafe is horizontal only)
	const speed = Settings.moveSpeed;
	const velX = (forwardDir[0] * move + strafeDir[0] * strafe) * speed;
	const velY = forwardDir[1] * move * speed;
	const velZ = (forwardDir[2] * move + strafeDir[2] * strafe) * speed;

	// Set velocity on physics body
	Physics.setPlayerVelocity(velX, velY, velZ);

	// Sync camera position from physics
	const physPos = Physics.getPlayerPosition();
	if (physPos[0] !== 0 || physPos[1] !== 0 || physPos[2] !== 0) {
		Camera.position[0] = physPos[0];
		Camera.position[1] = physPos[1];
		Camera.position[2] = physPos[2];
	}
});

// ============================================================================
// Initialization
// ============================================================================

_initializeEventListeners();
_initializeConsoleControls();
_initializeKeyboardControls();

// ============================================================================
// Public API
// ============================================================================

// Controls module - auto-initializes, no exports needed
const Controls = {};

export default Controls;
