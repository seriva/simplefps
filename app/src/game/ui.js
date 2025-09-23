import { DOM } from "../engine/engine.js";

// Consolidated styles with common properties
const styles = {
	"#ui": {
		backgroundColor: "transparent",
	},

	"#menu-base": {
		transform: "translate(-50%, -50%)",
		position: "absolute",
		top: "50%",
		left: "50%",
		backgroundColor: "#999",
		border: "2px solid #fff",
		color: "#fff",
		padding: "10px 10px 0",
		fontSize: "16px",
		maxWidth: "500px",
		userSelect: "none",
		zIndex: 1000,
		display: "block",
		opacity: 0,
	},

	"#menu-header": {
		fontSize: "18px",
		textAlign: "center",
		marginBottom: "10px",
	},

	".menu-button": {
		textAlign: "center",
		border: "2px solid #fff",
		backgroundColor: "#999",
		marginBottom: "10px",
		padding: "10px",
		cursor: "pointer",
	},

	".menu-button:hover": {
		backgroundColor: "#888",
	},
};

DOM.css(styles);

// State management
const state = {
	isVisible: false,
	current: "",
	uis: {},
};

// Shared animation options to reduce duplication
const baseAnimationOptions = {
	mobileHA: false,
	duration: 150,
	delay: 0,
	easing: "linear",
};

// Simplified animations object
const animations = {
	enter: {
		properties: { opacity: 0.9 },
		options: baseAnimationOptions,
	},
	exit: {
		properties: { opacity: 0 },
		options: baseAnimationOptions,
	},
};

// Memoized menu base render function
const renderMenuBase = () => {
	const currentUI = state.uis[state.current];

	return DOM.h(
		"div#menu-base",
		{
			enterAnimation: (el) =>
				DOM.animate(el, animations.enter.properties, animations.enter.options),
			exitAnimation: (el, remove) =>
				DOM.animate(el, animations.exit.properties, {
					...animations.exit.options,
					complete: remove,
				}),
		},
		[
			DOM.h("div#menu-header", [currentUI.header]),
			currentUI.controls.map(({ text, callback }) =>
				DOM.h("div.menu-button", { key: text, onclick: callback }, [text]),
			),
		],
	);
};

// Main UI render
DOM.append(() => DOM.h("div#ui", state.isVisible ? [renderMenuBase()] : []));

// Public API
const UI = {
	register: (name, ui) => {
		state.uis[name] = ui;
	},
	show: (name) => {
		state.isVisible = false;
		DOM.update();
		state.current = name;
		state.isVisible = true;
	},
	hide: () => {
		state.isVisible = false;
	},
};

export default UI;
