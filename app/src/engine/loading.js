import DOM from "./dom.js";

// Constants for shared values
const ZINDEX_BASE = 2000;
const LOGO_SIZE = "30vh";
const LOGO_OFFSET = "-15vh";

DOM.css({
	"#loading": {
		zIndex: ZINDEX_BASE,
	},

	"#loading-background": {
		width: "100%",
		height: "100%",
		position: "absolute",
		left: "0px",
		top: "0px",
		margin: 0,
		padding: 0,
		backgroundColor: "black",
		zIndex: ZINDEX_BASE + 1,
	},

	"#loading-logo": {
		position: "fixed",
		width: LOGO_SIZE,
		height: LOGO_SIZE,
		top: "50%",
		left: "50%",
		marginTop: LOGO_OFFSET,
		marginLeft: LOGO_OFFSET,
		content: "url(resources/logo.svg)",
		zIndex: ZINDEX_BASE + 2,
	},
});

// State management
const state = {
	isVisible: false,
	forceUntilReload: false,
};

// Memoized animation config
const _SPIN_ANIMATION = {
	transform: ["rotateZ(360deg)", "rotateZ(0deg)"],
	options: {
		duration: 3000,
		delay: 0,
		easing: "linear",
		repeat: true,
	},
};

// Cache DOM element
const _bar = DOM.h("div#loading-bar");

// Optimize render function
const renderLoading = () =>
	DOM.h(
		"div#loading",
		state.isVisible
			? [DOM.h("div#loading-logo"), DOM.h("div#loading-background")]
			: [],
	);

DOM.append(renderLoading);

const Loading = {
	toggle(visible, force) {
		if (state.forceUntilReload) return;
		if (state.isVisible && visible) return;

		state.isVisible = visible;
		if (force != null) state.forceUntilReload = force;

		DOM.update();
	},
};

export default Loading;
