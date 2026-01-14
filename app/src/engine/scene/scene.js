import Console from "../systems/console.js";
import Physics from "../systems/physics.js";
import Stats from "../systems/stats.js";
import { EntityTypes } from "./entity.js";
import LightGrid from "./lightgrid.js";

// Private constants
const _DEFAULT_AMBIENT = [0.5, 0.5, 0.5];
const _BLACK = [0, 0, 0];

// Private state
let _entities = [];
let _ambient = _DEFAULT_AMBIENT;
let _pauseUpdate = false;

const _visibilityCache = {
	[EntityTypes.SKYBOX]: [],
	[EntityTypes.MESH]: [],
	[EntityTypes.SKINNED_MESH]: [],
	[EntityTypes.FPS_MESH]: [],
	[EntityTypes.DIRECTIONAL_LIGHT]: [],
	[EntityTypes.POINT_LIGHT]: [],
	[EntityTypes.SPOT_LIGHT]: [],
};

// Pre-computed type arrays for fast lookup (avoids .includes() in hot path)
const _visibilityCacheTypes = Object.keys(_visibilityCache).map(Number);
const _meshTypes = new Set([
	EntityTypes.MESH,
	EntityTypes.SKINNED_MESH,
	EntityTypes.FPS_MESH,
]);
const _lightTypes = new Set([
	EntityTypes.POINT_LIGHT,
	EntityTypes.SPOT_LIGHT,
	EntityTypes.DIRECTIONAL_LIGHT,
]);

const _renderStats = {
	visibleMeshCount: 0,
	visibleLightCount: 0,
	triangleCount: 0,
};

// Private entity cache
const _entityCache = new Map();

// Private functions
const _getEntities = (type) => {
	if (_entityCache.has(type)) return _entityCache.get(type);

	const selection = _entities.reduce((acc, entity) => {
		if (entity.type === type) acc.push(entity);
		return acc;
	}, []);

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
		_entities = _entities.concat(e.filter((entity) => entity != null));
	} else {
		_entities.push(e);
	}
};

const _removeEntity = (entity) => {
	if (!entity) return;

	const index = _entities.indexOf(entity);
	if (index !== -1) {
		_entities.splice(index, 1);
		_entityCache.clear();

		// Dispose entity resources
		entity.dispose?.();

		// Remove physics body if it exists
		if (entity.physicsBody) {
			Physics.removeBody(entity.physicsBody);
		}
	}
};

const _init = () => {
	_entities.length = 0;
	Physics.init();
};

const _getAmbient = (position = null, outColor = null) => {
	if (LightGrid.hasData) {
		if (position) return LightGrid.getAmbient(position, outColor);
		if (outColor) {
			outColor[0] = 0;
			outColor[1] = 0;
			outColor[2] = 0;
			return outColor;
		}
		return _BLACK;
	}
	if (outColor) {
		outColor[0] = _ambient[0];
		outColor[1] = _ambient[1];
		outColor[2] = _ambient[2];
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

const _pause = (doPause) => {
	_pauseUpdate = doPause;
};

const _update = (frameTime) => {
	if (_pauseUpdate) return;

	// Track entities to remove
	const entitiesToRemove = [];

	for (const entity of _entities) {
		const result = entity.update(frameTime);
		// If update returns false, mark for removal
		if (result === false) {
			entitiesToRemove.push(entity);
		}
	}

	// Remove entities that returned false
	for (const entity of entitiesToRemove) {
		_removeEntity(entity);
	}

	_updateVisibility();
};

const _updateVisibility = () => {
	_entityCache.clear();
	const stats = _renderStats;
	stats.visibleMeshCount = 0;
	stats.visibleLightCount = 0;
	stats.triangleCount = 0;

	// Reset visibility lists using pre-computed type array
	for (let t = 0; t < _visibilityCacheTypes.length; t++) {
		_visibilityCache[_visibilityCacheTypes[t]].length = 0;
	}

	// Sort entities into visible/invisible lists
	for (let i = 0; i < _entities.length; i++) {
		const entity = _entities[i];
		if (!entity.boundingBox || entity.boundingBox.isVisible()) {
			_visibilityCache[entity.type].push(entity);
			const type = entity.type;

			if (_meshTypes.has(type)) {
				stats.visibleMeshCount++;
				stats.triangleCount += entity.mesh?.triangleCount || 0;
			} else if (_lightTypes.has(type)) {
				stats.visibleLightCount++;
			}
		}
	}

	Stats.setRenderStats(
		stats.visibleMeshCount,
		stats.visibleLightCount,
		stats.triangleCount,
	);
};

// Public Scene API - Entity management only, no rendering
const Scene = {
	init: _init,
	pause: _pause,
	update: _update,
	getAmbient: _getAmbient,
	setAmbient: _setAmbient,
	addEntities: _addEntities,
	removeEntity: _removeEntity,
	getEntities: _getEntities,
	visibilityCache: _visibilityCache,
	loadLightGrid: _loadLightGrid,
};

export default Scene;
