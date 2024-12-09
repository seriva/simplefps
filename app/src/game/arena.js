import {
	Camera,
	Console,
	PointLightEntity,
	DirectionalLightEntity,
	Loading,
	MeshEntity,
	Scene,
	SkyboxEntity,
	Utils,
} from "../engine/engine.js";
import Pickup from "./pickups.js";

let arena = {}

const load = async (name) => {
	Loading.toggle(true);
	arena = {}
	Scene.init();

	const response = await Utils.fetch(
		`${window.location}resources/arenas/${name}/config.arena`,
	);
	arena = JSON.parse(response);

	// spawnpoint
	Camera.setPosition(arena.spawnpoint.position);
	Camera.setRotation(arena.spawnpoint.rotation);

	// skybox
	Scene.addEntities(new SkyboxEntity(arena.skybox));

	// chunks
	for (const chunk of arena.chunks) {
		Scene.addEntities(new MeshEntity([0, 0, 0], chunk));
	}

	// lighting
	Scene.setAmbient(arena.lighting.ambient);
	for (const light of arena.lighting.directional) {
		Scene.addEntities(new DirectionalLightEntity(light.direction, light.color));
	}
	for (const light of arena.lighting.point) {
		Scene.addEntities(new PointLightEntity(light.position, light.size,light.color));
	}

	// pickups
	for (const pickup of arena.pickups) {
		Scene.addEntities(
			Pickup.createPickup(
				pickup.type,
				pickup.position
			),
		);
	}

	Loading.toggle(false);
	Console.log(`Loaded arena: ${name}`);
};

const Arena = {
	load,
};

export { Arena as default };
