import Material from "../rendering/material.js";
import Mesh from "../rendering/mesh.js";
import Texture from "../rendering/texture.js";
import Utils from "../utils/utils.js";
import Console from "./console.js";
import Loading from "./loading.js";
import Sound from "./sound.js";

// Public Resources API
const Resources = {
	async load(paths) {
		if (!Array.isArray(paths)) return null;
		if (!paths.length) return Promise.resolve();

		const startTime = performance.now();
		Loading.toggle(true);

		try {
			// Create load promises for all resources
			const loadPromises = paths.map(async (path) => {
				if (_resources.has(path)) return;

				const fullpath = _basepath + path;
				const ext = _fileExtRegex.exec(path)[1];
				const resourceHandler = _RESOURCE_TYPES[ext];

				if (resourceHandler) {
					try {
						const response = await Utils.fetch(fullpath);
						const result = await Promise.resolve(
							resourceHandler(response, this),
						);
						if (result) _resources.set(path, result);
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
			// Console.log(`Loaded resources in ${Math.round(loadTime)} ms`);
		}
	},

	get(key) {
		const resource = _resources.get(key);
		if (!resource) {
			Console.error(`Resource "${key}" does not exist`);
			return null;
		}
		return resource;
	},
};

export default Resources;

// Private state
const _resources = new Map();
const _basepath = "resources/";
const _fileExtRegex = /(?:\.([^.]+))?$/;

// Private constants
const _RESOURCE_TYPES = {
	webp: (data) => new Texture({ data }),
	mesh: (data, context) => new Mesh(JSON.parse(data), context),
	bmesh: (data, context) => new Mesh(data, context),
	mat: (data, context) => {
		const matData = JSON.parse(data);
		// Create materials and store them directly
		let firstMaterial = null;

		for (const mat of matData.materials) {
			const material = new Material(mat, context);
			_resources.set(mat.name, material);
			if (!firstMaterial) firstMaterial = material;
		}

		return firstMaterial; // Return first material so resources.set() works
	},
	sfx: (data) => new Sound(JSON.parse(data)),
	list: (data, _context) => Resources.load(JSON.parse(data).resources),
};
