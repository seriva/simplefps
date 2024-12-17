import { mat4 } from "../dependencies/gl-matrix.js";
import Camera from "./camera.js";
import Console from "./console.js";
import { Context, gl } from "./context.js";
import { EntityTypes } from "./entity.js";
import Physics from "./physics.js";
import { Shader, Shaders } from "./shaders.js";
import { screenQuad } from "./shapes.js";
import Stats from "./stats.js";

// Cache commonly used values
const viewportSize = [0, 0];
const matModel = mat4.create();
let entities = [];
let ambient = [0.5, 0.5, 0.5];
let pauseUpdate = false;

// Add debug colors for each entity type
const boundingBoxColors = {
	[EntityTypes.SKYBOX]: [0, 0, 1, 1],         // Blue
	[EntityTypes.MESH]: [1, 0, 0, 1],           // Red
	[EntityTypes.FPS_MESH]: [0, 1, 0, 1],       // Green
	[EntityTypes.DIRECTIONAL_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.POINT_LIGHT]: [1, 1, 0, 1],    // Yellow
	[EntityTypes.SPOT_LIGHT]: [1, 1, 0, 1]      // Yellow
};

const visibilityCache = {
	[EntityTypes.SKYBOX]: [],
	[EntityTypes.MESH]: [],
	[EntityTypes.FPS_MESH]: [],
	[EntityTypes.DIRECTIONAL_LIGHT]: [],
	[EntityTypes.POINT_LIGHT]: [],
	[EntityTypes.SPOT_LIGHT]: []
};

let showBoundingVolumes = false;
const toggleBoundingVolumes = () => {
	showBoundingVolumes = !showBoundingVolumes;
};
Console.registerCmd("tbv", toggleBoundingVolumes);

let showWireframes = false;
const toggleWireframes = () => {
	showWireframes = !showWireframes;
};
Console.registerCmd("twf", toggleWireframes);

let showLightVolumes = false;
const toggleLightVolumes = () => {
	showLightVolumes = !showLightVolumes;
};
Console.registerCmd("tlv", toggleLightVolumes);

// Memoize entity selections
const entityCache = new Map();
const getEntities = (type) => {
	if (entityCache.has(type)) return entityCache.get(type);

	const selection = entities.reduce((acc, entity) => {
		if (entity.type === type) acc.push(entity);
		return acc;
	}, []);

	entityCache.set(type, selection);
	return selection;
};

const addEntities = (e) => {
	entityCache.clear(); // Clear cache when entities change
	if (Array.isArray(e)) {
		entities = entities.concat(e);
	} else {
		entities.push(e);
	}
};

const init = () => {
	entities.length = 0;
	Physics.init();
};

const getAmbient = () => ambient;
const setAmbient = (a) => {
	ambient = a;
};

const pause = (doPause) => {
	pauseUpdate = doPause;
};

const update = (frameTime) => {
	if (pauseUpdate) return;
	Physics.update();

	for (const entity of entities) {
		entity.update(frameTime);
	}

	updateVisibility();
};

// Combine common render patterns
const renderEntities = (entityType, renderMethod = "render") => {
	const targetEntities = visibilityCache[entityType];
	for (const entity of targetEntities) {
		entity[renderMethod]();
	}
};

const renderWorldGeometry = () => {
	Shaders.geometry.bind();
	mat4.identity(matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);
	Shaders.geometry.setMat4("matWorld", matModel);

	renderEntities(EntityTypes.SKYBOX);
	renderEntities(EntityTypes.MESH);
	renderEntities(EntityTypes.FPS_MESH);

	Shader.unBind();
};

const renderLighting = () => {
	// Update viewport size once
	viewportSize[0] = Context.width();
	viewportSize[1] = Context.height();

	// Directional lights
	Shaders.directionalLight.bind();
	Shaders.directionalLight.setInt("normalBuffer", 1);
	Shaders.directionalLight.setVec2("viewportSize", viewportSize);
	renderEntities(EntityTypes.DIRECTIONAL_LIGHT);
	Shader.unBind();

	// Pointlights
	Shaders.pointLight.bind();
	Shaders.pointLight.setMat4("matViewProj", Camera.viewProjection);
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1)
	renderEntities(EntityTypes.POINT_LIGHT);
	Shader.unBind();

	// Spotlights
	Shaders.spotLight.bind();
	Shaders.spotLight.setMat4("matViewProj", Camera.viewProjection);
	Shaders.spotLight.setInt("positionBuffer", 0);
	Shaders.spotLight.setInt("normalBuffer", 1);
	renderEntities(EntityTypes.SPOT_LIGHT);
	Shader.unBind();

	// Shadows
	gl.blendFunc(gl.DST_COLOR, gl.ZERO);
	Shaders.applyShadows.bind();
	Shaders.applyShadows.setInt("shadowBuffer", 2);
	Shaders.applyShadows.setVec2("viewportSize", viewportSize);
	screenQuad.renderSingle();
	Shader.unBind();
};

const renderShadows = () => {
	Shaders.entityShadows.bind();
	Shaders.entityShadows.setMat4("matViewProj", Camera.viewProjection);
	Shaders.entityShadows.setVec3("ambient", ambient);

	renderEntities(EntityTypes.MESH, "renderShadow");

	Shader.unBind();
};

const renderFPSGeometry = () => {
	Shaders.geometry.bind();

	mat4.identity(matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);
	Shaders.geometry.setMat4("matWorld", matModel);

	renderEntities(EntityTypes.FPS_MESH);

	Shader.unBind();
};

const renderDebug = () => {
	// Bind shader and set common uniforms
	Shaders.debug.bind();
	Shaders.debug.setMat4("matViewProj", Camera.viewProjection);

	// Enable wireframe mode
	gl.lineWidth(2.0);
	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);

	// Render bounding volumes
	if (showBoundingVolumes) {
		// Render bounding volumes for all visible entities of each type
		for (const type in visibilityCache) {
			Shaders.debug.setVec4("debugColor", boundingBoxColors[type]);
			for (const entity of visibilityCache[type]) {
				entity.renderBoundingBox();
			}
		}
	}

	// Render mesh wireframes
	if (showWireframes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 1, 1]);
		// Render wireframes for all visible entities of each type
		for (const type in visibilityCache) {
			for (const entity of visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Render light volumes
	if (showLightVolumes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 0, 1]);
		const lightTypes = [EntityTypes.POINT_LIGHT, EntityTypes.SPOT_LIGHT];
		for (const type of lightTypes) {
			for (const entity of visibilityCache[type]) {
				entity.renderWireFrame();
			}
		}
	}

	// Reset state
	gl.lineWidth(1.0);
	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);

	// Unbind shader
	Shader.unBind();
};

const updateVisibility = () => {
	entityCache.clear();
	// Reset visibility lists
	for (const type in visibilityCache) {
		visibilityCache[type] = [];
	}

	let visibleMeshCount = 0;
	let visibleLightCount = 0;
	let triangleCount = 0;

	// Sort entities into visible/invisible lists
	for (const entity of entities) {
		if (!entity.boundingBox || entity.boundingBox.isVisible()) {
			visibilityCache[entity.type].push(entity);

			switch (entity.type) {
				case EntityTypes.MESH:
				case EntityTypes.FPS_MESH:
					visibleMeshCount++;
					triangleCount += entity.mesh?.triangleCount || 0;
					break;
				case EntityTypes.POINT_LIGHT:
				case EntityTypes.SPOT_LIGHT:
				case EntityTypes.DIRECTIONAL_LIGHT:
					visibleLightCount++;
					break;
			}
		}
	}

	Stats.setRenderStats(visibleMeshCount, visibleLightCount, triangleCount);
};

const Scene = {
	init,
	pause,
	update,
	getAmbient,
	setAmbient,
	addEntities,
	getEntities,
	renderWorldGeometry,
	renderLighting,
	renderShadows,
	renderFPSGeometry,
	renderDebug,
	visibilityCache
};

export default Scene;
