import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	Input,
	Settings,
	Utils,
} from "../engine/core/engine.js";
import Arena from "./arena.js";
import State from "./state.js";
import Weapons from "./weapons.js";

// ============================================================================
// Private
// ============================================================================

const _CAMERA_SENSITIVITY_DIVISOR = 33.0;
const _MAX_VERTICAL_ROTATION = 89;
const _MOVEMENT_SPEED_MULTIPLIER = 1.1;

const _horizontalForward = vec3.create();
const _strafeDir = vec3.create();
const _origin = [0, 0, 0];
let _cachedController = null;

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

	// Jump on spacebar
	window.addEventListener("keydown", (e) => {
		if (
			e.code === "Space" &&
			State.current === "GAME" &&
			!Console.isVisible()
		) {
			e.preventDefault();
			const controller = Arena.getController();
			if (controller) {
				controller.jump();
			}
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

	if (Input.isDown(Settings.forward)) {
		move += _MOVEMENT_SPEED_MULTIPLIER;
	}
	if (Input.isDown(Settings.backwards)) {
		move -= _MOVEMENT_SPEED_MULTIPLIER;
	}
	if (Input.isDown(Settings.left)) {
		strafe -= _MOVEMENT_SPEED_MULTIPLIER;
	}
	if (Input.isDown(Settings.right)) {
		strafe += _MOVEMENT_SPEED_MULTIPLIER;
	}

	// Set movement flag once after all checks
	Weapons.setIsMoving(move !== 0 || strafe !== 0);

	// Get strafe direction (perpendicular to horizontal forward)
	// Reuse pre-allocated vectors to avoid GC pressure
	vec3.copy(_horizontalForward, Camera.direction);
	_horizontalForward[1] = 0;
	vec3.normalize(_horizontalForward, _horizontalForward);
	vec3.rotateY(_strafeDir, _horizontalForward, _origin, glMatrix.toRadian(-90));

	// Update FPS controller (cache lookup to avoid repeated calls)
	_cachedController = Arena.getController();
	if (_cachedController) {
		_cachedController.update(ft);
		_cachedController.move(strafe, move, _horizontalForward, _strafeDir, ft);
		_cachedController.syncCamera();
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
