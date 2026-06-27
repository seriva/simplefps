import { Animation } from "../animation/animation.js";
import { Material } from "../rendering/material.js";
import { Mesh } from "../rendering/mesh.js";
import { SkinnedMesh } from "../rendering/skinnedmesh.js";
import { Texture } from "../rendering/texture.js";
import { Console } from "./console.js";
import { Sound } from "./sound.js";

// ============================================================================
// Private state
// ============================================================================

const _resources = new Map();
const _loadingPromises = new Map();
const _loadingLists = new Set();
const _basepath = "resources/";
const _fileExtRegex = /(?:\.([^.]+))?$/;
const _resourceTypes = {
	webp: (data, _ctx, opts) => new Texture({ data, ...opts }),
	mesh: (data, ctx) => {
		const m = new Mesh(JSON.parse(data), ctx);
		return m.ready.then(() => m);
	},
	smesh: (data, ctx) => {
		const m = new SkinnedMesh(JSON.parse(data), ctx);
		return m.ready.then(() => m);
	},
	bmesh: (data, ctx) => {
		const m = new Mesh(data, ctx);
		return m.ready.then(() => m);
	},
	sbmesh: (data, ctx) => {
		const m = new SkinnedMesh(data, ctx);
		return m.ready.then(() => m);
	},
	anim: (data) => {
		const a = new Animation(JSON.parse(data));
		return a.ready.then(() => a);
	},
	banim: (data) => {
		const a = new Animation(data);
		return a.ready.then(() => a);
	},
	mat: (data, ctx) => Material.loadLibrary(JSON.parse(data), ctx),
	sfx: (data) => new Sound(JSON.parse(data)),
	bin: (data) => data,
	// list defined after Resources so it can reference Resources.load
	list: null, // assigned below — needs Resources.load which isn't defined yet
};

// ============================================================================
// Public Resources API
// ============================================================================

const Resources = {
	// Callbacks for load lifecycle (set by game layer)
	onLoadStart: null,
	onLoadEnd: null,

	init() {
		_resources.set("black", Texture.createSolidColor(0, 0, 0, 255));
		_resources.set("white", Texture.createSolidColor(255, 255, 255, 255));
	},

	async load(paths) {
		if (!Array.isArray(paths)) return null;
		if (!paths.length) return Promise.resolve();

		Resources.onLoadStart?.();

		try {
			// Create load promises for all resources
			const loadPromises = paths.map(async (pathOrItem) => {
				const path =
					typeof pathOrItem === "string" ? pathOrItem : pathOrItem.path;
				const options =
					typeof pathOrItem === "string" ? {} : pathOrItem.options;

				if (_resources.has(path)) return;

				if (_loadingPromises.has(path)) {
					return _loadingPromises.get(path);
				}

				const loadPromise = (async () => {
					const fullpath = _basepath + path;
					const ext = _fileExtRegex.exec(path)?.[1];
					const resourceHandler = ext && _resourceTypes[ext];

					if (resourceHandler) {
						try {
							const response = await Resources.fetch(fullpath);
							const result = await Promise.resolve(
								resourceHandler(response, this, options, path),
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

	registerType(ext, handler) {
		_resourceTypes[ext] = handler;
	},

	has(key) {
		return _resources.has(key);
	},

	register(key, resource) {
		_resources.set(key, resource);
	},

	async fetch(path) {
		const response = await fetch(path).catch((error) => {
			Console.error(`Fetch error for ${path}:`, error);
			throw error;
		});

		if (!response?.ok) {
			throw new Error(`HTTP error! status: ${response.status} for ${path}`);
		}

		if (/\.(webp)$/.test(path)) {
			return await response.blob();
		} else if (/\.(bmesh|sbmesh|banim|bin)$/.test(path)) {
			return await response.arrayBuffer();
		} else {
			return await response.text();
		}
	},
};

_resourceTypes.list = (data, _ctx, _opts, path) => {
	if (_loadingLists.has(path)) {
		Console.warn(`[Resources] Circular list reference detected: ${path}`);
		return Promise.resolve();
	}
	_loadingLists.add(path);
	return Resources.load(JSON.parse(data).resources).finally(() =>
		_loadingLists.delete(path),
	);
};

export { Resources };
