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
const _MAX_SHADOW_RAYCAST_DISTANCE = 200;
const _SKINNED_SHADOW_RAYCAST_INTERVAL = 3;
const _SKINNED_SHADOW_MOVE_EPSILON_SQ = 0.04;
const _SHADOW_FRAME_WRAP = 1_000_000;
const _SHADOW_RAYCAST_BUDGET = 16; // max static-mesh raycasts per frame
let _shadowFrame = 0;

// Lighting UBO data — 2 vec4s per point light, 3 per spot light, 1 count vec4
// 8 point * 2 vec4 * 4 floats = 64 floats
// 4 spot  * 3 vec4 * 4 floats = 48 floats
// 1 count * 1 vec4 * 4 floats =  4 floats
// Total = 116 floats = 464 bytes
const _LIGHTING_DATA_SIZE = 116;
const _lightingData = new Float32Array(_LIGHTING_DATA_SIZE);
let _lightingUBO = null;

// Reusable sort buffers for light contribution ordering (separate point/spot to avoid aliasing)
const _pointLightSortBuffer = [];
const _spotLightSortBuffer = [];

// Reusable sort buffer for transparent entity back-to-front ordering
const _transparentSortBuffer = [];

// Shadow priority sort buffer
const _shadowSortBuffer = [];

// Score an entity's shadow priority by its projected screen-space footprint.
// worldSize / clipW is a perspective-correct size proxy: larger closer entities score higher.
const _shadowScreenSize = (entity, viewProjection) => {
	const bb = entity.boundingBox;
	if (!bb) return 0;
	const m = entity.base_matrix;
	const px = m[12];
	const py = m[13];
	const pz = m[14];
	const dx = bb.max[0] - bb.min[0];
	const dy = bb.max[1] - bb.min[1];
	const dz = bb.max[2] - bb.min[2];
	const worldSize = Math.sqrt(dx * dx + dy * dy + dz * dz);
	const w =
		viewProjection[3] * px +
		viewProjection[7] * py +
		viewProjection[11] * pz +
		viewProjection[15];
	if (w <= 0) return 0;
	return worldSize / w;
};

// Debug state
const _debugState = {
	showBoundingVolumes: false,
	showWireframes: false,
	showLightVolumes: false,
	showSkeleton: false,
	showStats: false,
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
const toggleStats = _makeDebugToggle("showStats");

// Register console commands
Console.registerCmd("tbv", toggleBoundingVolumes);
Console.registerCmd("twf", toggleWireframes);
Console.registerCmd("tlv", toggleLightVolumes);
Console.registerCmd("tsk", toggleSkeleton);
Console.registerCmd("tst", toggleStats);

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
	const result = Scene.raycastStatic(
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

	if (_debugState.showStats) {
		_renderStats.meshCount = 0;
		_renderStats.lightCount = 0;
		_renderStats.triangleCount = 0;
	}

	_bindGeometryShader();

	// Render skybox with special GL state
	renderSkybox();
	_bindGeometryShader();

	// Render all mesh entities
	const meshEntities = Scene.visibilityCache[EntityTypes.MESH];
	for (const entity of meshEntities) {
		entity.render(_sampleProbeColor(entity), "opaque", Shaders.geometry);
		if (_debugState.showStats) {
			_renderStats.meshCount++;
			_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
		}
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
			if (_debugState.showStats) {
				_renderStats.meshCount++;
				_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
			}
		}

		Backend.unbindShader();
	}
};

const renderTransparent = () => {
	Shaders.transparent.bind();
	mat4.identity(_matModel);

	Shaders.transparent.setMat4("matWorld", _matModel);
	Shaders.transparent.setInt("colorSampler", 0);

	// Sort by contribution so the highest-impact lights fill the limited UBO slots
	const sortedPointLights = _sortLightsByContribution(
		Scene.visibilityCache[EntityTypes.POINT_LIGHT],
		_pointLightSortBuffer,
	);
	const numPointLights = Math.min(sortedPointLights.length, _MAX_POINT_LIGHTS);

	const sortedSpotLights = _sortLightsByContribution(
		Scene.visibilityCache[EntityTypes.SPOT_LIGHT],
		_spotLightSortBuffer,
	);
	const numSpotLights = Math.min(sortedSpotLights.length, _MAX_SPOT_LIGHTS);

	if (!_lightingUBO) {
		_lightingUBO = Backend.createUBO(_LIGHTING_DATA_SIZE * 4, 2);
	}

	// Fill Point Lights — Layout: Pos(0), Color(32), Params(64)
	// Fill Point Lights — 2 vec4s each: [i*8]=posSize, [i*8+4]=colorIntensity
	for (let i = 0; i < numPointLights; i++) {
		const light = sortedPointLights[i].light;
		mat4.multiply(_lightMatrix, light.base_matrix, light.ani_matrix);
		mat4.getTranslation(_lightPos, _lightMatrix);

		const base = i * 8;
		_lightingData[base] = _lightPos[0];
		_lightingData[base + 1] = _lightPos[1];
		_lightingData[base + 2] = _lightPos[2];
		_lightingData[base + 3] = light.size;
		_lightingData[base + 4] = light.color[0];
		_lightingData[base + 5] = light.color[1];
		_lightingData[base + 6] = light.color[2];
		_lightingData[base + 7] = light.intensity;
	}

	// Fill Spot Lights — 3 vec4s each: posRange, colorIntensity, dirCutoff (offset 64)
	for (let i = 0; i < numSpotLights; i++) {
		const light = sortedSpotLights[i].light;

		const base = 64 + i * 12;
		_lightingData[base] = light.position[0];
		_lightingData[base + 1] = light.position[1];
		_lightingData[base + 2] = light.position[2];
		_lightingData[base + 3] = light.range;
		_lightingData[base + 4] = light.color[0];
		_lightingData[base + 5] = light.color[1];
		_lightingData[base + 6] = light.color[2];
		_lightingData[base + 7] = light.intensity;
		_lightingData[base + 8] = light.direction[0];
		_lightingData[base + 9] = light.direction[1];
		_lightingData[base + 10] = light.direction[2];
		_lightingData[base + 11] = light.cutoff;
	}

	// Counts (Offset 112 = 64 + 48)
	_lightingData[112] = numPointLights;
	_lightingData[113] = numSpotLights;

	Backend.updateUBO(_lightingUBO, _lightingData);
	Backend.bindUniformBuffer(_lightingUBO);

	const meshes = Scene.visibilityCache[EntityTypes.MESH];
	_transparentSortBuffer.length = 0;
	for (let i = 0; i < meshes.length; i++) {
		const entity = meshes[i];
		const m = entity.base_matrix;
		const vp = Camera.viewProjection;
		const w = vp[3] * m[12] + vp[7] * m[13] + vp[11] * m[14] + vp[15];
		_transparentSortBuffer.push({ entity, depth: w });
	}
	_transparentSortBuffer.sort((a, b) => b.depth - a.depth);
	for (let i = 0; i < _transparentSortBuffer.length; i++) {
		const entity = _transparentSortBuffer[i].entity;
		entity.render(
			_sampleProbeColor(entity),
			"translucent",
			Shaders.transparent,
		);
	}

	Backend.unbindShader();
};

const _sortLightsByContribution = (lights, buf) => {
	buf.length = 0;
	const cx = Camera.position[0];
	const cy = Camera.position[1];
	const cz = Camera.position[2];
	for (let i = 0; i < lights.length; i++) {
		const light = lights[i];
		// Use base_matrix translation as world position approximation (ani_matrix is
		// identity for static lights; close enough for contribution ordering)
		const m = light.base_matrix;
		const dx = m[12] - cx;
		const dy = m[13] - cy;
		const dz = m[14] - cz;
		const dist2 = dx * dx + dy * dy + dz * dz || 1;
		buf.push({ light, score: light.intensity / dist2 });
	}
	buf.sort((a, b) => b.score - a.score);
	return buf;
};

const renderLighting = () => {
	// Directional lights (always render)
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	Shaders.directionalLight.setInt("colorBuffer", 3);
	for (const entity of Scene.visibilityCache[EntityTypes.DIRECTIONAL_LIGHT]) {
		entity.render();
	}
	Backend.unbindShader();

	// Sort by contribution so highest-impact lights render first
	const sortedPointLights = _sortLightsByContribution(
		Scene.visibilityCache[EntityTypes.POINT_LIGHT],
		_pointLightSortBuffer,
	);
	const sortedSpotLights = _sortLightsByContribution(
		Scene.visibilityCache[EntityTypes.SPOT_LIGHT],
		_spotLightSortBuffer,
	);

	// Point lights
	Shaders.pointLight.bind();
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1);
	for (let i = 0; i < sortedPointLights.length; i++) {
		sortedPointLights[i].light.render();
		if (_debugState.showStats) _renderStats.lightCount++;
	}
	Backend.unbindShader();

	// Spot lights
	Shaders.spotLight.bind();
	Shaders.spotLight.setInt("positionBuffer", 0);
	Shaders.spotLight.setInt("normalBuffer", 1);
	for (let i = 0; i < sortedSpotLights.length; i++) {
		sortedSpotLights[i].light.render();
		if (_debugState.showStats) _renderStats.lightCount++;
	}
	Backend.unbindShader();

	if (_debugState.showStats) {
		Stats.setRenderStats(
			_renderStats.meshCount,
			_renderStats.lightCount,
			_renderStats.triangleCount,
		);
	}
};

const renderShadows = () => {
	_shadowFrame = (_shadowFrame + 1) % _SHADOW_FRAME_WRAP;

	const ambient = Scene.getAmbient();

	Shaders.entityShadows.bind();
	Shaders.entityShadows.setVec3("ambient", ambient);
	Shaders.entityShadows.setVec3("uProbeColor", ambient);

	const meshEntities = Scene.visibilityCache[EntityTypes.MESH];

	// Sort by projected screen-space size so large nearby entities consume budget first
	_shadowSortBuffer.length = 0;
	for (let i = 0; i < meshEntities.length; i++) {
		_shadowSortBuffer.push({
			entity: meshEntities[i],
			score: _shadowScreenSize(meshEntities[i], Camera.viewProjection),
		});
	}
	_shadowSortBuffer.sort((a, b) => b.score - a.score);

	let raycastBudget = _SHADOW_RAYCAST_BUDGET;
	for (let i = 0; i < _shadowSortBuffer.length; i++) {
		const entity = _shadowSortBuffer[i].entity;
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
