import { mat4 } from "../../dependencies/gl-matrix.js";
import { EntityTypes } from "../scene/entity.js";
import { Scene } from "../scene/scene.js";
import { Console } from "../systems/console.js";
import { Settings } from "../systems/settings.js";
import { Stats } from "../systems/stats.js";
import { Backend } from "./backend.js";
import { Shaders } from "./shaders.js";
import { Shapes } from "./shapes.js";

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

// Pre-allocated arrays for occlusion splitting (avoid per-frame allocations)
const _occluders = [];
const _occludees = [];
const _skinnedOccludees = [];
const _occlusionEntities = [];

// Keep occlusion query work bounded; round-robin entities across frames.
const _OCCLUSION_QUERY_BUDGET = 96;
let _occlusionQueryCursor = 0;

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
};

// Pre-allocated flat arrays for WebGL light uniform batch uploads
const _MAX_POINT_LIGHTS = 8;
const _MAX_SPOT_LIGHTS = 4;
const _pointLightPositionData = new Float32Array(_MAX_POINT_LIGHTS * 3);
const _pointLightColorData = new Float32Array(_MAX_POINT_LIGHTS * 3);
const _pointLightSizeData = new Float32Array(_MAX_POINT_LIGHTS);
const _pointLightIntensityData = new Float32Array(_MAX_POINT_LIGHTS);
const _spotLightPositionData = new Float32Array(_MAX_SPOT_LIGHTS * 3);
const _spotLightDirectionData = new Float32Array(_MAX_SPOT_LIGHTS * 3);
const _spotLightColorData = new Float32Array(_MAX_SPOT_LIGHTS * 3);
const _spotLightIntensityData = new Float32Array(_MAX_SPOT_LIGHTS);
const _spotLightCutoffData = new Float32Array(_MAX_SPOT_LIGHTS);
const _spotLightRangeData = new Float32Array(_MAX_SPOT_LIGHTS);

// Toggle functions for debug commands
const toggleBoundingVolumes = () => {
	_debugState.showBoundingVolumes = !_debugState.showBoundingVolumes;
};

const toggleWireframes = () => {
	_debugState.showWireframes = !_debugState.showWireframes;
};

const toggleLightVolumes = () => {
	_debugState.showLightVolumes = !_debugState.showLightVolumes;
};

const toggleSkeleton = () => {
	_debugState.showSkeleton = !_debugState.showSkeleton;
};

const toggleOcclusionCulling = () => {
	Settings.occlusionCulling = !Settings.occlusionCulling;
};

// Register console commands
Console.registerCmd("tbv", toggleBoundingVolumes);
Console.registerCmd("twf", toggleWireframes);
Console.registerCmd("tlv", toggleLightVolumes);
Console.registerCmd("tsk", toggleSkeleton);
Console.registerCmd("toc", toggleOcclusionCulling);

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

	if (
		movedSq >= _SKINNED_SHADOW_MOVE_EPSILON_SQ ||
		frameDelta >= _SKINNED_SHADOW_RAYCAST_INTERVAL
	) {
		entity._shadowSampleX = x;
		entity._shadowSampleY = y;
		entity._shadowSampleZ = z;
		entity._shadowSampleFrame = _shadowFrame;
		return true;
	}

	return false;
};

const _performOcclusionQueries = (entities) => {
	const cube = Shapes.occlusionCube;
	if (!cube) return;

	// Count queryable entities first so we can process only a budgeted subset.
	let queryableCount = 0;
	for (const entity of entities) {
		if (entity.boundingBox) queryableCount++;
	}
	if (queryableCount === 0) return;

	const budget = Math.min(_OCCLUSION_QUERY_BUDGET, queryableCount);
	const start = _occlusionQueryCursor % queryableCount;
	const end = start + budget;

	// Save state and set up for occlusion queries
	Backend.setColorMask(false, false, false, false);
	Backend.setDepthState(true, false, "lequal"); // Test enabled, Write disabled
	Backend.setCullState(false); // Disable culling - important when camera is near/inside bbox

	Shaders.debug.bind();
	Shaders.debug.setVec4("debugColor", [0, 1, 0, 0]);

	let queryableIndex = 0;
	for (const entity of entities) {
		// Skip if no bounding box
		if (!entity.boundingBox) continue;

		// Initialize 6-slot buffer (to handle 5-frame GPU latency with SSAO etc)
		if (!entity._occQueries) {
			entity._occQueries = [
				Backend.createQuery(),
				Backend.createQuery(),
				Backend.createQuery(),
				Backend.createQuery(),
				Backend.createQuery(),
				Backend.createQuery(),
			];
			entity._occQueryFrame = 0;
		}

		// Write to slot N, read from slot (N+1) % 6 (5 frames behind)
		const writeSlot = entity._occQueryFrame % 6;
		const readSlot = (entity._occQueryFrame + 1) % 6;
		const writeQuery = entity._occQueries[writeSlot];
		const readQuery = entity._occQueries[readSlot];

		// STEP 1: Check result from 5 frames ago (if we have enough history)
		if (entity._occQueryFrame >= 5) {
			const res = Backend.getQueryResult(readQuery);
			if (res.available) {
				entity.isVisible = res.hasPassed;
			} else {
				// Result not available yet - assume visible
				entity.isVisible = true;
			}
		} else {
			// Not enough frames yet - assume visible
			entity.isVisible = true;
		}

		// STEP 2: Issue NEW query only for budgeted subset this frame.
		const inPrimaryWindow = queryableIndex >= start && queryableIndex < end;
		const wraps = end > queryableCount;
		const inWrappedWindow = wraps && queryableIndex < end - queryableCount;
		if (inPrimaryWindow || inWrappedWindow) {
			Backend.beginQuery(writeQuery);
			Shaders.debug.setMat4("matWorld", entity.boundingBox.transformMatrix);
			cube.renderSingle(false, "triangles", "all", Shaders.debug);
			Backend.endQuery(writeQuery);

			// STEP 3: Advance frame counter only when a query is written.
			entity._occQueryFrame++;
			if (entity._occQueryFrame > 1000) {
				entity._occQueryFrame = 6; // Reset to minimum "ready" state
			}
		}

		queryableIndex++;
	}

	_occlusionQueryCursor = (_occlusionQueryCursor + budget) % queryableCount;

	Backend.unbindShader();

	// Restore state
	Backend.setColorMask(true, true, true, true);
	Backend.setDepthState(true, true);
	Backend.setCullState(true);
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

const renderWorldGeometry = () => {
	// Advance frame counter so per-entity caches (ambient probe, etc.) are invalidated
	_renderFrame++;

	// Reset render stats for this frame
	_renderStats.meshCount = 0;
	_renderStats.lightCount = 0;
	_renderStats.triangleCount = 0;

	Shaders.geometry.bind();
	mat4.identity(_matModel);

	Shaders.geometry.setInt("proceduralNoise", 5);
	Shaders.geometry.setInt(
		"doProceduralDetail",
		Settings.proceduralDetail ? 1 : 0,
	);
	Shaders.geometry.setMat4("matWorld", _matModel);

	// Render skybox with special GL state
	renderSkybox();

	// Render opaque materials
	// Split into occluders and occludees
	const meshEntities = Scene.visibilityCache[EntityTypes.MESH];
	_occluders.length = 0;
	_occludees.length = 0;
	for (const entity of meshEntities) {
		if (entity.isOccluder) {
			_occluders.push(entity);
		} else {
			_occludees.push(entity);
		}
	}

	// Render Occluders (always) - these populate the depth buffer
	for (const entity of _occluders) {
		entity.render(_sampleProbeColor(entity), "opaque", Shaders.geometry);
		_renderStats.meshCount++;
		_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
	}

	Backend.unbindShader();

	// IMPORTANT: Perform Occlusion Queries HERE, right after occluders.
	// The depth buffer now contains ONLY occluder geometry.
	// Run a single consolidated pass for all occludees (meshes, skinned meshes, lights)
	// to share one shader bind/unbind cycle and one budget window.
	if (Settings.occlusionCulling) {
		const pointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT] || [];
		const spotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT] || [];

		// Build skinned occludees now so they share the same query pass
		_skinnedOccludees.length = 0;
		for (const entity of Scene.visibilityCache[EntityTypes.SKINNED_MESH]) {
			if (!entity.isOccluder) _skinnedOccludees.push(entity);
		}

		_occlusionEntities.length = 0;
		for (const e of _occludees) _occlusionEntities.push(e);
		for (const e of _skinnedOccludees) _occlusionEntities.push(e);
		for (const e of pointLights) _occlusionEntities.push(e);
		for (const e of spotLights) _occlusionEntities.push(e);

		_performOcclusionQueries(_occlusionEntities);
	}

	Shaders.geometry.bind();
	Shaders.geometry.setMat4("matWorld", _matModel);

	// Render Occludees (only visible ones if occlusion enabled)
	for (const entity of _occludees) {
		if (Settings.occlusionCulling && !entity.isVisible) {
			continue;
		}
		entity.render(_sampleProbeColor(entity), "opaque", Shaders.geometry);
		_renderStats.meshCount++;
		_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
	}

	for (const entity of Scene.visibilityCache[EntityTypes.FPS_MESH]) {
		entity.render(_sampleProbeColor(entity), "opaque", Shaders.geometry);
	}

	Backend.unbindShader();

	// Render skinned meshes with dedicated shader
	// (Occlusion queries for skinned meshes already ran in the consolidated pass above)
	if (Shaders.skinnedGeometry) {
		const skinnedEntities = Scene.visibilityCache[EntityTypes.SKINNED_MESH];

		Shaders.skinnedGeometry.bind();
		Shaders.skinnedGeometry.setInt("proceduralNoise", 5);
		Shaders.skinnedGeometry.setInt(
			"doProceduralDetail",
			Settings.proceduralDetail ? 1 : 0,
		);

		// Render skinned meshes with occlusion visibility check
		for (const entity of skinnedEntities) {
			if (
				Settings.occlusionCulling &&
				!entity.isOccluder &&
				!entity.isVisible
			) {
				continue;
			}
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

	if (Settings.useWebGPU) {
		if (!_lightingUBO) {
			_lightingUBO = Backend.createUBO(_LIGHTING_DATA_SIZE * 4, 2);
		}

		// Clear data
		_lightingData.fill(0);

		// Fill Point Lights
		// Layout: Pos(32), Color(32), Params(32)
		for (let i = 0; i < numPointLights; i++) {
			const light = visiblePointLights[i];
			mat4.multiply(_lightMatrix, light.base_matrix, light.ani_matrix);
			mat4.getTranslation(_lightPos, _lightMatrix);

			// Position (Offset 0 + i*4)
			_lightingData[i * 4] = _lightPos[0];
			_lightingData[i * 4 + 1] = _lightPos[1];
			_lightingData[i * 4 + 2] = _lightPos[2];

			// Color (Offset 32 + i*4)
			_lightingData[32 + i * 4] = light.color[0];
			_lightingData[32 + i * 4 + 1] = light.color[1];
			_lightingData[32 + i * 4 + 2] = light.color[2];

			// Params (Offset 64 + i*4) -> intensity, size
			_lightingData[64 + i * 4] = light.intensity;
			_lightingData[64 + i * 4 + 1] = light.size;
		}

		// Fill Spot Lights
		// Layout: Pos(96), Dir(112), Color(128), Params(144)
		for (let i = 0; i < numSpotLights; i++) {
			const light = visibleSpotLights[i];

			// Position
			_lightingData[96 + i * 4] = light.position[0];
			_lightingData[96 + i * 4 + 1] = light.position[1];
			_lightingData[96 + i * 4 + 2] = light.position[2];

			// Direction
			_lightingData[112 + i * 4] = light.direction[0];
			_lightingData[112 + i * 4 + 1] = light.direction[1];
			_lightingData[112 + i * 4 + 2] = light.direction[2];

			// Color
			_lightingData[128 + i * 4] = light.color[0];
			_lightingData[128 + i * 4 + 1] = light.color[1];
			_lightingData[128 + i * 4 + 2] = light.color[2];

			// Params -> intensity, cutoff, range
			_lightingData[144 + i * 4] = light.intensity;
			_lightingData[144 + i * 4 + 1] = light.cutoff;
			_lightingData[144 + i * 4 + 2] = light.range;
		}

		// Counts (Offset 160)
		_lightingData[160] = numPointLights;
		_lightingData[160 + 1] = numSpotLights;

		Backend.updateUBO(_lightingUBO, _lightingData);
		Backend.bindUniformBuffer(_lightingUBO);
	} else {
		// WebGL Fallback — batch-upload light data as typed arrays (4 calls for point lights, 6 for spot lights)
		Shaders.transparent.setInt("numPointLights", numPointLights);
		for (let i = 0; i < numPointLights; i++) {
			const light = visiblePointLights[i];
			mat4.multiply(_lightMatrix, light.base_matrix, light.ani_matrix);
			mat4.getTranslation(_lightPos, _lightMatrix);
			const i3 = i * 3;
			_pointLightPositionData[i3] = _lightPos[0];
			_pointLightPositionData[i3 + 1] = _lightPos[1];
			_pointLightPositionData[i3 + 2] = _lightPos[2];
			_pointLightColorData[i3] = light.color[0];
			_pointLightColorData[i3 + 1] = light.color[1];
			_pointLightColorData[i3 + 2] = light.color[2];
			_pointLightSizeData[i] = light.size;
			_pointLightIntensityData[i] = light.intensity;
		}
		Shaders.transparent.setVec3Array(
			"pointLightPositions[0]",
			_pointLightPositionData.subarray(0, numPointLights * 3),
		);
		Shaders.transparent.setVec3Array(
			"pointLightColors[0]",
			_pointLightColorData.subarray(0, numPointLights * 3),
		);
		Shaders.transparent.setFloatArray(
			"pointLightSizes[0]",
			_pointLightSizeData.subarray(0, numPointLights),
		);
		Shaders.transparent.setFloatArray(
			"pointLightIntensities[0]",
			_pointLightIntensityData.subarray(0, numPointLights),
		);

		Shaders.transparent.setInt("numSpotLights", numSpotLights);
		for (let i = 0; i < numSpotLights; i++) {
			const light = visibleSpotLights[i];
			const i3 = i * 3;
			_spotLightPositionData[i3] = light.position[0];
			_spotLightPositionData[i3 + 1] = light.position[1];
			_spotLightPositionData[i3 + 2] = light.position[2];
			_spotLightDirectionData[i3] = light.direction[0];
			_spotLightDirectionData[i3 + 1] = light.direction[1];
			_spotLightDirectionData[i3 + 2] = light.direction[2];
			_spotLightColorData[i3] = light.color[0];
			_spotLightColorData[i3 + 1] = light.color[1];
			_spotLightColorData[i3 + 2] = light.color[2];
			_spotLightIntensityData[i] = light.intensity;
			_spotLightCutoffData[i] = light.cutoff;
			_spotLightRangeData[i] = light.range;
		}
		Shaders.transparent.setVec3Array(
			"spotLightPositions[0]",
			_spotLightPositionData.subarray(0, numSpotLights * 3),
		);
		Shaders.transparent.setVec3Array(
			"spotLightDirections[0]",
			_spotLightDirectionData.subarray(0, numSpotLights * 3),
		);
		Shaders.transparent.setVec3Array(
			"spotLightColors[0]",
			_spotLightColorData.subarray(0, numSpotLights * 3),
		);
		Shaders.transparent.setFloatArray(
			"spotLightIntensities[0]",
			_spotLightIntensityData.subarray(0, numSpotLights),
		);
		Shaders.transparent.setFloatArray(
			"spotLightCutoffs[0]",
			_spotLightCutoffData.subarray(0, numSpotLights),
		);
		Shaders.transparent.setFloatArray(
			"spotLightRanges[0]",
			_spotLightRangeData.subarray(0, numSpotLights),
		);
	}

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
	// Directional lights (always render - no occlusion for directional)
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	for (const entity of Scene.visibilityCache[EntityTypes.DIRECTIONAL_LIGHT]) {
		entity.render();
	}
	Backend.unbindShader();

	// Get light entities (occlusion queries already ran during geometry pass)
	const pointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT] || [];
	const spotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT] || [];

	// Point lights (with occlusion filtering)
	Shaders.pointLight.bind();
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1);
	for (const light of pointLights) {
		// Skip occluded lights if occlusion enabled
		if (Settings.occlusionCulling && !light.isVisible) {
			continue;
		}
		light.render();
		_renderStats.lightCount++;
	}
	Backend.unbindShader();

	// Spot lights (with occlusion filtering)
	Shaders.spotLight.bind();
	Shaders.spotLight.setInt("positionBuffer", 0);
	Shaders.spotLight.setInt("normalBuffer", 1);
	for (const light of spotLights) {
		// Skip occluded lights if occlusion enabled
		if (Settings.occlusionCulling && !light.isVisible) {
			continue;
		}
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

	Shaders.entityShadows.bind();
	Shaders.entityShadows.setVec3("ambient", Scene.getAmbient());

	// Calculate shadow heights and render mesh shadows
	const meshEntities = Scene.visibilityCache[EntityTypes.MESH];
	for (const entity of meshEntities) {
		if (entity.shadowHeight === null) {
			_calculateShadowHeight(entity);
		}
		entity.renderShadow();
	}
	Backend.unbindShader();

	// Render skinned mesh shadows with dedicated shader
	if (Shaders.skinnedEntityShadows) {
		Shaders.skinnedEntityShadows.bind();
		Shaders.skinnedEntityShadows.setVec3("ambient", Scene.getAmbient());

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
	Shaders.geometry.bind();

	mat4.identity(_matModel);

	Shaders.geometry.setInt("proceduralNoise", 5);
	Shaders.geometry.setInt(
		"doProceduralDetail",
		Settings.proceduralDetail ? 1 : 0,
	);
	Shaders.geometry.setMat4("matWorld", _matModel);

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
				// Skip occluded entities (for MESH and SKINNED_MESH types) if occlusion enabled
				if (
					Settings.occlusionCulling &&
					(type === EntityTypes.MESH || type === EntityTypes.SKINNED_MESH) &&
					!entity.isOccluder
				) {
					if (!entity.isVisible) {
						continue;
					}
				}
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
