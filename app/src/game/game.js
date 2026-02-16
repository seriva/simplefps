import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Input, Settings } from "../engine/engine.js";
import FPSController from "../engine/physics/fpscontroller.js";
import Arena from "./arena.js";
import State from "./state.js";
import Weapons from "./weapons.js";

const _horizontalForward = vec3.create();
const _strafeDir = vec3.create();
const _origin = vec3.create();
const _defaultSpawn = [0, 0, 0];
const _STRAFE_ANGLE = glMatrix.toRadian(-90);

let _controller = null;

const Game = {
	async load(mapName) {
		await Arena.load(mapName);

		const spawnPoint = Arena.getSpawnPoint();
		const pos = spawnPoint.position || _defaultSpawn;

		_controller = new FPSController(pos, {
			onLand: Weapons.onLand,
			onJump: Weapons.onJump,
		});

		if (spawnPoint.rotation) {
			const yawRadians = spawnPoint.rotation[1];
			const yawDegrees = yawRadians * (180 / Math.PI);
			Camera.setRotation([0, yawDegrees, 0]);
		}

		Weapons.load();
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

		if (_controller) {
			Weapons.setIsGrounded(_controller.isGrounded());
		}

		// Get strafe direction (perpendicular to horizontal forward)
		vec3.copy(_horizontalForward, Camera.direction);
		_horizontalForward[1] = 0;
		vec3.normalize(_horizontalForward, _horizontalForward);
		vec3.rotateY(_strafeDir, _horizontalForward, _origin, _STRAFE_ANGLE);

		// Update FPS controller
		if (_controller) {
			_controller.update(ft);
			_controller.move(strafe, move, _horizontalForward, _strafeDir, ft);
			_controller.syncCamera(ft);
		}
	},

	getController() {
		return _controller;
	},
};

export default Game;
