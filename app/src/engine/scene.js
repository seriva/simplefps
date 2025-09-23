import { mat4 } from "../dependencies/gl-matrix.js";
import Camera from "./camera.js";
import Console from "./console.js";
import { Context, gl } from "./context.js";
import { EntityTypes } from "./entity.js";
import Physics from "./physics.js";
import { Shader, Shaders } from "./shaders.js";
import { screenQuad } from "./shapes.js";
import Stats from "./stats.js";

// Add constants at the top after imports
const DEFAULT_AMBIENT = [0.5, 0.5, 0.5];

// Cache commonly used values
const viewportSize = [0, 0];
const matModel = mat4.create();
let entities = [];
let ambient = DEFAULT_AMBIENT;
let pauseUpdate = false;

// Add debug colors for each entity type
const boundingBoxColors = {
	[EntityTypes.SKYBOX]: [0, 0, 1, 1], // Blue
	[EntityTypes.MESH]: [1, 0, 0, 1], // Red
	[EntityTypes.FPS_MESH]: [0, 1, 0, 1], // Green
	[EntityTypes.DIRECTIONAL_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.POINT_LIGHT]: [1, 1, 0, 1], // Yellow
	[EntityTypes.SPOT_LIGHT]: [1, 1, 0, 1], // Yellow
};

const visibilityCache = {
	[EntityTypes.SKYBOX]: [],
	[EntityTypes.MESH]: [],
	[EntityTypes.FPS_MESH]: [],
	[EntityTypes.DIRECTIONAL_LIGHT]: [],
	[EntityTypes.POINT_LIGHT]: [],
	[EntityTypes.SPOT_LIGHT]: [],
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
	if (!e) {
		console.warn("Attempted to add null/undefined entity");
		return;
	}

	entityCache.clear();
	if (Array.isArray(e)) {
		entities = entities.concat(e.filter((entity) => entity != null));
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
	if (
		!Array.isArray(a) ||
		a.length !== 3 ||
		!a.every((v) => typeof v === "number")
	) {
		console.warn("Invalid ambient light values. Expected array of 3 numbers.");
		return;
	}
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
	Shaders.pointLight.setInt("normalBuffer", 1);
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
		// Only render wireframes for mesh entities
		const meshTypes = [
			EntityTypes.MESH,
			EntityTypes.FPS_MESH,
			EntityTypes.SKYBOX,
		];
		for (const type of meshTypes) {
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
	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);

	// Unbind shader
	Shader.unBind();
};

const updateVisibility = () => {
	entityCache.clear();
	const stats = {
		visibleMeshCount: 0,
		visibleLightCount: 0,
		triangleCount: 0,
	};

	// Reset visibility lists
	for (const type of Object.keys(visibilityCache)) {
		visibilityCache[type] = [];
	}

	// Sort entities into visible/invisible lists
	for (let i = 0; i < entities.length; i++) {
		const entity = entities[i];
		if (!entity.boundingBox || entity.boundingBox.isVisible()) {
			visibilityCache[entity.type].push(entity);

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
	visibilityCache,
};

export default Scene;
