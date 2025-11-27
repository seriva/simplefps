import Camera from "./camera.js";
import Console from "./console.js";
import { Context } from "./context.js";
import DirectionalLightEntity from "./directionallightentity.js";
import { EntityTypes } from "./entity.js";
import FpsMeshEntity from "./fpsmeshentity.js";
import Input from "./input.js";
import Loading from "./loading.js";
import MeshEntity from "./meshentity.js";
import Physics from "./physics.js";
import PointLightEntity from "./pointlightentity.js";
import Renderer from "./renderer.js";
import Resources from "./resources.js";
import Scene from "./scene.js";
import Settings from "./settings.js";
import SkyboxEntity from "./skyboxentity.js";
import Sound from "./sound.js";
import SpotLightEntity from "./spotlightentity.js";
import Stats from "./stats.js";
import Utils from "./utils.js";

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
		Input.update(_frameTime);
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
