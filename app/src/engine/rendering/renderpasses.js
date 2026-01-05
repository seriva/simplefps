import { mat4 } from "../../dependencies/gl-matrix.js";
import Settings from "../core/settings.js";
import { EntityTypes } from "../scene/entity.js";
import Scene from "../scene/scene.js";
import Console from "../systems/console.js";
import { Backend, gl } from "./context.js";
import { Shaders } from "./shaders.js";
import { screenQuad } from "./shapes.js";

// Private constants
const _matModel = mat4.create();
const _lightMatrix = mat4.create();
const _lightPos = [0, 0, 0];

// Debug state
let _showBoundingVolumes = false;
let _showWireframes = false;
let _showLightVolumes = false;

// Debug colors for each entity type
const _boundingBoxColors = {
	[EntityTypes.SKYBOX]: [0, 0, 1, 1], // Blue
	[EntityTypes.MESH]: [1, 0, 0, 1], // Red
	[EntityTypes.FPS_MESH]: [0, 1, 0, 1], // Green
	[EntityTypes.DIRECTIONAL_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.POINT_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.SPOT_LIGHT]: [1, 1, 0, 1], // Yellow
};

// Toggle functions for debug commands
const toggleBoundingVolumes = () => {
	_showBoundingVolumes = !_showBoundingVolumes;
};

const toggleWireframes = () => {
	_showWireframes = !_showWireframes;
};

const toggleLightVolumes = () => {
	_showLightVolumes = !_showLightVolumes;
};

// Register console commands
Console.registerCmd("tbv", toggleBoundingVolumes);
Console.registerCmd("twf", toggleWireframes);
Console.registerCmd("tlv", toggleLightVolumes);

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
	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);

	_renderEntities(EntityTypes.SKYBOX);

	// Restore gl state
	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);
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
};

const renderTransparent = () => {
	Shaders.transparent.bind();
	mat4.identity(_matModel);

	Shaders.transparent.setMat4("matWorld", _matModel);
	Shaders.transparent.setInt("colorSampler", 0);

	// Collect and pass point lights (max 8)
	const MAX_POINT_LIGHTS = 8;
	const visiblePointLights = Scene.visibilityCache[EntityTypes.POINT_LIGHT];
	const numPointLights = Math.min(visiblePointLights.length, MAX_POINT_LIGHTS);
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

	// Collect and pass spot lights (max 4)
	const MAX_SPOT_LIGHTS = 4;
	const visibleSpotLights = Scene.visibilityCache[EntityTypes.SPOT_LIGHT];
	const numSpotLights = Math.min(visibleSpotLights.length, MAX_SPOT_LIGHTS);
	Shaders.transparent.setInt("numSpotLights", numSpotLights);

	for (let i = 0; i < numSpotLights; i++) {
		const light = visibleSpotLights[i];
		Shaders.transparent.setVec3(`spotLightPositions[${i}]`, light.position);
		Shaders.transparent.setVec3(`spotLightDirections[${i}]`, light.direction);
		Shaders.transparent.setVec3(`spotLightColors[${i}]`, light.color);
		Shaders.transparent.setFloat(`spotLightIntensities[${i}]`, light.intensity);
		Shaders.transparent.setFloat(`spotLightCutoffs[${i}]`, light.cutoff);
		Shaders.transparent.setFloat(`spotLightRanges[${i}]`, light.range);
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

	// Apply shadows
	gl.blendFunc(gl.DST_COLOR, gl.ZERO);
	Shaders.applyShadows.bind();
	Shaders.applyShadows.setInt("shadowBuffer", 2);
	screenQuad.renderSingle();
	Backend.unbindShader();
};

const renderShadows = () => {
	Shaders.entityShadows.bind();
	Shaders.entityShadows.setVec3("ambient", Scene.getAmbient());

	_renderEntities(EntityTypes.MESH, "renderShadow");

	Backend.unbindShader();
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
	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);

	// Render bounding volumes
	if (_showBoundingVolumes) {
		for (const type in Scene.visibilityCache) {
			Shaders.debug.setVec4("debugColor", _boundingBoxColors[type]);
			for (const entity of Scene.visibilityCache[type]) {
				entity.renderBoundingBox(gl.LINES);
			}
		}
	}

	// Render mesh wireframes
	if (_showWireframes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 1, 1]);
		const meshTypes = [
			EntityTypes.MESH,
			EntityTypes.FPS_MESH,
			EntityTypes.SKYBOX,
		];
		for (const type of meshTypes) {
			for (const entity of Scene.visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Render light volumes
	if (_showLightVolumes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 0, 1]);
		const lightTypes = [EntityTypes.POINT_LIGHT, EntityTypes.SPOT_LIGHT];
		for (const type of lightTypes) {
			for (const entity of Scene.visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Reset state
	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);

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
	toggleBoundingVolumes,
	toggleWireframes,
	toggleLightVolumes,
};

export default RenderPasses;
