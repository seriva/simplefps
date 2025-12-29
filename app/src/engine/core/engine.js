import Game from "../../game/game.js";
import DirectionalLightEntity from "../entities/directionallightentity.js";
import { EntityTypes } from "../entities/entity.js";
import FpsMeshEntity from "../entities/fpsmeshentity.js";
import MeshEntity from "../entities/meshentity.js";
import PointLightEntity from "../entities/pointlightentity.js";
import SkyboxEntity from "../entities/skyboxentity.js";
import SpotLightEntity from "../entities/spotlightentity.js";
import Renderer from "../rendering/renderer.js";
import Console from "../systems/console.js";
import Input from "../systems/input.js";
import Loading from "../systems/loading.js";
import Physics from "../systems/physics.js";
import Resources from "../systems/resources.js";
import Sound from "../systems/sound.js";
import Stats from "../systems/stats.js";
import Utils from "../utils/utils.js";
import Camera from "./camera.js";
import { Context } from "./context.js";
import Scene from "./scene.js";
import Settings from "./settings.js";

// ============================================================================
// Private
// ============================================================================

let _time;
let _frameTime = 0;
let _rafId;

const _loop = () => {
	const frame = () => {
		// timing
		const now = performance.now();
		_frameTime = now - (_time || now);
		_time = now;

		Stats.update();
		Input.update();
		Game.update(_frameTime);
		Physics.update();
		Game.postPhysicsUpdate();
		Camera.update();
		Scene.update(_frameTime);
		Renderer.render();

		_rafId = window.requestAnimationFrame(frame);
	};

	_rafId = window.requestAnimationFrame(frame);
	return () => cancelAnimationFrame(_rafId);
};

// ============================================================================
// Public API
// ============================================================================

const loop = _loop;

export {
	loop,
	Console,
	Settings,
	Utils,
	Loading,
	Stats,
	Input,
	Physics,
	Resources,
	Camera,
	Context,
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
