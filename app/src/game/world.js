import {
	Camera,
	Console,
	Loading,
	MeshEntity,
	DirectionalLightEntity,
	Scene,
	SkyboxEntity,
	Utils,
} from "../engine/engine.js";
import Pickup from "./pickups.js";

const cellSize = 3;

const meshMap = new Map();
meshMap.set(128, "meshes/health.mesh");
meshMap.set(129, "meshes/armor.mesh");
meshMap.set(130, "meshes/ammo.mesh");
meshMap.set(150, "meshes/grenade_launcher.mesh");
meshMap.set(151, "meshes/minigun.mesh");

let mesh = "";
let skybox = 1;
let data = [];
let pickups = [];
let spawnPoint = {
	position: [0, 0, 0],
	rotation: [0, 0, 0],
};

let meshes = [];

const createSceneFromMapData = () => {
	// spawnpoint
	Camera.setPosition(spawnPoint.position);
	Camera.setRotation(spawnPoint.rotation);

	// skybox
	Scene.addEntities(new SkyboxEntity(skybox));

	// map
	for (const mesh of meshes) {
		Scene.addEntities(new MeshEntity([0, 0, 0], mesh));
	}

	Scene.addEntities(new DirectionalLightEntity([-0.6, 1, -0.7], [0.1, 0.1, 0.125]));
	Scene.addEntities(new DirectionalLightEntity([0.6, 1, 0.7], [0.1, 0.1, 0.135]));

	// add dynamic map entities
	for (const pickup of pickups) {
		Scene.addEntities(
			Pickup.createPickup(
				[(pickup[0] - 1) * cellSize, 0.6, (pickup[1] - 1) * cellSize],
				pickup[2],
				meshMap.get(pickup[2]),
			),
		);
	}
};

const load = async (name) => {
	Loading.toggle(true);
	data.length = 0;
	pickups.length = 0;
	Scene.init();

	const response = await Utils.fetch(
		`${window.location}resources/maps/${name}/${name}.map`,
	);
	const world = JSON.parse(response);

	Scene.setAmbient(world.ambient);

	spawnPoint = world.spawnpoint;
	skybox = world.skybox;
	meshes = world.meshes;
	pickups = world.pickups;
	
	createSceneFromMapData();
	Loading.toggle(false);
	Console.log(`Loaded: ${name}`);
};

const World = {
	load,
};

export { World as default };
