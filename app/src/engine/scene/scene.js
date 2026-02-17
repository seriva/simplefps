import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Ray, RaycastResult } from "../physics/ray.js";
import { Trimesh } from "../physics/trimesh.js";
import Console from "../systems/console.js";
import { EntityTypes } from "./entity.js";
import LightGrid from "./lightgrid.js";

// ============================================================================
// Private constants
// ============================================================================

const _DEFAULT_AMBIENT = [0.5, 0.5, 0.5];
const _BLACK = [0, 0, 0];

const _VISIBILITY_CACHE_TYPES = [
	EntityTypes.SKYBOX,
	EntityTypes.MESH,
	EntityTypes.SKINNED_MESH,
	EntityTypes.FPS_MESH,
	EntityTypes.DIRECTIONAL_LIGHT,
	EntityTypes.POINT_LIGHT,
	EntityTypes.SPOT_LIGHT,
];

const _DEFAULT_RAY_OPTIONS = {
	skipBackfaces: true,
	collisionFilterMask: 1, // Default to WORLD
	collisionFilterGroup: -1,
};

// ============================================================================
// Private state
// ============================================================================

let _entities = [];
const _collidables = [];
let _ambient = _DEFAULT_AMBIENT;
let _pauseUpdate = false;

// Static trimesh for merged static geometry
let _staticTrimesh = null;
const _staticCollidable = {
	collider: null,
	base_matrix: mat4.create(), // Identity — vertices are already in world space
};

// Shared raycast state
const _rayFrom = vec3.create();
const _rayTo = vec3.create();
const _rayResult = new RaycastResult();
const _ray = new Ray();

const _visibilityCache = {
	[EntityTypes.SKYBOX]: [],
	[EntityTypes.MESH]: [],
	[EntityTypes.SKINNED_MESH]: [],
	[EntityTypes.FPS_MESH]: [],
	[EntityTypes.DIRECTIONAL_LIGHT]: [],
	[EntityTypes.POINT_LIGHT]: [],
	[EntityTypes.SPOT_LIGHT]: [],
};

// Private entity cache
const _entityCache = new Map();

// ============================================================================
// Private functions
// ============================================================================

const _getEntities = (type) => {
	if (_entityCache.has(type)) return _entityCache.get(type);

	const selection = [];
	for (let i = 0; i < _entities.length; i++) {
		if (_entities[i].type === type) selection.push(_entities[i]);
	}

	_entityCache.set(type, selection);
	return selection;
};

const _addEntities = (e) => {
	if (!e) {
		Console.warn("Attempted to add null/undefined entity");
		return;
	}

	_entityCache.clear();
	if (Array.isArray(e)) {
		const newEntities = e.filter((entity) => entity != null);
		_entities = _entities.concat(newEntities);
		for (const entity of newEntities) {
			if (entity.collider) _collidables.push(entity);
		}
	} else {
		_entities.push(e);
		if (e.collider) _collidables.push(e);
	}
};

const _removeEntity = (entity) => {
	if (!entity) return;

	const index = _entities.indexOf(entity);
	if (index !== -1) {
		_entities.splice(index, 1);
		_entityCache.clear();

		// Remove from collidables
		const colIndex = _collidables.indexOf(entity);
		if (colIndex !== -1) {
			_collidables.splice(colIndex, 1);
		}

		// Dispose entity resources
		entity.dispose?.();
	}
};

const _init = () => {
	_entities.length = 0;
	_collidables.length = 0;
	_staticTrimesh = null;
	_staticCollidable.collider = null;
};

const _dispose = () => {
	// Dispose all entities and clean up resources
	for (const entity of _entities) {
		entity.dispose?.();
	}
	_entities.length = 0;
	_collidables.length = 0;
	_entityCache.clear();
	_ambient = _DEFAULT_AMBIENT;
	_pauseUpdate = false;

	// Reset static trimesh
	if (_staticTrimesh) {
		_staticTrimesh.dispose();
		_staticTrimesh = null;
	}
	_staticCollidable.collider = null;

	// Reset visibility cache
	for (let i = 0; i < _VISIBILITY_CACHE_TYPES.length; i++) {
		const type = _VISIBILITY_CACHE_TYPES[i];
		_visibilityCache[type].length = 0;
	}
};

const _getAmbient = (position = null, outColor = null) => {
	if (LightGrid.hasData) {
		if (position) return LightGrid.getAmbient(position, outColor);
		if (outColor) {
			vec3.set(outColor, 0, 0, 0);
			return outColor;
		}
		return _BLACK;
	}
	if (outColor) {
		vec3.copy(outColor, _ambient);
		return outColor;
	}
	return _ambient;
};

const _setAmbient = (a) => {
	_ambient = a;
};

const _loadLightGrid = (config) => {
	return LightGrid.load(config);
};

const _addStaticMesh = (vertices, indices) => {
	if (!_staticTrimesh) {
		_staticTrimesh = new Trimesh();
		_staticCollidable.collider = _staticTrimesh;
		_collidables.push(_staticCollidable);
	}
	_staticTrimesh.addMesh(vertices, indices);
};

const _finalizeStaticMesh = () => {
	if (!_staticTrimesh) return;
	_staticTrimesh.finalize();
	const triCount = _staticTrimesh.indices.length / 3;
	Console.log(`[Scene] Static trimesh finalized: ${triCount} triangles`);
};

const _pause = (doPause) => {
	_pauseUpdate = doPause;
};

const _update = (frameTime) => {
	if (_pauseUpdate) return;

	// Track entities to remove
	let entitiesToRemove = null;

	for (let i = 0; i < _entities.length; i++) {
		const entity = _entities[i];
		const result = entity.update(frameTime);
		// If update returns false, mark for removal
		if (result === false) {
			if (!entitiesToRemove) entitiesToRemove = new Set();
			entitiesToRemove.add(entity);
		}
	}

	// Batch remove entities - O(n) instead of O(n²)
	if (entitiesToRemove) {
		_entities = _entities.filter((e) => !entitiesToRemove.has(e));
		_entityCache.clear();
		for (const entity of entitiesToRemove) {
			entity.dispose?.();
		}
	}

	_updateVisibility();
};

const _updateVisibility = () => {
	_entityCache.clear();

	// Reset visibility lists
	for (let i = 0; i < _VISIBILITY_CACHE_TYPES.length; i++) {
		const type = _VISIBILITY_CACHE_TYPES[i];
		_visibilityCache[type].length = 0;
	}

	// Sort entities into visible lists
	for (let i = 0; i < _entities.length; i++) {
		const entity = _entities[i];
		if (!entity.boundingBox || entity.boundingBox.isVisible()) {
			_visibilityCache[entity.type].push(entity);
		}
	}
};

const _raycast = (
	fromX,
	fromY,
	fromZ,
	toX,
	toY,
	toZ,
	options = _DEFAULT_RAY_OPTIONS,
) => {
	vec3.set(_rayFrom, fromX, fromY, fromZ);
	vec3.set(_rayTo, toX, toY, toZ);
	_rayResult.reset();

	vec3.copy(_ray.from, _rayFrom);
	vec3.copy(_ray.to, _rayTo);
	_ray.updateDirection();
	_ray.result = _rayResult;

	_ray.skipBackfaces = options.skipBackfaces ?? true;
	_ray.collisionFilterMask = options.collisionFilterMask ?? -1;
	_ray.collisionFilterGroup = options.collisionFilterGroup ?? -1;
	_ray.mode = 1; // CLOSEST

	_ray.hasHit = false;
	_rayResult.distance = Infinity;

	for (let i = 0; i < _collidables.length; i++) {
		const entity = _collidables[i];
		// Use base_matrix for static geometry.
		_ray.intersectTrimesh(entity.collider, entity.base_matrix, options);
	}

	return _rayResult;
};

// ============================================================================
// Public Scene API
// ============================================================================

const Scene = {
	init: _init,
	dispose: _dispose,
	pause: _pause,
	update: _update,
	getAmbient: _getAmbient,
	setAmbient: _setAmbient,
	addEntities: _addEntities,
	removeEntity: _removeEntity,
	getEntities: _getEntities,
	addStaticMesh: _addStaticMesh,
	finalizeStaticMesh: _finalizeStaticMesh,
	visibilityCache: _visibilityCache,
	loadLightGrid: _loadLightGrid,
	raycast: _raycast,
};

export default Scene;
