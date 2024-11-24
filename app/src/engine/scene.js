import { mat4 } from "../dependencies/gl-matrix.js";
import Camera from "./camera.js";
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

// Memoize entity selections
const entityCache = new Map();
const getEntities = (type) => {
	if (entityCache.has(type)) return entityCache.get(type);

	const selection = entities.reduce((acc, entity) => {
		if (entity.type === type) acc.push(entity);
		return acc.concat(entity.getChildren(type));
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

// Reuse common shader setup logic
const setupGeometryShader = () => {
	Shaders.geometry.bind();
	mat4.identity(matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);
	Shaders.geometry.setMat4("matWorld", matModel);
};

// Combine common render patterns
const renderEntities = (entityType, renderMethod = "render") => {
	const targetEntities = getEntities(entityType);
	targetEntities.forEach((entity) => entity[renderMethod]());
};

const renderWorldGeometry = () => {
	setupGeometryShader();
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
	entities.forEach((entity) => {
		entity.update(frameTime);
	});
};

const renderShadows = () => {
	Shaders.entityShadows.bind();
	Shaders.entityShadows.setMat4("matViewProj", Camera.viewProjection);
	Shaders.entityShadows.setVec3("ambient", ambient);

	const meshEntities = getEntities(EntityTypes.MESH);
	meshEntities.forEach((entity) => {
		entity.renderShadow();
	});

	Shader.unBind();
};

const renderFPSGeometry = () => {
	Shaders.geometry.bind();

	mat4.identity(matModel);
	Shaders.geometry.setMat4("matViewProj", Camera.viewProjection);
	Shaders.geometry.setMat4("matWorld", matModel);

	const fpsMeshEntities = getEntities(EntityTypes.FPS_MESH);
	fpsMeshEntities.forEach((entity) => {
		entity.render();
	});

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
};

export default Scene;
