import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import Camera from "../engine/core/camera.js";
import Settings from "../engine/core/settings.js";
import Console from "../engine/systems/console.js";
import Input from "../engine/systems/input.js";
import FPSController from "./fpscontroller.js";
import State from "./state.js";
import Weapons from "./weapons.js";

const _horizontalForward = vec3.create();
const _strafeDir = vec3.create();
const _origin = vec3.create();
const _defaultSpawn = [0, 0, 0];

let _controller = null;

const Game = {
	init(spawnPoint = {}) {
		const pos = spawnPoint.position || _defaultSpawn;
		_controller = new FPSController(pos);
	},

	update(frameTime) {
		if (State.current !== "GAME" || Console.isVisible()) return;

		const ft = frameTime / 1000;

		// Look direction from mouse input
		const cursor = Input.cursorMovement();
		Camera.addRotation(
			cursor.y * Settings.lookSensitivity,
			-cursor.x * Settings.lookSensitivity,
		);

		// Movement input
		let strafe = 0;
		let move = 0;
		if (Input.isDown(Settings.forward)) move += 1;
		if (Input.isDown(Settings.backwards)) move -= 1;
		if (Input.isDown(Settings.left)) strafe -= 1;
		if (Input.isDown(Settings.right)) strafe += 1;

		// Set movement flag for weapon bobbing
		Weapons.setIsMoving(move !== 0 || strafe !== 0);

		// Get strafe direction (perpendicular to horizontal forward)
		vec3.copy(_horizontalForward, Camera.direction);
		_horizontalForward[1] = 0;
		vec3.normalize(_horizontalForward, _horizontalForward);
		vec3.rotateY(
			_strafeDir,
			_horizontalForward,
			_origin,
			glMatrix.toRadian(-90),
		);

		// Update FPS controller
		if (_controller) {
			_controller.update(ft);
			_controller.move(strafe, move, _horizontalForward, _strafeDir, ft);
		}
	},

	postPhysicsUpdate() {
		// Sync camera position from physics body
		if (_controller) {
			_controller.syncCamera();
		}
	},

	getController() {
		return _controller;
	},
};

export default Game;
