import {
	Camera,
	Console,
	DirectionalLightEntity,
	Loading,
	MeshEntity,
	PointLightEntity,
	Scene,
	SkyboxEntity,
	SpotLightEntity,
	Utils,
} from "../engine/core/engine.js";
import Pickup from "./pickups.js";

// ============================================================================
// Private
// ============================================================================

const _BASE_URL = `${window.location}resources/arenas/`;
const _DEFAULT_POSITION = [0, 0, 0];
const _DEFAULT_AMBIENT = [1, 1, 1];

const _state = {
	arena: {},
};

const _setupCamera = ({ position, rotation }) => {
	Camera.setPosition(position || _DEFAULT_POSITION);
	Camera.setRotation(rotation || _DEFAULT_POSITION);
};

const _setupEnvironment = ({ skybox, chunks = [] }) => {
	if (skybox) {
		Scene.addEntities(new SkyboxEntity(skybox));
	}

	for (const chunk of chunks) {
		Scene.addEntities(new MeshEntity(_DEFAULT_POSITION, chunk));
	}
};

const _setupLighting = ({
	ambient,
	directional = [],
	point = [],
	spot = [],
}) => {
	Scene.setAmbient(ambient || _DEFAULT_AMBIENT);

	for (const { direction, color } of directional) {
		Scene.addEntities(new DirectionalLightEntity(direction, color));
	}

	for (const { position, size, color, intensity } of point) {
		Scene.addEntities(new PointLightEntity(position, size, color, intensity));
	}

	for (const { position, direction, color, intensity, angle, range } of spot) {
		Scene.addEntities(
			new SpotLightEntity(position, direction, color, intensity, angle, range),
		);
	}
};

const _setupPickups = (pickups = []) => {
	for (const { type, position } of pickups) {
		const pickup = Pickup.createPickup(type, position);
		if (pickup) {
			Scene.addEntities(pickup);
		}
	}
};

const _load = async (name) => {
	Loading.toggle(true);

	try {
		const response = await Utils.fetch(`${_BASE_URL}${name}/config.arena`);
		const arenaData = JSON.parse(response);

		if (!arenaData) {
			throw new Error("Invalid arena data");
		}

		_state.arena = arenaData;
		Scene.init();

		const { spawnpoint, lighting, pickups } = _state.arena;

		_setupCamera(spawnpoint || {});
		_setupLighting(lighting || {});
		_setupEnvironment(_state.arena);
		_setupPickups(pickups);

		Console.log(`Loaded arena: ${name}`);
	} catch (error) {
		Console.log(`Failed to load arena ${name}: ${error.message}`);
		_state.arena = {};
		throw error;
	}
};

// ============================================================================
// Public API
// ============================================================================

const Arena = {
	load: _load,
};

export default Arena;
