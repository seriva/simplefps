import { css, html, Reactive } from "../../dependencies/reactive.js";

// Console default configuration
const _DEFAULTS = {
	TEXT_COLOR: "#fff",
	WARNING_COLOR: "#FF0",
	ANIMATION_DURATION: 150,
	MAX_LOGS: 1000,
	MAX_HISTORY: 100,
};

// Safe evaluation using Function constructor instead of eval
const _safeEval = (expr) => {
	try {
		// Create a function that returns the expression result
		// This is safer than eval as it doesn't have access to local scope
		return Function(`"use strict"; return (${expr})`)();
	} catch (error) {
		throw new Error(`Invalid expression: ${error.message}`);
	}
};

// Parse console command
const _parseCommand = (cmd) => {
	const assignMatch = cmd.match(/^([\w.]+)\s*=\s*(.+)$/);
	if (assignMatch) {
		return {
			type: "assignment",
			variable: assignMatch[1],
			value: _safeEval(assignMatch[2]),
		};
	}
	const funcMatch = cmd.match(/^([\w.]+)\(([^)]*)\)$/);
	if (funcMatch) {
		return {
			type: "function",
			func: funcMatch[1],
			params: funcMatch[2]
				? funcMatch[2].split(",").map((p) => _safeEval(p.trim()))
				: [],
		};
	}
	throw new Error("Invalid command syntax");
};

// Traverse object path
const _getByPath = (path) => {
	const parts = path.split(".");
	let obj = window;
	for (const part of parts) {
		if (obj && typeof obj === "object" && part in obj) {
			obj = obj[part];
		} else {
			return null;
		}
	}
	return obj;
};

// Set value at object path
const _setValue = (path, value) => {
	const parts = path.split(".");
	const prop = parts.pop();
	const obj = _getByPath(parts.join("."));
	if (obj) obj[prop] = value;
};

// Call function at object path
const _callFunction = (path, params) => {
	const parts = path.split(".");
	const funcName = parts.pop();
	const obj = _getByPath(parts.join("."));
	if (obj) obj[funcName](...params);
};

// Internal console UI component
class _ConsoleUI extends Reactive.Component {
	constructor() {
		super();
		this._commandHistory = [];
		this._historyIndex = -1;
	}

	state() {
		return {
			visible: this.signal(false, "console:visible"),
			command: this.signal("", "console:command"),
			logs: this.signal([], "console:logs"),
		};
	}

	styles() {
		return css`
			.console-body {
				position: absolute;
				width: 100%;
				height: 45%;
				left: 0;
				top: 0;
				overflow: hidden;
				z-index: 2500;
				transform: translateY(-100%);
				pointer-events: none;
				transition: transform ${_DEFAULTS.ANIMATION_DURATION}ms ease-in-out;
			}
			
			.console-body.visible {
				transform: translateY(0);
				pointer-events: auto;
			}

			.console-content {
				display: flex;
				flex-direction: column-reverse;
				border: 1px solid #999;
				background-color: rgba(153, 153, 153, 0.75);
				width: 100%;
				height: calc(100% - 30px);
				overflow-y: auto;
				overflow-x: hidden;
			}

			.console-content p {
				font-size: 14px;
				color: #fff;
				white-space: nowrap;
				margin: 0;
				line-height: 1.15;
			}

			.console-input {
				color: #fff;
				font: bold 14px monospace;
				position: absolute;
				bottom: 0;
				left: 0;
				width: 100%;
				height: 30px;
				border: 1px solid #999;
				border-bottom: 2px solid #fff;
				border-top: 2px solid #fff;
				background-color: rgba(153, 153, 153, 0.75);
				outline: none;
				box-sizing: border-box;
			}
		`;
	}

	handleInput(event) {
		this.command.set(event.target.value);
		this._historyIndex = -1;
	}

	handleKeyDown(event) {
		// Filter backtick character
		if (event.key === "`" || event.key === "~") {
			event.preventDefault();
			return;
		}

		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();
			if (this._commandHistory.length === 0) return;

			const len = this._commandHistory.length;
			if (event.key === "ArrowUp") {
				this._historyIndex =
					this._historyIndex === -1
						? len - 1
						: Math.max(0, this._historyIndex - 1);
			} else {
				this._historyIndex =
					this._historyIndex < len - 1 ? this._historyIndex + 1 : -1;
			}

			this.command.set(
				this._historyIndex === -1
					? ""
					: this._commandHistory[this._historyIndex],
			);
		}
	}

	template() {
		return html`
			<div id="console">
				<div class="console-body" data-class-visible="visible" data-ref="body">
					<div class="console-content" data-ref="content">
						<p data-ref="logs"></p>
					</div>
					<input 
						class="console-input"
						type="text"
						data-ref="input"
						data-model="command"
					/>
				</div>
			</div>
		`;
	}

	mount() {
		// Bind logs with safe HTML rendering
		this.bind(this.refs.logs, this.logs, (logs) => ({
			__safe: true,
			content: logs
				.map(
					(log) =>
						`<span style="color: ${log.color}">${log.message}<br /></span>`,
				)
				.join(""),
		}));

		// Use on() method for cleaner event handling with auto-cleanup
		this.on(this.refs.input, "input", this.handleInput);
		this.on(this.refs.input, "keydown", this.handleKeyDown);

		// Auto-focus input when console becomes visible, blur when hidden
		this.effect(() => {
			if (this.visible.get()) {
				requestAnimationFrame(() => {
					this.refs.input.disabled = false;
					this.refs.input.focus();
				});
			} else {
				this.refs.input.blur();
			}
		});

		// Auto-scroll to bottom when logs update
		this.effect(() => {
			this.logs.get();
			requestAnimationFrame(() => {
				this.refs.content.scrollTop = this.refs.content.scrollHeight;
			});
		});
	}
}

// Console UI singleton
let _ui = null;

// Main Console object
const Console = {
	toggle(show) {
		if (!_ui) return;
		_ui.visible.set(show ?? !_ui.visible.get());
	},

	isVisible() {
		return _ui?.visible.get() ?? false;
	},

	_addLog(message, color, consoleMethod) {
		consoleMethod(message);
		if (!_ui) return;
		_ui.logs.update((logs) =>
			[...logs, { color, message }].slice(-_DEFAULTS.MAX_LOGS),
		);
	},

	log(message) {
		this._addLog(message, _DEFAULTS.TEXT_COLOR, console.log);
	},

	warn(message) {
		this._addLog(message, _DEFAULTS.WARNING_COLOR, console.warn);
	},

	error(message) {
		throw new Error(message);
	},

	registerCmd(name, value) {
		window.simplefps[name.toLowerCase()] = value;
	},

	executeCmd() {
		if (!_ui || !_ui.visible.get()) return;
		const currentCommand = _ui.command.get();
		if (!currentCommand) return;

		_ui.batch(() => {
			try {
				this.log(currentCommand);

				const history = _ui._commandHistory;
				if (history[history.length - 1] !== currentCommand) {
					history.push(currentCommand);
					if (history.length > _DEFAULTS.MAX_HISTORY) {
						history.shift();
					}
				}

				const cmd = `simplefps.${currentCommand}`;
				const parsed = _parseCommand(cmd);

				if (parsed.type === "assignment") {
					const varPath = parsed.variable.replace("simplefps.", "");
					const currentValue = _getByPath(`simplefps.${varPath}`);
					// Check for null specifically (null = doesn't exist, but false/0/"" are valid)
					if (currentValue === null) {
						throw new Error(`Variable "${varPath}" does not exist`);
					}
					_setValue(parsed.variable, parsed.value);
				} else {
					const pathToCheck = parsed.func.split(".").slice(0, -1).join(".");
					if (!_getByPath(pathToCheck)) {
						throw new Error(`Function path "${pathToCheck}" does not exist`);
					}
					_callFunction(parsed.func, parsed.params);
				}
			} catch (error) {
				Console.warn(`Failed to execute command: ${error}`);
			}

			_ui.command.set("");
			_ui._historyIndex = -1;
		});
	},
};

// Initialize
window.simplefps = {};
Console.executeCmd = Console.executeCmd.bind(Console);

// Mount console component
_ui = new _ConsoleUI();
_ui.appendTo("body");

export default Console;
