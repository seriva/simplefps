import { mat4 } from "../dependencies/gl-matrix.js";
import {
	Camera,
	Console,
	DirectionalLightEntity,
	MeshEntity,
	Scene,
	SkinnedMeshEntity,
	SkyboxEntity,
	Trimesh,
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
		const entity = new MeshEntity(_DEFAULT_POSITION, chunk);
		entity.isOccluder = true; // The arena geometry occludes other objects

		// Create collision mesh for this chunk
		try {
			// MeshEntity loads model in constructor but resource might not be ready if async?
			// MeshEntity constructor uses Resources.get(url). If url is string, it assumes loaded?
			// Actually Resources.load was called before _load checks logic?
			// Arena._load uses Utils.fetch for config, then ... Resources logic?
			// Wait, MeshEntity logic: `this.mesh = typeof mesh === "string" ? Resources.get(mesh) : mesh;`
			// So resources must be loaded.
			// However, in _load, we don't explicitly wait for chunks?
			// Actually Loading.toggle(true) suggest we might wait?
			// But Resources.get() returns null if not loaded.

			// Let's check if the mesh data is available.
			if (entity.mesh) {
				const mesh = entity.mesh; // 'mesh' property of MeshEntity
				// We need raw vertices/indices for Trimesh
				if (mesh.vertices && mesh.indices) {
					// Flatten indices from all material groups
					const flattenedIndices = [];
					for (const group of mesh.indices) {
						for (let k = 0; k < group.array.length; k++) {
							flattenedIndices.push(group.array[k]);
						}
					}
					entity.collider = new Trimesh(mesh.vertices, flattenedIndices);
				}
			}
		} catch (e) {
			Console.warn(
				`Failed to create collider for chunk ${chunk}: ${e.message}`,
			);
		}

		Scene.addEntities(entity);
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
	const result = Scene.raycast(x, y + 100, z, x, y - _MAX_RAYCAST_DISTANCE, z);
	return result.hasHit ? result.hitPointWorld[1] : y;
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
				`[Arena] Selected spawn point ${randomIndex} from ${spawnpoints.length} available.`,
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

		_setupPickups(pickups);
		_setupSpawnpointModels(spawnpoints || [], startSpawn);

		Console.log(`[Arena] Loaded arena: ${name}`);
	} catch (error) {
		Console.log(`[Arena] Failed to load arena ${name}: ${error.message}`);
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
