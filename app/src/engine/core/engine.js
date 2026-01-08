import { backendReady } from "../rendering/backend.js";
import Renderer from "../rendering/renderer.js";
import { Shaders } from "../rendering/shaders.js";
import Shapes from "../rendering/shapes.js";
import DirectionalLightEntity from "../scene/directionallightentity.js";
import { EntityTypes } from "../scene/entity.js";
import FpsMeshEntity from "../scene/fpsmeshentity.js";
import MeshEntity from "../scene/meshentity.js";
import PointLightEntity from "../scene/pointlightentity.js";
import Scene from "../scene/scene.js";
import SkyboxEntity from "../scene/skyboxentity.js";
import SpotLightEntity from "../scene/spotlightentity.js";
import Console from "../systems/console.js";
import Input from "../systems/input.js";
import Physics from "../systems/physics.js";
import Resources from "../systems/resources.js";
import Sound from "../systems/sound.js";
import Stats from "../systems/stats.js";
import Utils from "../utils/utils.js";
import Camera from "./camera.js";
import Settings from "./settings.js";

// ============================================================================
// Private
// ============================================================================

let _gameUpdate;
let _gameUpdateBacking;
let _gamePostPhysics;
let _time;
let _frameTime = 0;
let _rafId;

const _frame = () => {
	// timing
	const now = performance.now();
	_frameTime = now - (_time || now);
	_time = now;

	Stats.update();
	Input.update();
	if (_gameUpdate) _gameUpdate(_frameTime);
	Physics.update(_frameTime / 1000);
	if (_gamePostPhysics) _gamePostPhysics();
	Camera.update();
	Scene.update(_frameTime);
	Renderer.render();

	_rafId = window.requestAnimationFrame(_frame);
};

const pause = (paused) => {
	Physics.pause(paused);
	Scene.pause(paused);
	// Also pause game updates if provided via setGameLoop
	if (paused) {
		_gameUpdate = null;
	} else if (_gameUpdateBacking) {
		_gameUpdate = _gameUpdateBacking;
	}
};

const start = () => {
	if (!_rafId) {
		Input.resetDelta();
		_time = null;
		_rafId = window.requestAnimationFrame(_frame);
	}
};

const init = async (config = {}) => {
	await backendReady;

	// Initialize built-in resources (solid color textures)
	Resources.init();
	Shaders.init();
	Shapes.init();
	Utils.dispatchEvent("resize");

	// Load resources if provided
	if (config.resources) {
		await Resources.load(config.resources);
	}
};

const setGameLoop = (update, postPhysics) => {
	_gameUpdate = update;
	_gameUpdateBacking = update;
	_gamePostPhysics = postPhysics;
};

export {
	init,
	start,
	pause,
	setGameLoop,
	Console,
	Settings,
	Utils,
	Stats,
	Input,
	Physics,
	Resources,
	Camera,
	Renderer,
	Scene,
	EntityTypes,
	Sound,
	MeshEntity,
	FpsMeshEntity,
	DirectionalLightEntity,
	PointLightEntity,
	SpotLightEntity,
	SkyboxEntity,
};
