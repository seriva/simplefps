import {
	Camera,
	Console,
	DirectionalLightEntity,
	Loading,
	MeshEntity,
	Physics,
	PointLightEntity,
	Resources,
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

const _setupCollision = (chunks, _spawnPosition) => {
	// Create collision bodies for each map chunk
	for (const chunkPath of chunks) {
		try {
			const mesh = Resources.get(chunkPath);
			if (mesh?.vertices && mesh.indices) {
				Physics.addTrimesh(mesh.vertices, mesh.indices);
			}
		} catch (e) {
			Console.warn(`Failed to create collision for ${chunkPath}: ${e.message}`);
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

		// Lightmap is now handled per-material in Material class

		const { spawnpoint, spawnpoints, lighting, pickups } = _state.arena;

		let startSpawn = spawnpoint || {};
		if (spawnpoints && spawnpoints.length > 0) {
			const randomIndex = Math.floor(Math.random() * spawnpoints.length);
			startSpawn = spawnpoints[randomIndex];
			Console.log(
				`Selected spawn point ${randomIndex} from ${spawnpoints.length} available.`,
			);
		}

		_setupCamera(startSpawn);
		_setupLighting(lighting || {});
		_setupEnvironment(_state.arena);
		_setupPickups(pickups);
		_setupCollision(
			_state.arena.chunks || [],
			startSpawn.position || _DEFAULT_POSITION,
		);

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
	getSpawnPoint: () => {
		const { spawnpoint, spawnpoints } = _state.arena;
		return spawnpoint || (spawnpoints ? spawnpoints[0] : null) || {};
	},
};

export default Arena;
