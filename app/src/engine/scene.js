import { mat4 } from "../dependencies/gl-matrix.js";
import Camera from "./camera.js";
import Console from "./console.js";
import { Context, gl } from "./context.js";
import { EntityTypes } from "./entity.js";
import Physics from "./physics.js";
import { Shader, Shaders } from "./shaders.js";
import { screenQuad } from "./shapes.js";

// Cache commonly used values
const viewportSize = [0, 0];
const matModel = mat4.create();
let entities = [];
let ambient = [0.5, 0.5, 0.5];
let pauseUpdate = false;

let showBoundingBoxes = false;
const toggleBoundingBoxes = () => {
	showBoundingBoxes = !showBoundingBoxes;
};
Console.registerCmd("togglebv", toggleBoundingBoxes);

let showWireframes = false;
const toggleWireframes = () => {
	showWireframes = !showWireframes;
};
Console.registerCmd("togglewf", toggleWireframes);

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

// Combine common render patterns
const renderEntities = (entityType, renderMethod = "render") => {
	const targetEntities = getEntities(entityType);
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
	Shaders.directionalLight.setInt("positionBuffer", 0);
	Shaders.directionalLight.setInt("normalBuffer", 1);
	Shaders.directionalLight.setVec2("viewportSize", viewportSize);
	renderEntities(EntityTypes.DIRECTIONAL_LIGHT);
	Shader.unBind();

	// Pointlights
	gl.cullFace(gl.FRONT);
	Shaders.pointLight.bind();
	Shaders.pointLight.setMat4("matViewProj", Camera.viewProjection);
	Shaders.pointLight.setInt("positionBuffer", 0);
	Shaders.pointLight.setInt("normalBuffer", 1);
	Shaders.pointLight.setInt("shadowBuffer", 2);
	renderEntities(EntityTypes.POINT_LIGHT);
	Shader.unBind();
	gl.cullFace(gl.BACK);

	// Shadows
	gl.blendFunc(gl.DST_COLOR, gl.ZERO);
	Shaders.applyShadows.bind();
	Shaders.applyShadows.setInt("shadowBuffer", 2);
	Shaders.applyShadows.setVec2("viewportSize", viewportSize);
	screenQuad.renderSingle();
	Shader.unBind();
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
};

const renderShadows = () => {
	Shaders.entityShadows.bind();
	Shaders.entityShadows.setMat4("matViewProj", Camera.viewProjection);
	Shaders.entityShadows.setVec3("ambient", ambient);

	const meshEntities = getEntities(EntityTypes.MESH);
	for (const entity of meshEntities) {
		entity.renderShadow();
	}

	Shader.unBind();
};

const renderFPSGeometry = () => {
	Shaders.geometry.bind();

	mat4.identity(matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);
	Shaders.geometry.setMat4("matWorld", matModel);

	const fpsMeshEntities = getEntities(EntityTypes.FPS_MESH);
	for (const entity of fpsMeshEntities) {
		entity.render();
	}

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

	// Render all bounding boxes
	if (showBoundingBoxes) {
		Shaders.debug.setVec4("debugColor", [1, 0, 0, 1]);
		for (const entity of entities) {
			entity.renderBoundingBox();
		}
	}

	// Render wireframes
	if (showWireframes) {
		Shaders.debug.setVec4("debugColor", [1, 1, 1, 1]);
		for (const entity of entities) {
		if (entity.type === EntityTypes.MESH || entity.type === EntityTypes.FPS_MESH) {
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
	renderDebug
};

export default Scene;
