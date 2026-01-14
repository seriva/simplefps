import * as CANNON from "../dependencies/cannon-es.js";
import { mat4 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	DirectionalLightEntity,
	MeshEntity,
	Physics,
	Resources,
	Scene,
	SkinnedMeshEntity,
	SkyboxEntity,
	Utils,
} from "../engine/core/engine.js";
import Loading from "./loading.js";
import Pickup from "./pickups.js";

// ============================================================================
// Private
// ============================================================================

const _BASE_URL = `${window.location}resources/arenas/`;
const _DEFAULT_POSITION = [0, 0, 0];
const _DEFAULT_AMBIENT = [1, 1, 1];

// Raycast helpers
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _MAX_RAYCAST_DISTANCE = 500;

const _state = {
	arena: {},
	currentSpawnPoint: null,
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

const _setupLighting = async (lightGrid, directional, arenaName) => {
	// Load Light Grid (Base Lighting)
	if (lightGrid?.origin) {
		await Scene.loadLightGrid({ lightGrid, arenaName });
	}

	// Add directional light for dynamic object shading
	if (directional) {
		const light = new DirectionalLightEntity(
			directional.direction || [0.5, 1.0, 0.3],
			directional.color || [1.0, 1.0, 1.0],
			null, // updateCallback
		);
		Scene.addEntities(light);
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

// Raycast to find ground position
const _getGroundHeight = (x, y, z) => {
	_rayFrom.set(x, y + 100, z); // Start above
	_rayTo.set(x, y - _MAX_RAYCAST_DISTANCE, z);
	_rayResult.reset();

	Physics.getWorld().raycastClosest(_rayFrom, _rayTo, {}, _rayResult);

	if (_rayResult.hasHit) {
		return _rayResult.hitPointWorld.y;
	}
	return y; // Fallback to original height
};

// Setup player models at all spawnpoints except the current one
const _setupSpawnpointModels = (spawnpoints = [], currentSpawn = null) => {
	for (const spawn of spawnpoints) {
		// Skip the spawn point where the player spawns
		if (spawn === currentSpawn) continue;

		const pos = spawn.position || _DEFAULT_POSITION;

		// Raycast to attach to ground
		const groundY = _getGroundHeight(pos[0], pos[1], pos[2]);
		const modelPos = [pos[0], groundY, pos[2]];

		// Get yaw in degrees
		// const yawDegrees = spawn.rotation ? (spawn.rotation[1] * 180) / Math.PI : 0;

		const character = new SkinnedMeshEntity(
			modelPos,
			"models/robot/robot.sbmesh",
			null,
			0.035, // Scaled down for robot
		);
		character.castShadow = true;
		character.playAnimation("models/robot/robot.banim");

		// Build rotation: first yaw (Y), then stand upright (X -90)
		// This makes the model face the right direction THEN stand up
		mat4.rotateY(
			character.base_matrix,
			character.base_matrix,
			spawn.rotation ? spawn.rotation[1] : 0,
		);
		mat4.rotateX(
			character.base_matrix,
			character.base_matrix,
			(-90 * Math.PI) / 180,
		);

		// Now apply scale
		mat4.scale(character.base_matrix, character.base_matrix, [10, 10, 10]);

		Scene.addEntities(character);
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

		const { spawnpoint, spawnpoints, pickups } = _state.arena;

		let startSpawn = spawnpoint || {};
		if (spawnpoints && spawnpoints.length > 0) {
			const randomIndex = Math.floor(Math.random() * spawnpoints.length);
			startSpawn = spawnpoints[randomIndex];
			Console.log(
				`Selected spawn point ${randomIndex} from ${spawnpoints.length} available.`,
			);
		}

		_state.currentSpawnPoint = startSpawn;

		_setupCamera(startSpawn);
		// Pass the whole arena config to setupLighting because lightGrid is at root level or under lighting?
		// In bsp2map.js we wrote: { ..., lightGrid: { ... } } at root level.
		// So we need to pass arenaData.lightGrid.

		await _setupLighting(
			_state.arena.lightGrid,
			_state.arena.directional,
			name,
		);
		_setupEnvironment(_state.arena);
		_setupCollision(
			_state.arena.chunks || [],
			startSpawn.position || _DEFAULT_POSITION,
		);
		_setupPickups(pickups);
		_setupSpawnpointModels(spawnpoints || [], startSpawn);

		Console.log(`Loaded arena: ${name}`);
	} catch (error) {
		Console.log(`Failed to load arena ${name}: ${error.message}`);
		_state.arena = {};
		throw error;
	} finally {
		Loading.toggle(false);
	}
};

// ============================================================================
// Public API
// ============================================================================

const Arena = {
	load: _load,
	getSpawnPoint: () => {
		return _state.currentSpawnPoint || {};
	},
};

export default Arena;
