import { mat4 } from "../../dependencies/gl-matrix.js";
import { EntityTypes } from "../scene/entity.js";
import { Scene } from "../scene/scene.js";
import { Camera } from "../systems/camera.js";
import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { Stats } from "../systems/stats.js";
import { Backend } from "./backend.js";
import { Shaders } from "./shaders.js";

// Private constants
const _matModel = mat4.create();
const _lightMatrix = mat4.create();
const _lightPos = [0, 0, 0];

// Reusable temporaries for per-entity ambient sampling
const _probePos = new Float32Array(3);
const _probeColor = new Float32Array(3);
const _MAX_SHADOW_RAYCAST_DISTANCE = 200;
const _SKINNED_SHADOW_RAYCAST_INTERVAL = 3;
const _SKINNED_SHADOW_MOVE_EPSILON_SQ = 0.04;
const _SHADOW_FRAME_WRAP = 1_000_000;
const _SHADOW_RAYCAST_BUDGET = 16; // max static-mesh raycasts per frame
let _shadowFrame = 0;

// Lighting UBO data (aligned to 16 bytes for WGSL)
// 8 * 4 * 4 bytes = 128 bytes (positions)
// 8 * 4 * 4 bytes = 128 bytes (colors)
// 8 * 4 * 4 bytes = 128 bytes (params)
// 4 * 4 * 4 bytes = 64 bytes (spot pos)
// 4 * 4 * 4 bytes = 64 bytes (spot dir)
// 4 * 4 * 4 bytes = 64 bytes (spot color)
// 4 * 4 * 4 bytes = 64 bytes (spot params)
// 4 * 4 bytes = 16 bytes (counts)
// Total = 656 bytes / 4 = 164 floats
const _LIGHTING_DATA_SIZE = 164;
const _lightingData = new Float32Array(_LIGHTING_DATA_SIZE);
let _lightingUBO = null;

// Debug state
const _debugState = {
	showBoundingVolumes: false,
	showWireframes: false,
	showLightVolumes: false,
	showSkeleton: false,
};

// Render stats (reset each frame, updated during rendering)
const _renderStats = {
	meshCount: 0,
	lightCount: 0,
	triangleCount: 0,
};

// Per-frame counter used to skip redundant ambient probe sampling for entities
// rendered in multiple passes (geometry, transparent, fps) within the same frame.
let _renderFrame = 0;

// Pre-computed arrays for debug rendering (avoid per-frame allocations)
const _debugMeshTypes = [
	EntityTypes.MESH,
	EntityTypes.SKINNED_MESH,
	EntityTypes.FPS_MESH,
	EntityTypes.SKYBOX,
];
const _debugLightTypes = [EntityTypes.POINT_LIGHT, EntityTypes.SPOT_LIGHT];

// Debug colors for each entity type
const _boundingBoxColors = {
	[EntityTypes.SKYBOX]: [0, 0, 1, 1], // Blue
	[EntityTypes.MESH]: [1, 0, 0, 1], // Red
	[EntityTypes.SKINNED_MESH]: [1, 0, 1, 1], // Magenta
	[EntityTypes.FPS_MESH]: [0, 1, 0, 1], // Green
	[EntityTypes.DIRECTIONAL_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.POINT_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.SPOT_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.ANIMATED_BILLBOARD]: [0, 1, 1, 1], // Cyan
	[EntityTypes.PARTICLE_EMITTER]: [1, 0.5, 0, 1], // Orange
};

const _MAX_POINT_LIGHTS = 8;
const _MAX_SPOT_LIGHTS = 4;

// Toggle functions for debug commands
const _makeDebugToggle = (key) => () => {
	_debugState[key] = !_debugState[key];
};
const toggleBoundingVolumes = _makeDebugToggle("showBoundingVolumes");
const toggleWireframes = _makeDebugToggle("showWireframes");
const toggleLightVolumes = _makeDebugToggle("showLightVolumes");
const toggleSkeleton = _makeDebugToggle("showSkeleton");

// Register console commands
Console.registerCmd("tbv", toggleBoundingVolumes);
Console.registerCmd("twf", toggleWireframes);
Console.registerCmd("tlv", toggleLightVolumes);
Console.registerCmd("tsk", toggleSkeleton);

// Sample ambient probe color for an entity based on its world position.
// Result is cached per entity per frame to avoid redundant matrix ops when
// the same entity appears in multiple render passes (geometry, transparent, fps).
const _probeMatrix = mat4.create();
const _sampleProbeColor = (entity) => {
	if (entity._ambientProbeFrame === _renderFrame) {
		return entity._ambientProbeColor;
	}
	mat4.multiply(_probeMatrix, entity.base_matrix, entity.ani_matrix);
	mat4.getTranslation(_probePos, _probeMatrix);
	_probePos[1] += 32.0;
	if (!entity._ambientProbeColor) {
		entity._ambientProbeColor = new Float32Array(3);
	}
	Scene.getAmbient(_probePos, entity._ambientProbeColor);
	entity._ambientProbeFrame = _renderFrame;
	return entity._ambientProbeColor;
};

// Calculate shadow height for an entity via downward raycast
const _calculateShadowHeight = (entity) => {
	mat4.getTranslation(_probePos, entity.base_matrix);
	const result = Scene.raycast(
		_probePos[0],
		_probePos[1] + 1.0,
		_probePos[2],
		_probePos[0],
		_probePos[1] - _MAX_SHADOW_RAYCAST_DISTANCE,
		_probePos[2],
	);
	entity.shadowHeight = result.hasHit ? result.hitPointWorld[1] : undefined;
};

const _shouldUpdateSkinnedShadowHeight = (entity) => {
	mat4.getTranslation(_probePos, entity.base_matrix);

	const x = _probePos[0];
	const y = _probePos[1];
	const z = _probePos[2];

	if (entity._shadowSampleX === undefined) {
		entity._shadowSampleX = x;
		entity._shadowSampleY = y;
		entity._shadowSampleZ = z;
		entity._shadowSampleFrame = _shadowFrame;
		return true;
	}

	const dx = x - entity._shadowSampleX;
	const dy = y - entity._shadowSampleY;
	const dz = z - entity._shadowSampleZ;
	const movedSq = dx * dx + dy * dy + dz * dz;

	const lastFrame = entity._shadowSampleFrame ?? _shadowFrame;
	const frameDelta =
		_shadowFrame >= lastFrame
			? _shadowFrame - lastFrame
			: _shadowFrame + _SHADOW_FRAME_WRAP - lastFrame;

	// Scale update interval by distance to camera: near entities update every
	// _SKINNED_SHADOW_RAYCAST_INTERVAL frames, far ones up to 15 frames apart.
	// Uses squared distance to avoid a sqrt on every frame per entity.
	const cdx = x - Camera.position[0];
	const cdy = y - Camera.position[1];
	const cdz = z - Camera.position[2];
	const distSq = cdx * cdx + cdy * cdy + cdz * cdz;
	const lodInterval =
		_SKINNED_SHADOW_RAYCAST_INTERVAL +
		Math.min(Math.floor(distSq / 500000), 12);

	if (movedSq >= _SKINNED_SHADOW_MOVE_EPSILON_SQ || frameDelta >= lodInterval) {
		entity._shadowSampleX = x;
		entity._shadowSampleY = y;
		entity._shadowSampleZ = z;
		entity._shadowSampleFrame = _shadowFrame;
		return true;
	}

	return false;
};

const renderSkybox = () => {
	// Disable depth operations for skybox
	Backend.setDepthState(false, false);

	for (const entity of Scene.visibilityCache[EntityTypes.SKYBOX]) {
		entity.render();
	}

	// Restore gl state
	Backend.setDepthState(true, true);
};

const _bindGeometryShader = () => {
	Shaders.geometry.bind();
	mat4.identity(_matModel);
	Shaders.geometry.setInt("proceduralNoise", 5);
	Shaders.geometry.setInt(
		"doProceduralDetail",
		Settings.proceduralDetail ? 1 : 0,
	);
	Shaders.geometry.setMat4("matWorld", _matModel);
};

const renderWorldGeometry = () => {
	// Advance frame counter so per-entity caches (ambient probe, etc.) are invalidated
	_renderFrame++;

	// Reset render stats for this frame
	_renderStats.meshCount = 0;
	_renderStats.lightCount = 0;
	_renderStats.triangleCount = 0;

	_bindGeometryShader();

	// Render skybox with special GL state
	renderSkybox();
	_bindGeometryShader();

	// Render all mesh entities
	const meshEntities = Scene.visibilityCache[EntityTypes.MESH];
	for (const entity of meshEntities) {
		entity.render(_sampleProbeColor(entity), "opaque", Shaders.geometry);
		_renderStats.meshCount++;
		_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
	}

	for (const entity of Scene.visibilityCache[EntityTypes.FPS_MESH]) {
		entity.render(_sampleProbeColor(entity), "opaque", Shaders.geometry);
	}

	Backend.unbindShader();

	// Render skinned meshes with dedicated shader
	if (Shaders.skinnedGeometry) {
		const skinnedEntities = Scene.visibilityCache[EntityTypes.SKINNED_MESH];

		Shaders.skinnedGeometry.bind();
		Shaders.skinnedGeometry.setInt("proceduralNoise", 5);
		Shaders.skinnedGeometry.setInt(
			"doProceduralDetail",
			Settings.proceduralDetail ? 1 : 0,
		);

		// Render skinned meshes
		for (const entity of skinnedEntities) {
			entity.render(
				_sampleProbeColor(entity),
				"opaque",
				Shaders.skinnedGeometry,
			);
			_renderStats.meshCount++;
			_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
		}

		Backend.unbindShader();
	}
};

const renderTransparent = () => {
	Shaders.transparent.bind();
	mat4.identity(_matModel);

	Shaders.transparent.setMat4("matWorld", _matModel);
	Shaders.transparent.setInt("colorSampler", 0);

	const visiblePointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT];
	const numPointLights = Math.min(visiblePointLights.length, _MAX_POINT_LIGHTS);

	const visibleSpotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT];
	const numSpotLights = Math.min(visibleSpotLights.length, _MAX_SPOT_LIGHTS);

	if (!_lightingUBO) {
		_lightingUBO = Backend.createUBO(_LIGHTING_DATA_SIZE * 4, 2);
	}

	// Fill Point Lights — Layout: Pos(0), Color(32), Params(64)
	for (let i = 0; i < numPointLights; i++) {
		const light = visiblePointLights[i];
		mat4.multiply(_lightMatrix, light.base_matrix, light.ani_matrix);
		mat4.getTranslation(_lightPos, _lightMatrix);

		_lightingData[i * 4] = _lightPos[0];
		_lightingData[i * 4 + 1] = _lightPos[1];
		_lightingData[i * 4 + 2] = _lightPos[2];

		_lightingData[32 + i * 4] = light.color[0];
		_lightingData[32 + i * 4 + 1] = light.color[1];
		_lightingData[32 + i * 4 + 2] = light.color[2];

		_lightingData[64 + i * 4] = light.intensity;
		_lightingData[64 + i * 4 + 1] = light.size;
	}

	// Fill Spot Lights — Layout: Pos(96), Dir(112), Color(128), Params(144)
	for (let i = 0; i < numSpotLights; i++) {
		const light = visibleSpotLights[i];

		_lightingData[96 + i * 4] = light.position[0];
		_lightingData[96 + i * 4 + 1] = light.position[1];
		_lightingData[96 + i * 4 + 2] = light.position[2];

		_lightingData[112 + i * 4] = light.direction[0];
		_lightingData[112 + i * 4 + 1] = light.direction[1];
		_lightingData[112 + i * 4 + 2] = light.direction[2];

		_lightingData[128 + i * 4] = light.color[0];
		_lightingData[128 + i * 4 + 1] = light.color[1];
		_lightingData[128 + i * 4 + 2] = light.color[2];

		_lightingData[144 + i * 4] = light.intensity;
		_lightingData[144 + i * 4 + 1] = light.cutoff;
		_lightingData[144 + i * 4 + 2] = light.range;
	}

	// Counts (Offset 160)
	_lightingData[160] = numPointLights;
	_lightingData[161] = numSpotLights;

	Backend.updateUBO(_lightingUBO, _lightingData);
	Backend.bindUniformBuffer(_lightingUBO);

	for (const entity of Scene.visibilityCache[EntityTypes.MESH]) {
		entity.render(
			_sampleProbeColor(entity),
			"translucent",
			Shaders.transparent,
		);
	}

	Backend.unbindShader();
};

const renderLighting = () => {
	// Directional lights (always render)
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	for (const entity of Scene.visibilityCache[EntityTypes.DIRECTIONAL_LIGHT]) {
		entity.render();
	}
	Backend.unbindShader();

	// Get light entities
	const pointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT];
	const spotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT];

	// Point lights
	Shaders.pointLight.bind();
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1);
	for (const light of pointLights) {
		light.render();
		_renderStats.lightCount++;
	}
	Backend.unbindShader();

	// Spot lights
	Shaders.spotLight.bind();
	Shaders.spotLight.setInt("positionBuffer", 0);
	Shaders.spotLight.setInt("normalBuffer", 1);
	for (const light of spotLights) {
		light.render();
		_renderStats.lightCount++;
	}
	Backend.unbindShader();

	// Update stats with actual rendered counts
	Stats.setRenderStats(
		_renderStats.meshCount,
		_renderStats.lightCount,
		_renderStats.triangleCount,
	);
};

const renderShadows = () => {
	_shadowFrame = (_shadowFrame + 1) % _SHADOW_FRAME_WRAP;

	const ambient = Scene.getAmbient();

	Shaders.entityShadows.bind();
	Shaders.entityShadows.setVec3("ambient", ambient);
	Shaders.entityShadows.setVec3("uProbeColor", ambient);

	const meshEntities = Scene.visibilityCache[EntityTypes.MESH];
	let raycastBudget = _SHADOW_RAYCAST_BUDGET;
	for (const entity of meshEntities) {
		if (entity.shadowHeight === null) {
			if (raycastBudget > 0) {
				_calculateShadowHeight(entity);
				raycastBudget--;
			} else {
				continue; // height not yet computed; skip shadow this frame
			}
		}
		entity.renderShadow();
	}
	Backend.unbindShader();

	// Render skinned mesh shadows with dedicated shader
	if (Shaders.skinnedEntityShadows) {
		Shaders.skinnedEntityShadows.bind();
		Shaders.skinnedEntityShadows.setVec3("ambient", ambient);
		Shaders.skinnedEntityShadows.setVec3("uProbeColor", ambient);

		const skinnedEntities = Scene.visibilityCache[EntityTypes.SKINNED_MESH];
		for (const entity of skinnedEntities) {
			if (_shouldUpdateSkinnedShadowHeight(entity)) {
				_calculateShadowHeight(entity);
			}
			entity.renderShadow("all", Shaders.skinnedEntityShadows);
		}
		Backend.unbindShader();
	}
};

const renderFPSGeometry = () => {
	_bindGeometryShader();

	for (const entity of Scene.visibilityCache[EntityTypes.FPS_MESH]) {
		entity.render(_sampleProbeColor(entity));
	}

	Backend.unbindShader();
};

const renderBillboards = () => {
	for (const entity of Scene.visibilityCache[EntityTypes.ANIMATED_BILLBOARD]) {
		entity.render();
	}
	for (const entity of Scene.visibilityCache[EntityTypes.PARTICLE_EMITTER]) {
		entity.render();
	}
};

const renderDebug = () => {
	if (
		!_debugState.showBoundingVolumes &&
		!_debugState.showWireframes &&
		!_debugState.showLightVolumes &&
		!_debugState.showSkeleton
	) {
		return;
	}

	Shaders.debug.bind();

	// Enable wireframe mode
	Backend.setDepthState(false, false);

	// Render bounding volumes
	if (_debugState.showBoundingVolumes) {
		for (const type in Scene.visibilityCache) {
			Shaders.debug.setVec4("debugColor", _boundingBoxColors[type]);
			for (const entity of Scene.visibilityCache[type]) {
				entity.renderBoundingBox("lines");
			}
		}
	}

	// Render mesh wireframes
	if (_debugState.showWireframes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 1, 1]);
		for (const type of _debugMeshTypes) {
			for (const entity of Scene.visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Render light volumes
	if (_debugState.showLightVolumes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 0, 1]);
		for (const type of _debugLightTypes) {
			for (const entity of Scene.visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Render skeleton
	if (_debugState.showSkeleton) {
		for (const entity of Scene.visibilityCache[EntityTypes.SKINNED_MESH]) {
			if (entity.renderSkeleton) {
				entity.renderSkeleton();
			}
		}
	}

	// Reset state
	Backend.setDepthState(true, true);

	Backend.unbindShader();
};

const RenderPasses = {
	renderWorldGeometry,
	renderTransparent,
	renderBillboards,
	renderLighting,
	renderShadows,
	renderFPSGeometry,
	renderDebug,
};

export { RenderPasses };
