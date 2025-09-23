import DOM from "./dom.js";

// Constants
const CONSOLE_DEFAULTS = {
	HEIGHT: "35vh",
	BACKGROUND: "#999",
	TEXT_COLOR: "#fff",
	WARNING_COLOR: "#FF0",
	FONT_SIZE: "14px",
	ANIMATION_DURATION: 150,
};

// Module-level state and functions
let visible = false;
let command = "";
const logs = [];
const commandHistory = [];
let historyIndex = -1;

function updateCommand(event) {
	if (event.data === "`") return;
	command = event.target.value;
	historyIndex = -1;
	DOM.update();
}

function handleKeyDown(event) {
	if (event.key === "ArrowUp" || event.key === "ArrowDown") {
		event.preventDefault();

		if (commandHistory.length === 0) return;

		if (event.key === "ArrowUp") {
			historyIndex =
				historyIndex === -1
					? commandHistory.length - 1
					: Math.max(0, historyIndex - 1);
		} else {
			historyIndex =
				historyIndex === -1
					? -1
					: Math.min(commandHistory.length - 1, historyIndex + 1);
		}

		command = historyIndex === -1 ? "" : commandHistory[historyIndex];
		DOM.update();
	}
}

DOM.css({
	"#console": {},
	"#console-body": {
		display: "inline-block",
		backgroundColor: "transparent",
		position: "absolute",
		width: "100%",
		height: "35%",
		left: 0,
		overflow: "none",
		zIndex: "2500",
		top: "-35vh",
	},
	"#console-content": {
		display: "flex",
		flexDirection: "column-reverse",
		column: "nowrap",
		border: "1px solid #999",
		backgroundColor: "#999",
		opacity: 0.9,
		width: "100%",
		height: "100%",
		overflow: "scroll",
		overflowX: "hidden",
	},
	"#console-content p": {
		fontSize: "14px",
		color: "#fff",
		width: "100%",
		whiteSpace: "nowrap",
		margin: "0px",
		lineHeight: "115%",
	},
	"#console-input": {
		display: "flex",
		color: "#fff",
		fontSize: "14px",
		position: "absolute",
		left: 0,
		width: "100%",
		border: "1px solid #999",
		borderBottom: "2px solid #fff",
		borderTop: "2px solid #fff",
		backgroundColor: "#999",
		opacity: 0.75,
		outline: "none",
		fontWeight: "bold",
	},
});

// Simplified command parsing
const CommandParser = {
	parse(cmd) {
		if (cmd.includes("=")) {
			const [variable, value] = cmd.split("=").map((s) => s.trim());
			return { type: "assignment", variable, value };
		}

		if (cmd.includes("(")) {
			const [func, paramString] = cmd.split("(");
			const params = JSON.parse(`[${paramString.replace(")", "")}]`);
			return { type: "function", func: func.trim(), params };
		}

		throw new Error("Invalid command format");
	},
};

// Simplified object utilities
const ObjectUtils = {
	getPath(path) {
		const parts = path.split(".");
		let obj = window[parts[0]];

		// Check if initial object exists
		if (!obj) return null;

		for (let i = 1; i < parts.length && obj; i++) {
			obj = obj[parts[i]];
			// If any part of the path is undefined, return null
			if (obj === undefined) return null;
		}
		return obj;
	},

	pathExists(path) {
		return this.getPath(path) !== null;
	},

	setValue(path, value) {
		const parts = path.split(".");
		const target = parts.pop();
		const obj = this.getPath(parts.join("."));

		if (!obj) throw new Error(`Path "${path}" does not exist`);
		obj[target] = value;
	},

	callFunction(path, params) {
		const parts = path.split(".");
		const funcName = parts.pop();
		const obj = this.getPath(parts.join("."));

		if (!obj) throw new Error(`Path "${parts.join(".")}" does not exist`);
		if (typeof obj[funcName] !== "function") {
			throw new Error(`"${funcName}" is not a function`);
		}

		obj[funcName](...params);
	},
};

// Console UI components
const ConsoleUI = {
	setFocus: (el) =>
		setTimeout(() => {
			el.disabled = false;
			el.focus();
		}, 100),

	setScrollPos: (el) => {
		el.scrollTop = el.scrollHeight;
	},

	renderConsole(visible, command, logs) {
		if (!visible) return DOM.h("div#console", []);

		return DOM.h("div#console", [
			DOM.h(
				"div#console-body",
				{
					enterAnimation: (el) =>
						DOM.animate(
							el,
							{ top: 0 },
							{
								duration: CONSOLE_DEFAULTS.ANIMATION_DURATION,
								easing: "ease-in-out",
							},
						),
					exitAnimation: (el, remove) =>
						DOM.animate(
							el,
							{ top: `-${CONSOLE_DEFAULTS.HEIGHT}` },
							{
								duration: CONSOLE_DEFAULTS.ANIMATION_DURATION,
								easing: "ease-in-out",
								complete: remove,
							},
						),
				},
				[
					DOM.h("div#console-content", { onchange: ConsoleUI.setScrollPos }, [
						DOM.h(
							"p",
							logs.map((log, index) =>
								DOM.h("span", { key: index, style: `color: ${log.color}` }, [
									log.message,
									DOM.h("br"),
								]),
							),
						),
					]),
					DOM.h("input#console-input", {
						disabled: true,
						value: command,
						oninput: updateCommand,
						onkeydown: handleKeyDown,
						afterCreate: ConsoleUI.setFocus,
					}),
				],
			),
		]);
	},
};

// Main Console object
const Console = {
	toggle(show) {
		visible = show ?? !visible;
		DOM.update();
	},

	isVisible() {
		return visible;
	},

	log(message) {
		console.log(message);
		logs.push({ color: CONSOLE_DEFAULTS.TEXT_COLOR, message });
	},

	warn(message) {
		console.warn(message);
		logs.push({ color: CONSOLE_DEFAULTS.WARNING_COLOR, message });
	},

	error(message) {
		throw new Error(message);
	},

	registerCmd(name, value) {
		window.simplefps[name.toLowerCase()] = value;
	},

	executeCmd() {
		if (!command) return;

		try {
			this.log(command);

			if (
				commandHistory.length === 0 ||
				commandHistory[commandHistory.length - 1] !== command
			) {
				commandHistory.push(command);
			}

			const cmd = `simplefps.${command}`;
			const parsed = CommandParser.parse(cmd);

			// Validate path exists before executing
			if (parsed.type === "assignment") {
				const varPath = parsed.variable.replace("simplefps.", "");
				if (!ObjectUtils.pathExists(`simplefps.${varPath}`)) {
					throw new Error(`Variable "${varPath}" does not exist`);
				}
				ObjectUtils.setValue(parsed.variable, parsed.value);
			} else {
				const pathToCheck = parsed.func.split(".").slice(0, -1).join(".");
				if (!ObjectUtils.pathExists(pathToCheck)) {
					throw new Error(`Function path "${pathToCheck}" does not exist`);
				}
				ObjectUtils.callFunction(parsed.func, parsed.params);
			}
		} catch (error) {
			Console.warn(`Failed to execute command: ${error}`);
		}

		command = "";
		historyIndex = -1;
		DOM.update();
	},
};

// Initialize
window.simplefps = {};
Console.executeCmd = Console.executeCmd.bind(Console);
DOM.append(() => ConsoleUI.renderConsole(visible, command, logs));

export default Console;
