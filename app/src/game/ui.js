import { css, html, Reactive } from "../engine/utils/reactive.js";

// ============================================================================
// Private
// ============================================================================

import * as Engine from "../engine/core/engine.js";

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
				font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
			}

			#menu-backdrop {
				position: fixed;
				top: 0;
				left: 0;
				width: 100vw;
				height: 100vh;
				background-size: cover;
				background-position: center;
				filter: blur(8px) brightness(0.7);
				transform: scale(1.05);
				z-index: 1;
				opacity: 0;
				visibility: hidden;
				transition: opacity 200ms ease-out, visibility 0s 200ms;
				pointer-events: none;
			}

			#menu-backdrop.visible {
				opacity: 1;
				visibility: visible;
				transition: opacity 200ms ease-out, visibility 0s 0s;
			}

			#menu-base {
				transform: translate(-50%, -50%);
				position: absolute;
				top: 50%;
				left: 50%;
				background: linear-gradient(135deg, rgba(40, 40, 40, 0.95), rgba(20, 20, 20, 0.98));
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-radius: 8px;
				box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
				color: #fff;
				padding: 20px;
				font-size: 16px;
				width: 400px;
				max-width: 90vw;
				user-select: none;
				z-index: 1000;
				opacity: 0;
				transition: opacity 200ms ease-out, transform 200ms ease-out;
				display: none;
			}

			#menu-base.visible {
				display: block;
				opacity: 1;
				transform: translate(-50%, -50%) scale(1);
			}

			#menu-header {
				font-size: 24px;
				font-weight: 300;
				text-align: center;
				margin-bottom: 25px;
				letter-spacing: 2px;
				text-transform: uppercase;
				color: rgba(255, 255, 255, 0.9);
				border-bottom: 1px solid rgba(255, 255, 255, 0.1);
				padding-bottom: 15px;
			}

			.menu-button {
				text-align: center;
				background: rgba(40, 40, 40, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.2);
				border-radius: 4px;
				margin-bottom: 10px;
				padding: 12px;
				cursor: pointer;
				transition: all 0.2s ease;
				text-transform: uppercase;
				font-size: 14px;
				letter-spacing: 1px;
				color: rgba(255, 255, 255, 0.9);
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
			}

			.menu-button:hover {
				background: rgba(60, 60, 60, 0.8);
				border-color: rgba(255, 255, 255, 0.4);
				transform: translateY(-1px);
				box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
			}

			.menu-button:active {
				transform: translateY(1px);
				background: rgba(255, 255, 255, 0.1);
			}

			.menu-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
				background: transparent;
				margin-bottom: 8px;
				padding: 8px 4px;
				color: rgba(255, 255, 255, 0.8);
				font-size: 14px;
			}

			.menu-panel {
				background: rgba(0, 0, 0, 0.2);
				border-radius: 6px;
				margin-bottom: 20px;
				padding: 15px;
				border: 1px solid rgba(255, 255, 255, 0.05);
			}

			.menu-slider {
				width: 50%;
				accent-color: #fff;
				cursor: pointer;
			}

				accent-color: #fff;
				cursor: pointer;
			}

			@media (max-width: 768px) {
				#menu-base {
					width: 90vw;
					padding: 15px;
				}

				.menu-button {
					padding: 12px;
					font-size: 14px;
				}

				.menu-row {
					padding: 6px 4px;
					font-size: 14px;
				}

				.menu-checkbox {
					width: 20px;
					height: 20px;
				}

				.menu-panel {
					padding: 10px;
					margin-bottom: 12px;
				}

				#menu-header {
					font-size: 18px;
					margin-bottom: 15px;
					padding-bottom: 10px;
				}
			}

			/* Landscape mobile - limit menu height */
			@media (max-height: 500px) {
				#menu-base {
					max-height: 85vh;
					overflow-y: auto;
					padding: 12px;
				}

				#menu-header {
					font-size: 16px;
					margin-bottom: 10px;
					padding-bottom: 8px;
				}

				.menu-button {
					padding: 8px;
					font-size: 12px;
					margin-bottom: 6px;
				}

				.menu-row {
					padding: 4px 4px;
					font-size: 12px;
					margin-bottom: 4px;
				}

				.menu-panel {
					padding: 8px;
					margin-bottom: 10px;
				}

				.menu-checkbox {
					width: 18px;
					height: 18px;
				}
			}
		`;
	}

	template() {
		return html`
			<div id="ui">
				<div id="menu-backdrop" data-ref="backdrop"></div>
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

			let currentPanel = null;

			menu.controls.forEach((control) => {
				const isButton = !control.type || control.type === "button";

				if (!isButton) {
					// It's a setting control (slider side checkbox)
					if (!currentPanel) {
						currentPanel = document.createElement("div");
						currentPanel.className = "menu-panel";
						this.refs.controls.appendChild(currentPanel);
					}

					const row = document.createElement("div");
					row.className = "menu-row";

					const label = document.createElement("span");
					label.textContent = control.text;
					row.appendChild(label);

					if (control.type === "slider") {
						const slider = document.createElement("input");
						slider.type = "range";
						slider.className = "menu-slider";
						slider.min = control.min;
						slider.max = control.max;
						slider.step = control.step;
						slider.value = control.value();
						slider.oninput = (e) => control.set(e.target.value);
						row.appendChild(slider);
					} else if (control.type === "checkbox") {
						const checkbox = document.createElement("input");
						checkbox.type = "checkbox";
						checkbox.className = "menu-checkbox";
						checkbox.checked = control.value();
						checkbox.onchange = (e) => control.set(e.target.checked);
						row.appendChild(checkbox);
					}
					currentPanel.appendChild(row);
				} else {
					// It's a button
					// Close current panel if exists (by nulling it, it's already appended)
					currentPanel = null;

					const button = document.createElement("div");
					button.className = "menu-button";
					button.textContent = control.text;
					button.onclick = control.callback;
					this.refs.controls.appendChild(button);
				}
			});
		});
	}

	register(name, ui) {
		this._uis[name] = ui;
	}

	show(name) {
		const currentMenu = this.currentMenu.get();
		const isVisible = this.visible.get();

		// Capture canvas snapshot for backdrop (only when first showing menu)
		if (!isVisible) {
			const canvas = document.getElementById("context");
			if (canvas) {
				this.refs.backdrop.style.backgroundImage = `url(${canvas.toDataURL("image/jpeg", 0.8)})`;
			}
			this.refs.backdrop.classList.add("visible");
			Engine.pause();
		}

		// If already showing a different menu, fade out first, then switch
		if (isVisible && currentMenu && currentMenu !== name) {
			// Fade out menu only (keep backdrop)
			this.refs.menuBase.classList.remove("visible");

			// Wait for fade-out transition, then switch content and fade in
			setTimeout(() => {
				this.batch(() => {
					this.currentMenu.set(name);
					void this.refs.menuBase.offsetWidth;
					this.refs.menuBase.classList.add("visible");
				});
			}, 200);
		} else {
			// Just show the menu normally
			this.batch(() => {
				this.currentMenu.set(name);
				this.visible.set(true);
			});
		}
	}

	hide() {
		this.visible.set(false);
		this.refs.backdrop.classList.remove("visible");
		Engine.resume();
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
