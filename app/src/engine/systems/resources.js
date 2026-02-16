import Animation from "../animation/animation.js";
import Utils from "../core/utils.js";
import Material from "../rendering/material.js";
import Mesh from "../rendering/mesh.js";
import SkinnedMesh from "../rendering/skinnedmesh.js";
import Texture from "../rendering/texture.js";
import Console from "./console.js";
import Sound from "./sound.js";

// ============================================================================
// Private state
// ============================================================================

const _resources = new Map();
const _loadingPromises = new Map();
const _basepath = "resources/";
const _fileExtRegex = /(?:\.([^.]+))?$/;

// Private constants
const _RESOURCE_TYPES = {
	webp: (data) => new Texture({ data }),
	mesh: (data, context) => {
		const mesh = new Mesh(JSON.parse(data), context);
		return mesh.ready.then(() => mesh);
	},
	smesh: (data, context) => {
		const mesh = new SkinnedMesh(JSON.parse(data), context);
		return mesh.ready.then(() => mesh);
	},
	bmesh: (data, context) => {
		const mesh = new Mesh(data, context);
		return mesh.ready.then(() => mesh);
	},
	sbmesh: (data, context) => {
		const mesh = new SkinnedMesh(data, context);
		return mesh.ready.then(() => mesh);
	},
	anim: (data) => {
		const anim = new Animation(JSON.parse(data));
		return anim.ready.then(() => anim);
	},
	banim: (data) => {
		const anim = new Animation(data);
		return anim.ready.then(() => anim);
	},
	mat: (data, context) => Material.loadLibrary(JSON.parse(data), context),
	sfx: (data) => new Sound(JSON.parse(data)),
	list: (data, _context) => Resources.load(JSON.parse(data).resources),
	bin: (data) => data.arrayBuffer(),
};

// ============================================================================
// Public Resources API
// ============================================================================

const Resources = {
	// Callbacks for load lifecycle (set by game layer)
	onLoadStart: null,
	onLoadEnd: null,

	init() {
		// Register built-in solid color textures
		_resources.set("black", Texture.createSolidColor(0, 0, 0, 255));
		_resources.set("white", Texture.createSolidColor(255, 255, 255, 255));
	},

	async load(paths) {
		if (!Array.isArray(paths)) return null;
		if (!paths.length) return Promise.resolve();

		Resources.onLoadStart?.();

		try {
			// Create load promises for all resources
			const loadPromises = paths.map(async (path) => {
				if (_resources.has(path)) return;

				if (_loadingPromises.has(path)) {
					return _loadingPromises.get(path);
				}

				const loadPromise = (async () => {
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
							Console.log(`[Resources] Loaded: ${path}`);
						} catch (err) {
							Console.error(`Error loading ${path}: ${err}`);
							throw err;
						}
					}
				})();

				_loadingPromises.set(path, loadPromise);

				try {
					await loadPromise;
				} finally {
					_loadingPromises.delete(path);
				}
			});

			// Wait for all resources to load in parallel
			await Promise.all(loadPromises);
		} finally {
			Resources.onLoadEnd?.();
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

	has(key) {
		return _resources.has(key);
	},

	register(key, resource) {
		_resources.set(key, resource);
	},
};

export default Resources;
