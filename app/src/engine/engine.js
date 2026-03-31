// biome-ignore assist/source/organizeImports: exports grouped by category for readability
import { Animation } from "./animation/animation.js";
import { AnimationPlayer } from "./animation/animationplayer.js";
import { FPSController } from "./physics/fpscontroller.js";
import { RAY_MODES, Ray, RaycastResult } from "./physics/ray.js";
import { NETWORK_MESSAGES, Network } from "./systems/network.js";
import { Trimesh } from "./physics/trimesh.js";
import { Backend, backendReady } from "./rendering/backend.js";
import { Renderer } from "./rendering/renderer.js";
import { Shaders } from "./rendering/shaders.js";
import { Shapes } from "./rendering/shapes.js";
import { AnimatedBillboardEntity } from "./scene/animatedbillboardentity.js";
import { DirectionalLightEntity } from "./scene/directionallightentity.js";
import { EntityTypes } from "./scene/entity.js";
import { FpsMeshEntity } from "./scene/fpsmeshentity.js";
import { MeshEntity } from "./scene/meshentity.js";
import { ParticleEmitterEntity } from "./scene/particleemitterentity.js";
import { PointLightEntity } from "./scene/pointlightentity.js";
import { Scene } from "./scene/scene.js";
import { SkinnedMeshEntity } from "./scene/skinnedmeshentity.js";
import { SkyboxEntity } from "./scene/skyboxentity.js";
import { SpotLightEntity } from "./scene/spotlightentity.js";
import { Camera } from "./systems/camera.js";
import { Console } from "./systems/console.js";
import { Input } from "./systems/input.js";
import { Resources } from "./systems/resources.js";
import { Settings } from "./systems/settings.js";
import { Sound } from "./systems/sound.js";
import { Stats } from "./systems/stats.js";

// ============================================================================
// Private
// ============================================================================

let _gameUpdate;
let _paused = false;

let _alwaysUpdate; // Runs even when paused (for multiplayer)
let _time;
let _frameTime = 0;
let _rafId;

const resize = () => {
	Backend.resize();
	Camera.updateProjection();
	Renderer.resize();
};

window.addEventListener("resize", resize, false);

// Console command for render scale
Console.registerCmd("rscale", (scale) => {
	Settings.renderScale = Math.min(Math.max(scale, 0.2), 1);
	resize();
});

const _frame = () => {
	const now = performance.now();

	// timing
	_frameTime = now - (_time || now);
	_time = now;

	Stats.update();
	Input.update();
	if (_alwaysUpdate) _alwaysUpdate(_frameTime); // Runs even when paused
	if (!_paused && _gameUpdate) _gameUpdate(_frameTime);

	Camera.update();
	Scene.update(_frameTime);
	Renderer.render();

	_rafId = window.requestAnimationFrame(_frame);
};

const pause = (paused) => {
	_paused = paused;
	Scene.pause(paused);
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
	Resources.init();
	Shaders.init();
	Shapes.init();
	resize();

	if (config.resources) {
		await Resources.load(config.resources);
	}
};

const setCallbacks = (update, alwaysUpdate = null) => {
	_gameUpdate = update;
	_alwaysUpdate = alwaysUpdate;
};

const getCanvas = () => Backend.getCanvas?.();
const getAspectRatio = () => Backend.getAspectRatio?.();

// biome-ignore format: grouped by category for readability
export {
	// Engine lifecycle
	init,
	start,
	pause,
	resize,
	getCanvas,
	getAspectRatio,
	setCallbacks,

	// Systems
	Camera,
	Console,
	Input,
	Renderer,
	Resources,
	Scene,
	Settings,
	Sound,
	Stats,

	// Entities
	EntityTypes,
	AnimatedBillboardEntity,
	DirectionalLightEntity,
	FpsMeshEntity,
	MeshEntity,
	ParticleEmitterEntity,
	PointLightEntity,
	SkinnedMeshEntity,
	SkyboxEntity,
	SpotLightEntity,

	// Animation
	Animation,
	AnimationPlayer,

	// Physics
	FPSController,
	RAY_MODES,
	Ray,
	RaycastResult,
	Trimesh,

	// Networking
	Network,
	NETWORK_MESSAGES,
};
