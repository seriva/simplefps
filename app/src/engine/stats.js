import Camera from "./camera.js";
import Console from "./console.js";
import DOM from "./dom.js";

DOM.css({
	"#stats": {
		margin: 0,
		padding: 0,
		backgroundColor: "transparent",
	},
	"#stats-text": {
		fontSize: "12px",
		color: "#FFF",
		left: "8px",
		top: "8px",
		zIndex: 2001,
		position: "absolute",
	},
	".stats-info": {
		marginLeft: "5px",
	},
	"#stats-pos": {
		color: "#FFF",
		fontSize: "12px",
		left: "13px",
		top: "24px",
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
};

const createStatsDOM = () =>
	DOM.h(
		"div#stats",
		state.visible
			? [
					DOM.h("div#stats-text", [
						DOM.h("span.stats-info", [`${state.fps}fps`]),
						DOM.h("span.stats-info", [`${Math.round(state.frameTime)}ms`]),
						DOM.h("span.stats-info", [`${state.memory}mb`]),
					]),
					DOM.h("div#stats-pos", [
						DOM.h("span", [
							`xyz: ${Math.round(Camera.position[0])},${Math.round(Camera.position[1])},${Math.round(Camera.position[2])}`,
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
};

export default Stats;
