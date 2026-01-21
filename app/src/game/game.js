import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import { Camera, Console, Input, Settings } from "../engine/core/engine.js";
import Arena from "./arena.js";
import FPSController from "./fpscontroller.js";
import Multiplayer from "./multiplayer.js";
import State from "./state.js";
import Weapons from "./weapons.js";

const _horizontalForward = vec3.create();
const _strafeDir = vec3.create();
const _origin = vec3.create();
const _defaultSpawn = [0, 0, 0];

let _controller = null;

const Game = {
	async load(mapName) {
		await Arena.load(mapName);

		// Initialize Multiplayer (starts Local Server)
		await Multiplayer.init(mapName);

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

		// Multiplayer Update (Server + Remote Players)
		Multiplayer.update(ft);

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

			// Send Input to Server
			const inputState = _controller.getInputState(
				strafe,
				move,
				_horizontalForward,
				_strafeDir,
			);

			// Add other inputs (jump, shoot)
			// Shoot is handled by Weapons, but should be networked eventually.
			// Jump:
			// inputState.jump = Input.isPressed(Settings.jump); // FPSController handles jump internally?
			// Actually FPSController has a jump() method. The input state above sends 'jump: false'.
			// If we want to network jump, we need to capture the event "Jump Pressed" and send it.
			// For now, movement sync is priority.

			inputState.yaw = Camera.rotation[1]; // Send visual rotation
			inputState.pitch = Camera.rotation[0];

			Multiplayer.sendInput(inputState);
		}
	},

	postPhysicsUpdate(frameTime) {
		// Sync camera position from physics body
		if (_controller) {
			_controller.syncCamera(frameTime / 1000);
		}
	},

	getController() {
		return _controller;
	},
};

Console.registerCmd("host", () => {
	Multiplayer.host();
});

Console.registerCmd("join", (id) => {
	if (!id) {
		Console.log("Usage: join <hostId>");
		return;
	}
	Multiplayer.join(id);
});

export default Game;
