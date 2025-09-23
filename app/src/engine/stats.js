import Camera from "./camera.js";
import Console from "./console.js";
import DOM from "./dom.js";

DOM.css({
	"#stats": {
		margin: 0,
		padding: 0,
		backgroundColor: "transparent",
	},
	".stats-info": {
		marginLeft: "5px",
	},
	"#stats-basic": {
		fontSize: "12px",
		color: "#FFF",
		left: "8px",
		top: "8px",
		zIndex: 2001,
		position: "absolute",
	},
	"#stats-scene": {
		fontSize: "12px",
		color: "#FFF",
		left: "8px",
		top: "24px",
		zIndex: 2001,
		position: "absolute",
	},
	"#stats-pos": {
		color: "#FFF",
		fontSize: "12px",
		left: "8px",
		top: "40px",
		zIndex: 2001,
		position: "absolute",
	},
});

const state = {
	fps: 0,
	frameTime: 0,
	memory: 0,
	visible: true,
	prevTime: 0,
	frames: 0,
	visibleMeshes: 0,
	visibleLights: 0,
	triangles: 0,
};

const createStatsDOM = () =>
	DOM.h(
		"div#stats",
		state.visible
			? [
					DOM.h("div#stats-basic", [
						DOM.h("span", [
							`${state.fps}fps - ${Math.round(state.frameTime)}ms - ${state.memory}mb`,
						]),
					]),
					DOM.h("div#stats-scene", [
						DOM.h("span", [
							`m:${state.visibleMeshes} - l:${state.visibleLights} - t:${state.triangles}`,
						]),
					]),
					DOM.h("div#stats-pos", [
						DOM.h("span", [
							`xyz:${Camera.position.map((v) => Math.round(v)).join(",")}`,
						]),
					]),
				]
			: [],
	);

const toggle = (show) => {
	state.visible = show ?? !state.visible;
	return state.visible;
};

Console.registerCmd("stats", toggle);

let lastUpdate = performance.now();
const updateStats = () => {
	const now = performance.now();
	if (now - lastUpdate >= 1000) {
		state.fps = state.frames;
		state.frames = 0;
		state.memory = performance.memory
			? Math.round(performance.memory.usedJSHeapSize / 1048576)
			: 0;
		lastUpdate = now;
	}
};

DOM.append(createStatsDOM);

const Stats = {
	toggle,
	update() {
		const now = performance.now();
		state.frameTime = now - (state.prevTime || now);
		state.prevTime = now;
		state.frames++;
		updateStats();
	},
	setRenderStats(meshCount, lightCount, triangleCount) {
		state.visibleMeshes = meshCount;
		state.visibleLights = lightCount;
		state.triangles = triangleCount;
	},
};

export default Stats;
