import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	Input,
	Resources,
	Settings,
	Utils,
} from "../engine/engine.js";
import State from "./state.js";
import Translations from "./translations.js";
import UI from "./ui.js";
import Update from "./update.js";
import Weapons from "./weapons.js";

const music = Resources.get("sounds/music.sfx");

UI.register("MAIN_MENU", {
	header: Translations.get("MAIN_MENU"),
	controls: [
		{
			text: Translations.get("CONTINUE_GAME"),
			callback: () => {
				Utils.dispatchCustomEvent("changestate", {
					state: "GAME",
				});
				music.resume();
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

// Group all event listeners together
const initializeEventListeners = () => {
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

// Separate console controls
const initializeConsoleControls = () => {
	Input.addKeyDownEvent(192, Console.toggle);
	Input.addKeyDownEvent(13, Console.executeCmd);
};

// Camera movement logic
const _updateCamera = (frameTime) => {
	const ft = frameTime / 1000;
	updateCameraRotation();
	updateCameraPosition(ft);
};

const updateCameraRotation = () => {
	const mpos = Input.cursorMovement();
	Camera.rotation[0] -= (mpos.x / 33.0) * Settings.lookSensitivity;
	Camera.rotation[1] += (mpos.y / 33.0) * Settings.lookSensitivity;

	// Clamp vertical rotation
	Camera.rotation[1] = Math.max(-89, Math.min(89, Camera.rotation[1]));

	// Wrap horizontal rotation
	Camera.rotation[0] = ((Camera.rotation[0] % 360) + 360) % 360;

	// Update camera direction
	updateCameraDirection();
};

Input.setUpdateCallback((frameTime) => {
	if (Console.isVisible() || State.current === "MENU") return;
	const ft = frameTime / 1000;

	// look
	const mpos = Input.cursorMovement();
	Camera.rotation[0] -= (mpos.x / 33.0) * Settings.lookSensitivity;
	Camera.rotation[1] += (mpos.y / 33.0) * Settings.lookSensitivity;
	if (Camera.rotation[1] > 89) {
		Camera.rotation[1] = 89;
	}
	if (Camera.rotation[1] < -89) {
		Camera.rotation[1] = -89;
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
		move += 5;
		Weapons.setIsMoving(true);
	}
	if (Input.isDown(Settings.backwards)) {
		move -= 5;
		Weapons.setIsMoving(true);
	}
	if (Input.isDown(Settings.left)) {
		strafe -= 5;
		Weapons.setIsMoving(true);
	}
	if (Input.isDown(Settings.right)) {
		strafe += 5;
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

// Initialize all controls when the module loads
initializeEventListeners();
initializeConsoleControls();
