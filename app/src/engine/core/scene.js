import { mat4 } from "../../dependencies/gl-matrix.js";
import { EntityTypes } from "../entities/entity.js";
import { Shader, Shaders } from "../rendering/shaders.js";
import { screenQuad } from "../rendering/shapes.js";
import Console from "../systems/console.js";
import Physics from "../systems/physics.js";
import Stats from "../systems/stats.js";
import Camera from "./camera.js";
import { Context, gl } from "./context.js";

// Private constants
const _DEFAULT_AMBIENT = [0.5, 0.5, 0.5];

// Private state
const _viewportSize = [0, 0];
const _matModel = mat4.create();
let _entities = [];
let _ambient = _DEFAULT_AMBIENT;
let _pauseUpdate = false;

// Debug colors for each entity type
const _boundingBoxColors = {
	[EntityTypes.SKYBOX]: [0, 0, 1, 1], // Blue
	[EntityTypes.MESH]: [1, 0, 0, 1], // Red
	[EntityTypes.FPS_MESH]: [0, 1, 0, 1], // Green
	[EntityTypes.DIRECTIONAL_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.POINT_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.SPOT_LIGHT]: [1, 1, 0, 1], // Yellow
};

const _visibilityCache = {
	[EntityTypes.SKYBOX]: [],
	[EntityTypes.MESH]: [],
	[EntityTypes.FPS_MESH]: [],
	[EntityTypes.DIRECTIONAL_LIGHT]: [],
	[EntityTypes.POINT_LIGHT]: [],
	[EntityTypes.SPOT_LIGHT]: [],
};

// Debug state
let _showBoundingVolumes = false;
const _toggleBoundingVolumes = () => {
	_showBoundingVolumes = !_showBoundingVolumes;
};
Console.registerCmd("tbv", _toggleBoundingVolumes);

let _showWireframes = false;
const _toggleWireframes = () => {
	_showWireframes = !_showWireframes;
};
Console.registerCmd("twf", _toggleWireframes);

let _showLightVolumes = false;
const _toggleLightVolumes = () => {
	_showLightVolumes = !_showLightVolumes;
};
Console.registerCmd("tlv", _toggleLightVolumes);

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

const _getAmbient = () => _ambient;
const _setAmbient = (a) => {
	if (
		!Array.isArray(a) ||
		a.length !== 3 ||
		!a.every((v) => typeof v === "number")
	) {
		Console.warn("Invalid ambient light values. Expected array of 3 numbers.");
		return;
	}
	_ambient = a;
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

// Helper to render entities
const _renderEntities = (
	entityType,
	renderMethod = "render",
	mode = "all",
	shader = Shaders.geometry,
) => {
	const targetEntities = _visibilityCache[entityType];
	for (const entity of targetEntities) {
		entity[renderMethod](mode, shader);
	}
};

const _renderWorldGeometry = () => {
	Shaders.geometry.bind();
	mat4.identity(_matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);

	Shaders.geometry.setMat4("matWorld", _matModel);
	Shaders.geometry.setVec3("cameraPosition", Camera.position);

	// Lightmap is now handled per-material in Material.bind()

	// render opaque materials
	_renderEntities(EntityTypes.SKYBOX);
	_renderEntities(EntityTypes.MESH, "render", "opaque");
	_renderEntities(EntityTypes.FPS_MESH, "render", "opaque");

	Shader.unBind();
};

const _renderGlass = () => {
	Shaders.glass.bind();
	mat4.identity(_matModel);
	Shaders.glass.setMat4("matViewProj", Camera.viewProjection);

	Shaders.glass.setMat4("matWorld", _matModel);
	Shaders.glass.setInt("colorSampler", 0);
	Shaders.glass.setVec3("cameraPosition", Camera.position);

	// Ambient lighting not used in glass shader (it's additive)
	// Shaders.glass.setVec3("uAmbient", _ambient);

	// Collect and pass point lights (max 8)
	const MAX_POINT_LIGHTS = 8;
	const visiblePointLights = _visibilityCache[EntityTypes.POINT_LIGHT];
	const numPointLights = Math.min(visiblePointLights.length, MAX_POINT_LIGHTS);
	Shaders.glass.setInt("numPointLights", numPointLights);

	for (let i = 0; i < numPointLights; i++) {
		const light = visiblePointLights[i];
		// Extract world position from the light's full transform (base + animation)
		const m = mat4.create();
		mat4.multiply(m, light.base_matrix, light.ani_matrix);
		const pos = [0, 0, 0];
		mat4.getTranslation(pos, m);
		Shaders.glass.setVec3(`pointLightPositions[${i}]`, pos);
		Shaders.glass.setVec3(`pointLightColors[${i}]`, light.color);
		Shaders.glass.setFloat(`pointLightSizes[${i}]`, light.size);
		Shaders.glass.setFloat(`pointLightIntensities[${i}]`, light.intensity);
	}

	// Collect and pass spot lights (max 4)
	const MAX_SPOT_LIGHTS = 4;
	const visibleSpotLights = _visibilityCache[EntityTypes.SPOT_LIGHT];
	const numSpotLights = Math.min(visibleSpotLights.length, MAX_SPOT_LIGHTS);
	Shaders.glass.setInt("numSpotLights", numSpotLights);

	for (let i = 0; i < numSpotLights; i++) {
		const light = visibleSpotLights[i];
		Shaders.glass.setVec3(`spotLightPositions[${i}]`, light.position);
		Shaders.glass.setVec3(`spotLightDirections[${i}]`, light.direction);
		Shaders.glass.setVec3(`spotLightColors[${i}]`, light.color);
		Shaders.glass.setFloat(`spotLightIntensities[${i}]`, light.intensity);
		Shaders.glass.setFloat(`spotLightCutoffs[${i}]`, light.cutoff);
		Shaders.glass.setFloat(`spotLightRanges[${i}]`, light.range);
	}

	_renderEntities(EntityTypes.MESH, "render", "translucent", Shaders.glass);

	Shader.unBind();
};

const _renderLighting = () => {
	// Update viewport size once
	_viewportSize[0] = Context.width();
	_viewportSize[1] = Context.height();

	// Directional lights
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	Shaders.directionalLight.setVec2("viewportSize", _viewportSize);
	_renderEntities(EntityTypes.DIRECTIONAL_LIGHT);
	Shader.unBind();

	// Pointlights
	Shaders.pointLight.bind();
	Shaders.pointLight.setMat4("matViewProj", Camera.viewProjection);
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1);
	_renderEntities(EntityTypes.POINT_LIGHT);
	Shader.unBind();

	// Spotlights
	Shaders.spotLight.bind();
	Shaders.spotLight.setMat4("matViewProj", Camera.viewProjection);
	Shaders.spotLight.setInt("positionBuffer", 0);
	Shaders.spotLight.setInt("normalBuffer", 1);
	_renderEntities(EntityTypes.SPOT_LIGHT);
	Shader.unBind();

	// Shadows
	gl.blendFunc(gl.DST_COLOR, gl.ZERO);
	Shaders.applyShadows.bind();
	Shaders.applyShadows.setInt("shadowBuffer", 2);
	Shaders.applyShadows.setVec2("viewportSize", _viewportSize);
	screenQuad.renderSingle();
	Shader.unBind();
};

const _renderShadows = () => {
	Shaders.entityShadows.bind();
	Shaders.entityShadows.setMat4("matViewProj", Camera.viewProjection);
	Shaders.entityShadows.setVec3("ambient", _ambient);

	_renderEntities(EntityTypes.MESH, "renderShadow");

	Shader.unBind();
};

const _renderFPSGeometry = () => {
	Shaders.geometry.bind();

	mat4.identity(_matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);

	Shaders.geometry.setMat4("matWorld", _matModel);
	Shaders.geometry.setVec3("cameraPosition", Camera.position);

	_renderEntities(EntityTypes.FPS_MESH);

	Shader.unBind();
};

const _renderDebug = () => {
	// Bind shader and set common uniforms
	Shaders.debug.bind();
	Shaders.debug.setMat4("matViewProj", Camera.viewProjection);

	// Enable wireframe mode
	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);

	// Render bounding volumes
	if (_showBoundingVolumes) {
		// Render bounding volumes for all visible entities of each type
		for (const type in _visibilityCache) {
			Shaders.debug.setVec4("debugColor", _boundingBoxColors[type]);
			for (const entity of _visibilityCache[type]) {
				entity.renderBoundingBox();
			}
		}
	}

	// Render mesh wireframes
	if (_showWireframes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 1, 1]);
		// Only render wireframes for mesh entities
		const meshTypes = [
			EntityTypes.MESH,
			EntityTypes.FPS_MESH,
			EntityTypes.SKYBOX,
		];
		for (const type of meshTypes) {
			for (const entity of _visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Render light volumes
	if (_showLightVolumes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 0, 1]);
		const lightTypes = [EntityTypes.POINT_LIGHT, EntityTypes.SPOT_LIGHT];
		for (const type of lightTypes) {
			for (const entity of _visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Reset state
	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);

	// Unbind shader
	Shader.unBind();
};

const _updateVisibility = () => {
	_entityCache.clear();
	const stats = {
		visibleMeshCount: 0,
		visibleLightCount: 0,
		triangleCount: 0,
	};

	// Reset visibility lists
	for (const type of Object.keys(_visibilityCache)) {
		_visibilityCache[type].length = 0;
	}

	// Sort entities into visible/invisible lists
	for (let i = 0; i < _entities.length; i++) {
		const entity = _entities[i];
		if (!entity.boundingBox || entity.boundingBox.isVisible()) {
			_visibilityCache[entity.type].push(entity);

			if ([EntityTypes.MESH, EntityTypes.FPS_MESH].includes(entity.type)) {
				stats.visibleMeshCount++;
				stats.triangleCount += entity.mesh?.triangleCount || 0;
			} else if (
				[
					EntityTypes.POINT_LIGHT,
					EntityTypes.SPOT_LIGHT,
					EntityTypes.DIRECTIONAL_LIGHT,
				].includes(entity.type)
			) {
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

// Public Scene API
const Scene = {
	init: _init,
	pause: _pause,
	update: _update,
	getAmbient: _getAmbient,
	setAmbient: _setAmbient,
	addEntities: _addEntities,
	removeEntity: _removeEntity,
	getEntities: _getEntities,
	renderWorldGeometry: _renderWorldGeometry,
	renderGlass: _renderGlass,
	renderLighting: _renderLighting,
	renderShadows: _renderShadows,
	renderFPSGeometry: _renderFPSGeometry,
	renderDebug: _renderDebug,
	visibilityCache: _visibilityCache,
};

export default Scene;
