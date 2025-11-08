import Console from "./console.js";
import Loading from "./loading.js";
import Material from "./material.js";
import Mesh from "./mesh.js";
import Sound from "./sound.js";
import Texture from "./texture.js";
import Utils from "./utils.js";

// Constants
const RESOURCE_TYPES = {
	webp: (data) => new Texture({ data }),
	mesh: (data, context) => new Mesh(JSON.parse(data), context),
	bmesh: (data, context) => new Mesh(data, context),
	mat: (data, context) => {
		const matData = JSON.parse(data);
		// Create materials and store them directly
		let firstMaterial = null;

		for (const mat of matData.materials) {
			const material = new Material(mat, context);
			resources.set(mat.name, material);
			if (!firstMaterial) firstMaterial = material;
		}

		return firstMaterial; // Return first material so resources.set() works
	},
	sfx: (data) => new Sound(JSON.parse(data)),
	list: (data, _context) => Resources.load(JSON.parse(data).resources),
};

const resources = new Map();
const basepath = "resources/";
const fileExtRegex = /(?:\.([^.]+))?$/;

const Resources = {
	async load(paths) {
		if (!Array.isArray(paths)) return null;
		if (!paths.length) return Promise.resolve();

		const startTime = performance.now();
		Loading.toggle(true);

		try {
			// Create load promises for all resources
			const loadPromises = paths.map(async (path) => {
				if (resources.has(path)) return;

				const fullpath = basepath + path;
				const ext = fileExtRegex.exec(path)[1];
				const resourceHandler = RESOURCE_TYPES[ext];

				if (resourceHandler) {
					try {
						const response = await Utils.fetch(fullpath);
						const result = await Promise.resolve(
							resourceHandler(response, this),
						);
						if (result) resources.set(path, result);
						Console.log(`Loaded: ${path}`);
					} catch (err) {
						Console.error(`Error loading ${path}: ${err}`);
						throw err;
					}
				}
			});

			// Wait for all resources to load in parallel
			await Promise.all(loadPromises);
		} finally {
			Loading.toggle(false);
			const loadTime = performance.now() - startTime;
			Console.log(`Loaded resources in ${Math.round(loadTime)} ms`);
		}
	},

	get(key) {
		const resource = resources.get(key);
		if (!resource) {
			Console.error(`Resource "${key}" does not exist`);
			return null;
		}
		return resource;
	},
};

export default Resources;
