import { mat4 } from "../../dependencies/gl-matrix.js";
import Settings from "../core/settings.js";
import { EntityTypes } from "../scene/entity.js";
import Scene from "../scene/scene.js";
import Console from "../systems/console.js";
import Stats from "../systems/stats.js";
import { Backend } from "./backend.js";
import { Shaders } from "./shaders.js";
import Shapes from "./shapes.js";

// Private constants
const _matModel = mat4.create();
const _lightMatrix = mat4.create();
const _lightPos = [0, 0, 0];

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

// Helper to render entities
const _renderEntities = (
	entityType,
	renderMethod = "render",
	mode = "all",
	shader = Shaders.geometry,
) => {
	const targetEntities = Scene.visibilityCache[entityType];
	for (const entity of targetEntities) {
		entity[renderMethod](mode, shader);
	}
};

const _performOcclusionQueries = (entities) => {
	const cube = Shapes.occlusionCube;
	if (!cube) return;

	// Save state and set up for occlusion queries
	Backend.setColorMask(false, false, false, false);
	Backend.setDepthState(true, false, "lequal"); // Test enabled, Write disabled
	Backend.setCullState(false); // Disable culling - important when camera is near/inside bbox

	Shaders.debug.bind();
	Shaders.debug.setVec4("debugColor", [0, 1, 0, 0]);

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

		// STEP 2: Issue NEW query for THIS frame
		Backend.beginQuery(writeQuery);
		Shaders.debug.setMat4("matWorld", entity.boundingBox.transformMatrix);
		cube.renderSingle(false, "triangles", "all", Shaders.debug);
		Backend.endQuery(writeQuery);

		// STEP 3: Advance frame counter (cap to prevent overflow, reset to minimum ready state)
		entity._occQueryFrame++;
		if (entity._occQueryFrame > 1000) {
			entity._occQueryFrame = 6; // Reset to minimum "ready" state
		}
	}

	Backend.unbindShader();

	// Restore state
	Backend.setColorMask(true, true, true, true);
	Backend.setDepthState(true, true);
	Backend.setCullState(true);
};

const renderSkybox = () => {
	// Disable depth operations for skybox
	Backend.setDepthState(false, false);

	_renderEntities(EntityTypes.SKYBOX);

	// Restore gl state
	Backend.setDepthState(true, true);
};

const renderWorldGeometry = () => {
	// Reset render stats for this frame
	_renderStats.meshCount = 0;
	_renderStats.lightCount = 0;
	_renderStats.triangleCount = 0;

	Shaders.geometry.bind();
	mat4.identity(_matModel);

	Shaders.geometry.setInt("detailNoise", 5);
	Shaders.geometry.setInt("doDetailTexture", Settings.detailTexture ? 1 : 0);
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
		entity.render("opaque", Shaders.geometry);
		_renderStats.meshCount++;
		_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
	}

	Backend.unbindShader();

	// IMPORTANT: Perform Occlusion Queries HERE, right after occluders
	// The depth buffer now contains ONLY occluder geometry
	// This is when we test if occludees and lights would be visible
	if (Settings.occlusionCulling) {
		// Query mesh occludees
		_performOcclusionQueries(_occludees);

		// Query lights for occlusion culling
		const pointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT] || [];
		const spotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT] || [];
		_performOcclusionQueries(pointLights);
		_performOcclusionQueries(spotLights);
	}

	Shaders.geometry.bind();
	Shaders.geometry.setMat4("matWorld", _matModel);

	// Render Occludees (only visible ones if occlusion enabled)
	for (const entity of _occludees) {
		if (Settings.occlusionCulling && !entity.isVisible) {
			continue;
		}
		entity.render("opaque", Shaders.geometry);
		_renderStats.meshCount++;
		_renderStats.triangleCount += entity.mesh?.triangleCount || 0;
	}

	_renderEntities(EntityTypes.FPS_MESH, "render", "opaque");

	Backend.unbindShader();

	// Render skinned meshes with dedicated shader
	if (Shaders.skinnedGeometry) {
		const skinnedEntities = Scene.visibilityCache[EntityTypes.SKINNED_MESH];

		// Perform occlusion queries for skinned meshes BEFORE rendering them
		if (Settings.occlusionCulling) {
			const skinnedOccludees = skinnedEntities.filter((e) => !e.isOccluder);
			_performOcclusionQueries(skinnedOccludees);
		}

		Shaders.skinnedGeometry.bind();
		Shaders.skinnedGeometry.setInt("detailNoise", 5);
		Shaders.skinnedGeometry.setInt(
			"doDetailTexture",
			Settings.detailTexture ? 1 : 0,
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
			entity.render("opaque", Shaders.skinnedGeometry);
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

	const MAX_POINT_LIGHTS = 8;
	const visiblePointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT];
	const numPointLights = Math.min(visiblePointLights.length, MAX_POINT_LIGHTS);

	const MAX_SPOT_LIGHTS = 4;
	const visibleSpotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT];
	const numSpotLights = Math.min(visibleSpotLights.length, MAX_SPOT_LIGHTS);

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
		// WebGL Fallback
		Shaders.transparent.setInt("numPointLights", numPointLights);

		for (let i = 0; i < numPointLights; i++) {
			const light = visiblePointLights[i];
			mat4.multiply(_lightMatrix, light.base_matrix, light.ani_matrix);
			mat4.getTranslation(_lightPos, _lightMatrix);
			Shaders.transparent.setVec3(`pointLightPositions[${i}]`, _lightPos);
			Shaders.transparent.setVec3(`pointLightColors[${i}]`, light.color);
			Shaders.transparent.setFloat(`pointLightSizes[${i}]`, light.size);
			Shaders.transparent.setFloat(
				`pointLightIntensities[${i}]`,
				light.intensity,
			);
		}

		Shaders.transparent.setInt("numSpotLights", numSpotLights);

		for (let i = 0; i < numSpotLights; i++) {
			const light = visibleSpotLights[i];
			Shaders.transparent.setVec3(`spotLightPositions[${i}]`, light.position);
			Shaders.transparent.setVec3(`spotLightDirections[${i}]`, light.direction);
			Shaders.transparent.setVec3(`spotLightColors[${i}]`, light.color);
			Shaders.transparent.setFloat(
				`spotLightIntensities[${i}]`,
				light.intensity,
			);
			Shaders.transparent.setFloat(`spotLightCutoffs[${i}]`, light.cutoff);
			Shaders.transparent.setFloat(`spotLightRanges[${i}]`, light.range);
		}
	}

	_renderEntities(
		EntityTypes.MESH,
		"render",
		"translucent",
		Shaders.transparent,
	);

	Backend.unbindShader();
};

const renderLighting = () => {
	// Directional lights (always render - no occlusion for directional)
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	_renderEntities(EntityTypes.DIRECTIONAL_LIGHT);
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
	Shaders.entityShadows.bind();
	Shaders.entityShadows.setVec3("ambient", Scene.getAmbient());
	_renderEntities(EntityTypes.MESH, "renderShadow");
	Backend.unbindShader();

	// Render skinned mesh shadows with dedicated shader
	if (Shaders.skinnedEntityShadows) {
		Shaders.skinnedEntityShadows.bind();
		Shaders.skinnedEntityShadows.setVec3("ambient", Scene.getAmbient());
		_renderEntities(
			EntityTypes.SKINNED_MESH,
			"renderShadow",
			"all",
			Shaders.skinnedEntityShadows,
		);
		Backend.unbindShader();
	}
};

const renderFPSGeometry = () => {
	Shaders.geometry.bind();

	mat4.identity(_matModel);

	Shaders.geometry.setInt("detailNoise", 5);
	Shaders.geometry.setInt("doDetailTexture", Settings.detailTexture ? 1 : 0);
	Shaders.geometry.setMat4("matWorld", _matModel);

	_renderEntities(EntityTypes.FPS_MESH);

	Backend.unbindShader();
};

const renderDebug = () => {
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

// Public RenderPasses API
const RenderPasses = {
	renderWorldGeometry,
	renderTransparent,
	renderLighting,
	renderShadows,
	renderFPSGeometry,
	renderDebug,
};

export default RenderPasses;
