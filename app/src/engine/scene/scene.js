import { mat4, vec3 } from "../../dependencies/gl-matrix.js";
import { Ray, RaycastResult } from "../physics/ray.js";
import { Trimesh } from "../physics/trimesh.js";
import { Console } from "../systems/console.js";
import { EntityTypes } from "./entity.js";
import { LightGrid } from "./lightgrid.js";

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
	EntityTypes.ANIMATED_BILLBOARD,
	EntityTypes.PARTICLE_EMITTER,
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
let _visibilityDirty = true;
let _pauseUpdate = false;

// Pre-allocated set to avoid per-frame allocations during entity removal
const _entitiesToRemove = new Set();

// Static trimesh for merged static geometry
let _staticTrimesh = null;
const _staticCollidable = {
	collider: null,
	base_matrix: mat4.create(), // Identity — vertices are already in world space
};

// Shared raycast state
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
	[EntityTypes.ANIMATED_BILLBOARD]: [],
	[EntityTypes.PARTICLE_EMITTER]: [],
};

const _entitiesByType = {
	[EntityTypes.SKYBOX]: [],
	[EntityTypes.MESH]: [],
	[EntityTypes.SKINNED_MESH]: [],
	[EntityTypes.FPS_MESH]: [],
	[EntityTypes.DIRECTIONAL_LIGHT]: [],
	[EntityTypes.POINT_LIGHT]: [],
	[EntityTypes.SPOT_LIGHT]: [],
	[EntityTypes.ANIMATED_BILLBOARD]: [],
	[EntityTypes.PARTICLE_EMITTER]: [],
};

// ============================================================================
// Private functions
// ============================================================================

const _getEntities = (type) => {
	return _entitiesByType[type] || [];
};

const _clearTypeLists = () => {
	for (let i = 0; i < _VISIBILITY_CACHE_TYPES.length; i++) {
		const type = _VISIBILITY_CACHE_TYPES[i];
		_entitiesByType[type].length = 0;
	}
};

const _rebuildTypeLists = () => {
	_clearTypeLists();
	for (let i = 0; i < _entities.length; i++) {
		const entity = _entities[i];
		if (_entitiesByType[entity.type]) {
			_entitiesByType[entity.type].push(entity);
		}
	}
};

const _addEntities = (e) => {
	if (!e) {
		Console.warn("Attempted to add null/undefined entity");
		return;
	}

	_visibilityDirty = true;
	if (Array.isArray(e)) {
		const newEntities = e.filter((entity) => entity != null);
		_entities = _entities.concat(newEntities);
		for (const entity of newEntities) {
			if (_entitiesByType[entity.type]) {
				_entitiesByType[entity.type].push(entity);
			}
			if (entity.collider) _collidables.push(entity);
		}
	} else {
		_entities.push(e);
		if (_entitiesByType[e.type]) {
			_entitiesByType[e.type].push(e);
		}
		if (e.collider) _collidables.push(e);
	}
};

const _swapAndPop = (arr, index) => {
	arr[index] = arr[arr.length - 1];
	arr.length--;
};

const _removeEntity = (entity) => {
	if (!entity) return;

	const index = _entities.indexOf(entity);
	if (index !== -1) {
		_swapAndPop(_entities, index);
		_visibilityDirty = true;

		const typeList = _entitiesByType[entity.type];
		if (typeList) {
			const typeIndex = typeList.indexOf(entity);
			if (typeIndex !== -1) {
				_swapAndPop(typeList, typeIndex);
			}
		}

		// Remove from collidables
		const colIndex = _collidables.indexOf(entity);
		if (colIndex !== -1) {
			_swapAndPop(_collidables, colIndex);
		}

		// Dispose entity resources
		entity.dispose?.();
	}
};

const _init = () => {
	_entities.length = 0;
	_collidables.length = 0;
	_clearTypeLists();
	_visibilityDirty = true;
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
	_clearTypeLists();
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

const _addStaticGeometry = (entity) => {
	const mesh = entity.mesh;
	if (!mesh?.vertices || !mesh?.indices) {
		Console.warn("Cannot make static: mesh has no vertex/index data");
		return;
	}

	// Lazy-init the merged static trimesh
	if (!_staticTrimesh) {
		_staticTrimesh = new Trimesh();
		_staticCollidable.collider = _staticTrimesh;
		_collidables.push(_staticCollidable);
	}

	// Flatten indices from all material groups
	let totalIndexCount = 0;
	for (const group of mesh.indices) {
		totalIndexCount += group.array.length;
	}

	const flatIndices = new Int32Array(totalIndexCount);
	let offset = 0;
	for (const group of mesh.indices) {
		flatIndices.set(group.array, offset);
		offset += group.array.length;
	}

	// Transform vertices into world space using the entity's base_matrix
	const src = mesh.vertices;
	const worldVerts = new Float32Array(src.length);
	const _v = vec3.create();

	for (let i = 0; i < src.length; i += 3) {
		vec3.set(_v, src[i], src[i + 1], src[i + 2]);
		vec3.transformMat4(_v, _v, entity.base_matrix);
		worldVerts[i] = _v[0];
		worldVerts[i + 1] = _v[1];
		worldVerts[i + 2] = _v[2];
	}

	_staticTrimesh.addMesh(worldVerts, flatIndices);
	entity.isStatic = true;
};

const _finalizeStaticGeometry = () => {
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

	for (let i = 0; i < _entities.length; i++) {
		const entity = _entities[i];
		if (entity.isStatic) continue;
		const result = entity.update(frameTime);
		if (result === false) _entitiesToRemove.add(entity);
	}

	// Batch remove entities — in-place to avoid allocations
	if (_entitiesToRemove.size > 0) {
		// In-place truncation of _entities
		let eLen = 0;
		for (let i = 0; i < _entities.length; i++) {
			if (!_entitiesToRemove.has(_entities[i])) {
				_entities[eLen++] = _entities[i];
			}
		}
		_entities.length = eLen;

		// In-place truncation of _collidables
		let cLen = 0;
		for (let i = 0; i < _collidables.length; i++) {
			if (!_entitiesToRemove.has(_collidables[i])) {
				_collidables[cLen++] = _collidables[i];
			}
		}
		_collidables.length = cLen;

		_rebuildTypeLists();
		_visibilityDirty = true;
		for (const entity of _entitiesToRemove) {
			entity.dispose?.();
		}
		_entitiesToRemove.clear();
	}

	_updateVisibility();
};

const _updateVisibility = () => {
	// Always rebuild visibility — frustum changes every frame even if entities don't
	_visibilityDirty = false;

	// Reset visibility lists
	for (let i = 0; i < _VISIBILITY_CACHE_TYPES.length; i++) {
		_visibilityCache[_VISIBILITY_CACHE_TYPES[i]].length = 0;
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
	// Set ray endpoints directly (no intermediate temps)
	const from = _ray.from;
	const to = _ray.to;
	from[0] = fromX;
	from[1] = fromY;
	from[2] = fromZ;
	to[0] = toX;
	to[1] = toY;
	to[2] = toZ;

	_ray.updateDirection();

	// Minimal reset — only flags that matter for CLOSEST mode
	_ray.hasHit = false;
	_ray.skipBackfaces = options.skipBackfaces ?? true;
	_ray.mode = 1; // CLOSEST
	_ray.result = _rayResult;

	const result = _rayResult;
	result.hasHit = false;
	result.distance = Infinity;
	result.shouldStop = false;

	for (let i = 0; i < _collidables.length; i++) {
		_ray.intersectTrimesh(
			_collidables[i].collider,
			_collidables[i].base_matrix,
			options,
		);
	}

	return result;
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
	addStaticGeometry: _addStaticGeometry,
	finalizeStaticGeometry: _finalizeStaticGeometry,
	visibilityCache: _visibilityCache,
	loadLightGrid: _loadLightGrid,
	raycast: _raycast,
};

export { Scene };
