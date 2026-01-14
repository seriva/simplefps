import { mat4 } from "../../dependencies/gl-matrix.js";
import Settings from "../core/settings.js";
import { EntityTypes } from "../scene/entity.js";
import Scene from "../scene/scene.js";
import Console from "../systems/console.js";
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

// Register console commands
Console.registerCmd("tbv", toggleBoundingVolumes);
Console.registerCmd("twf", toggleWireframes);
Console.registerCmd("tlv", toggleLightVolumes);
Console.registerCmd("tsk", toggleSkeleton);

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

const renderSkybox = () => {
	// Disable depth operations for skybox
	Backend.setDepthState(false, false);

	_renderEntities(EntityTypes.SKYBOX);

	// Restore gl state
	Backend.setDepthState(true, true);
};

const renderWorldGeometry = () => {
	Shaders.geometry.bind();
	mat4.identity(_matModel);

	Shaders.geometry.setInt("detailNoise", 5);
	Shaders.geometry.setInt("doDetailTexture", Settings.detailTexture ? 1 : 0);
	Shaders.geometry.setMat4("matWorld", _matModel);

	// Render skybox with special GL state
	renderSkybox();

	// Render opaque materials
	_renderEntities(EntityTypes.MESH, "render", "opaque");
	_renderEntities(EntityTypes.FPS_MESH, "render", "opaque");

	Backend.unbindShader();

	// Render skinned meshes with dedicated shader
	if (Shaders.skinnedGeometry) {
		Shaders.skinnedGeometry.bind();
		Shaders.skinnedGeometry.setInt("detailNoise", 5);
		Shaders.skinnedGeometry.setInt(
			"doDetailTexture",
			Settings.detailTexture ? 1 : 0,
		);
		_renderEntities(
			EntityTypes.SKINNED_MESH,
			"render",
			"opaque",
			Shaders.skinnedGeometry,
		);
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
	// Directional lights
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	_renderEntities(EntityTypes.DIRECTIONAL_LIGHT);
	Backend.unbindShader();

	// Point lights
	Shaders.pointLight.bind();
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1);
	_renderEntities(EntityTypes.POINT_LIGHT);
	Backend.unbindShader();

	// Spot lights
	Shaders.spotLight.bind();
	Shaders.spotLight.setInt("positionBuffer", 0);
	Shaders.spotLight.setInt("normalBuffer", 1);
	_renderEntities(EntityTypes.SPOT_LIGHT);
	Backend.unbindShader();
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
