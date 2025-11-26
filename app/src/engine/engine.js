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

let time;
let frameTime = 0;
let rafId;

const loop = () => {
	const frame = () => {
		// timing
		const now = performance.now();
		frameTime = now - (time || now);
		time = now;

		Stats.update();
		Input.update(frameTime);
		Camera.update();
		Scene.update(frameTime);
		Renderer.render();

		rafId = window.requestAnimationFrame(frame);
	};

	rafId = window.requestAnimationFrame(frame);
	return () => cancelAnimationFrame(rafId);
};

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
