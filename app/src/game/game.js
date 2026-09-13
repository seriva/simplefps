import { glMatrix, vec3 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	FPSController,
	Input,
	Settings,
} from "../engine/engine.js";
import { Arena } from "./arena.js";
import { WEAPON_INDEX } from "./gamedefs.js";
import { Pickup } from "./pickups.js";
import { Player } from "./player.js";
import { Projectiles } from "./projectiles.js";
import { State } from "./state.js";
import { Weapons } from "./weapons.js";

const _horizontalForward = vec3.create();
const _strafeDir = vec3.create();
const _origin = vec3.create();
const _defaultSpawn = [0, 0, 0];
const _STRAFE_ANGLE = glMatrix.toRadian(-90);

const FIXED_DT = 1 / 120;
const MAX_ACCUM = 0.1; // Matches the engine's 100ms frame cap
let _accum = 0;

let _controller = null;

const _onJump = () => {
	if (State.current !== "GAME" || Console.isVisible()) return;
	if (_controller) _controller.jump();
};

const Game = {
	init() {
		window.addEventListener("game:jump", _onJump);
		Pickup.setWeaponCallback((type) => {
			const idx = WEAPON_INDEX[type];
			if (idx !== undefined) Weapons.unlock(idx);
		});
		Pickup.setWeaponUnlockedCallback((idx) => Weapons.isUnlocked(idx));
	},

	dispose() {
		window.removeEventListener("game:jump", _onJump);
	},

	async load(mapName) {
		_accum = 0;
		await Arena.load(mapName);

		const spawnPoint = Arena.getSpawnPoint();
		const pos = spawnPoint.position || _defaultSpawn;

		_controller = new FPSController(pos, {
			onLand: Weapons.onLand,
			onJump: Weapons.onJump,
		});

		if (spawnPoint.rotation) {
			Camera.setRotation([0, glMatrix.toDegree(spawnPoint.rotation[1]), 0]);
		}

		Weapons.load();
		Player.reset();
		Weapons.reset();
		Projectiles.reset();
	},

	update(frameTime) {
		if (State.current !== "GAME" || Console.isVisible()) {
			_accum = 0;
			return;
		}

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

		// Fixed timestep physics step
		_accum = Math.min(_accum + ft, MAX_ACCUM);
		while (_accum >= FIXED_DT) {
			if (_controller) {
				_controller.update(FIXED_DT);
				_controller.move(
					strafe,
					move,
					_horizontalForward,
					_strafeDir,
					FIXED_DT,
				);
			}
			Projectiles.update(FIXED_DT);
			_accum -= FIXED_DT;
		}

		// Update camera smoothing and pickups
		if (_controller) {
			_controller.syncCamera(ft);

			// Check pickup collection
			Pickup.update(_controller.position);
		}
	},

	getController() {
		return _controller;
	},
};

export { Game };
