import { css, html, Reactive } from "./reactive.js";

// Constants
const CONSOLE_DEFAULTS = {
	HEIGHT: "35vh",
	BACKGROUND: "#999",
	TEXT_COLOR: "#fff",
	WARNING_COLOR: "#FF0",
	FONT_SIZE: "14px",
	ANIMATION_DURATION: 150,
};

// Console Component
class ConsoleUI extends Reactive.Component {
	constructor() {
		super();
		this.commandHistory = [];
		this.historyIndex = -1;
	}

	state() {
		return {
			visible: false,
			command: "",
			logs: [],
		};
	}

	styles() {
		return css`
			.console-body {
				display: inline-block;
				background-color: transparent;
				position: absolute;
				width: 100%;
				height: 45%;
				left: 0;
				top: 0;
				overflow: hidden;
				z-index: 2500;
				transform: translateY(-100%);
				pointer-events: none;
				transition: transform ${CONSOLE_DEFAULTS.ANIMATION_DURATION}ms ease-in-out;
			}
			
			.console-body.visible {
				transform: translateY(0);
				pointer-events: auto;
			}

			.console-content {
				display: flex;
				flex-direction: column-reverse;
				column: nowrap;
				border: 1px solid #999;
				background-color: #999;
				opacity: 0.9;
				width: 100%;
				height: calc(100% - 30px);
				overflow: scroll;
				overflow-x: hidden;
			}

			.console-content p {
				font-size: 14px;
				color: #fff;
				width: 100%;
				white-space: nowrap;
				margin: 0px;
				line-height: 115%;
			}

			.console-input {
				display: flex;
				color: #fff;
				font-size: 14px;
				position: absolute;
				bottom: 0;
				left: 0;
				width: 100%;
				height: 30px;
				border: 1px solid #999;
				border-bottom: 2px solid #fff;
				border-top: 2px solid #fff;
				background-color: #999;
				opacity: 0.75;
				outline: none;
				font-weight: bold;
				box-sizing: border-box;
			}
		`;
	}

	handleInput(event) {
		if (event.data === "`") return;
		this.command.set(event.target.value);
		this.historyIndex = -1;
	}

	handleKeyDown(event) {
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();

			if (this.commandHistory.length === 0) return;

			if (event.key === "ArrowUp") {
				this.historyIndex =
					this.historyIndex === -1
						? this.commandHistory.length - 1
						: Math.max(0, this.historyIndex - 1);
			} else {
				this.historyIndex =
					this.historyIndex === -1
						? -1
						: Math.min(this.commandHistory.length - 1, this.historyIndex + 1);
			}

			this.command.set(
				this.historyIndex === -1 ? "" : this.commandHistory[this.historyIndex],
			);
		}
	}

	template() {
		return html`
			<div id="console">
				<div class="console-body" data-class-hidden="visible" data-ref="body">
					<div class="console-content" data-ref="content">
						<p data-ref="logs"></p>
					</div>
					<input 
						class="console-input"
						type="text"
						data-ref="input"
						data-model="command"
						data-on-input="handleInput"
						data-on-keydown="handleKeyDown"
					/>
				</div>
			</div>
		`;
	}

	mount() {
		// Bind visible state directly to visible class
		this.bindClass(this.refs.body, "visible", this.visible);
		
		// Bind logs rendering
		this.bind(this.refs.logs, this.logs, (currentLogs) => {
			const logsHtml = currentLogs.map(
				(log) =>
					`<span style="color: ${log.color}">${log.message}<br /></span>`,
			).join("");
			return { __safe: true, content: logsHtml };
		});

		// Auto-focus input when visible
		this.effect(() => {
			if (this.visible.get() && this.refs.input) {
				setTimeout(() => {
					this.refs.input.disabled = false;
					this.refs.input.focus();
				}, 100);
			}
		});

		// Auto-scroll content
		this.effect(() => {
			this.logs.get(); // Track logs changes
			if (this.refs.content) {
				setTimeout(() => {
					this.refs.content.scrollTop = this.refs.content.scrollHeight;
				}, 0);
			}
		});
	}
}

// Command parsing and utilities
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

// Console instance
let consoleUI = null;

// Main Console object
const Console = {
	toggle(show) {
		if (!consoleUI) return;
		consoleUI.visible.set(
			show ?? !consoleUI.visible.get(),
		);
	},

	isVisible() {
		return consoleUI?.visible.get() ?? false;
	},

	log(message) {
		console.log(message);
		if (!consoleUI) return;
		consoleUI.logs.update((current) => [
			...current,
			{ color: CONSOLE_DEFAULTS.TEXT_COLOR, message },
		]);
	},

	warn(message) {
		console.warn(message);
		if (!consoleUI) return;
		consoleUI.logs.update((current) => [
			...current,
			{ color: CONSOLE_DEFAULTS.WARNING_COLOR, message },
		]);
	},

	error(message) {
		throw new Error(message);
	},

	registerCmd(name, value) {
		window.simplefps[name.toLowerCase()] = value;
	},

	executeCmd() {
		if (!consoleUI) return;
		const currentCommand = consoleUI.command.get();
		if (!currentCommand) return;

		try {
			this.log(currentCommand);

			if (
				consoleUI.commandHistory.length === 0 ||
				consoleUI.commandHistory[
					consoleUI.commandHistory.length - 1
				] !== currentCommand
			) {
				consoleUI.commandHistory.push(currentCommand);
			}

			const cmd = `simplefps.${currentCommand}`;
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

		consoleUI.command.set("");
		consoleUI.historyIndex = -1;
	},
};

// Initialize
window.simplefps = {};
Console.executeCmd = Console.executeCmd.bind(Console);

// Mount console component
consoleUI = new ConsoleUI();
consoleUI.appendTo("body");

export default Console;
