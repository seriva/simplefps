import { css, html, Reactive } from "../engine/utils/reactive.js";

// ============================================================================
// Private
// ============================================================================

class _MenuUI extends Reactive.Component {
	constructor() {
		super();
		this._uis = {};
	}

	state() {
		return {
			visible: this.signal(false, "ui:visible"),
			currentMenu: this.signal("", "ui:currentMenu"),
		};
	}

	styles() {
		return css`
			#ui {
				background-color: transparent;
			}

			#menu-base {
				transform: translate(-50%, -50%);
				position: absolute;
				top: 50%;
				left: 50%;
				background-color: #999;
				border: 2px solid #fff;
				color: #fff;
				padding: 10px 10px 0;
				font-size: 16px;
				max-width: 500px;
				user-select: none;
				z-index: 1000;
				opacity: 0;
				transition: opacity 150ms linear;
				display: none;
			}

			#menu-base.visible {
				display: block;
				opacity: 0.9;
			}

			#menu-header {
				font-size: 18px;
				text-align: center;
				margin-bottom: 10px;
			}

			.menu-button {
				text-align: center;
				border: 2px solid #fff;
				background-color: #999;
				margin-bottom: 10px;
				padding: 10px;
				cursor: pointer;
			}

			.menu-button:hover {
				background-color: #888;
			}
		`;
	}

	template() {
		return html`
			<div id="ui">
				<div id="menu-base" data-class-visible="visible" data-ref="menuBase">
					<div id="menu-header" data-ref="header"></div>
					<div data-ref="controls"></div>
				</div>
			</div>
		`;
	}

	mount() {
		// Update menu content when currentMenu or visible changes
		this.effect(() => {
			const menuName = this.currentMenu.get();
			const isVisible = this.visible.get();

			if (!isVisible || !menuName || !this._uis[menuName]) {
				return;
			}

			const menu = this._uis[menuName];

			// Update header
			this.refs.header.textContent = menu.header;

			// Clear and rebuild controls
			this.refs.controls.innerHTML = "";

			menu.controls.forEach(({ text, callback }) => {
				const button = document.createElement("div");
				button.className = "menu-button";
				button.textContent = text;
				button.onclick = callback;
				this.refs.controls.appendChild(button);
			});
		});
	}

	register(name, ui) {
		this._uis[name] = ui;
	}

	show(name) {
		this.batch(() => {
			this.currentMenu.set(name);
			this.visible.set(true);
		});
	}

	hide() {
		this.visible.set(false);
	}
}

// Menu UI singleton
const _ui = new _MenuUI();
_ui.appendTo("body");

// ============================================================================
// Public API
// ============================================================================

const UI = {
	register(name, ui) {
		_ui.register(name, ui);
	},
	show(name) {
		_ui.show(name);
	},
	hide() {
		_ui.hide();
	},
};

export default UI;
