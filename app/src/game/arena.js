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
} from "../engine/engine.js";
import Pickup from "./pickups.js";

const BASE_URL = `${window.location}resources/arenas/`;
const DEFAULT_POSITION = [0, 0, 0];
const DEFAULT_AMBIENT = [1, 1, 1];

const state = {
	arena: {},
};

// Core setup functions
const setupCamera = ({ position, rotation }) => {
	Camera.setPosition(position || DEFAULT_POSITION);
	Camera.setRotation(rotation || DEFAULT_POSITION);
};

const setupEnvironment = ({ skybox, chunks = [] }) => {
	if (skybox) {
		Scene.addEntities(new SkyboxEntity(skybox));
	}

	for (const chunk of chunks) {
		Scene.addEntities(new MeshEntity(DEFAULT_POSITION, chunk));
	}
};

const setupLighting = ({
	ambient,
	directional = [],
	point = [],
	spot = [],
}) => {
	Scene.setAmbient(ambient || DEFAULT_AMBIENT);

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

const setupPickups = (pickups = []) => {
	for (const { type, position } of pickups) {
		const pickup = Pickup.createPickup(type, position);
		if (pickup) {
			Scene.addEntities(pickup);
		}
	}
};

// Main load function
const load = async (name) => {
	Loading.toggle(true);

	try {
		const response = await Utils.fetch(`${BASE_URL}${name}/config.arena`);
		const arenaData = JSON.parse(response);

		if (!arenaData) {
			throw new Error("Invalid arena data");
		}

		state.arena = arenaData;
		Scene.init();

		const { spawnpoint, lighting, pickups } = state.arena;

		setupCamera(spawnpoint || {});
		setupLighting(lighting || {});
		setupEnvironment(state.arena);
		setupPickups(pickups);

		Console.log(`Loaded arena: ${name}`);
	} catch (error) {
		Console.log(`Failed to load arena ${name}: ${error.message}`);
		state.arena = {};
		throw error;
	} finally {
		Loading.toggle(false);
	}
};

const Arena = { load };

export default Arena;
