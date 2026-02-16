import {
	css,
	html,
	join,
	Reactive,
	trusted,
} from "../dependencies/reactive.js";

// ============================================================================
// Private
// ============================================================================

import Translations from "./translations.js";

class _MenuUI extends Reactive.Component {
	constructor() {
		super();
		this._uis = {};
	}

	state() {
		return {
			visible: this.signal(false, "ui:visible"),
			currentMenu: this.signal("", "ui:currentMenu"),
			dialogVisible: this.signal(false, "ui:dialogVisible"),
		};
	}

	styles() {
		return css`
			#ui {
				background-color: transparent;
				font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
			}
			
			/* Dialog Styles */
			#dialog-overlay {
				position: fixed;
				top: 0;
				left: 0;
				width: 100vw;
				height: 100vh;
				background: rgba(0, 0, 0, 0.5);
				z-index: 2000;
				display: flex;
				align-items: center;
				justify-content: center;
				opacity: 0;
				visibility: hidden;
				transition: opacity 0.2s ease, visibility 0s 0.2s;
			}
			
			#dialog-overlay.visible {
				opacity: 1;
				visibility: visible;
				transition: opacity 0.2s ease, visibility 0s;
			}
			
			.dialog-box {
				background: #252525;
				border: 1px solid rgba(255, 255, 255, 0.15);
				border-radius: 8px;
				box-shadow: 0 20px 50px rgba(0,0,0,0.5);
				width: 400px;
				max-width: 90vw;
				padding: 24px;
				transform: scale(0.95);
				transition: transform 0.2s ease;
			}
			
			#dialog-overlay.visible .dialog-box {
				transform: scale(1);
			}
			
			.dialog-header {
				font-size: 20px;
				color: #fff;
				margin-bottom: 12px;
				font-weight: 500;
			}
			
			.dialog-body {
				font-size: 15px;
				color: #ccc;
				margin-bottom: 24px;
				line-height: 1.5;
			}
			
			.dialog-footer {
				display: flex;
				justify-content: flex-end;
				gap: 12px;
			}
			
			.dialog-btn {
				padding: 8px 16px;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
				border: 1px solid transparent;
				transition: background 0.15s;
			}
			
			.dialog-btn.confirm {
				background: #4a90e2;
				color: white;
			}
			.dialog-btn.confirm:hover { background: #357abd; }
			
			.dialog-btn.cancel {
				background: transparent;
				border: 1px solid #444;
				color: #aaa;
			}
			.dialog-btn.cancel:hover {
				border-color: #666;
				color: #fff;
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

			.menu-tabs {
				display: flex;
				gap: 2px;
				margin-bottom: 0;
				padding: 0;
				border-bottom: none;
			}

			.menu-tab {
				flex: 1;
				text-align: center;
				padding: 10px 15px;
				background: rgba(20, 20, 20, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-bottom: none;
				border-radius: 6px 6px 0 0;
				cursor: pointer;
				color: rgba(255, 255, 255, 0.5);
				font-size: 12px;
				text-transform: uppercase;
				letter-spacing: 1px;
				transition: all 0.15s ease;
				position: relative;
				top: 1px;
			}

			.menu-tab:hover {
				background: rgba(40, 40, 40, 0.7);
				color: rgba(255, 255, 255, 0.7);
			}

			.menu-tab.active {
				background: rgba(0, 0, 0, 0.2);
				border-color: rgba(255, 255, 255, 0.1);
				border-bottom-color: transparent;
				color: rgba(255, 255, 255, 0.9);
				z-index: 2;
				top: 1px;
			}

			.menu-tab-content {
				display: none;
			}

			.menu-tab-content.active {
				display: block;
			}

			/* Panel inside tab content - connects to tab */
			.menu-tab-content .menu-panel {
				border-radius: 0 0 6px 6px;
				margin-top: 0;
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				height: min(320px, 60vh);
				overflow-y: auto;
			}


			/* First panel after tabs connects seamlessly */
			.menu-tab-content.active > .menu-panel:first-child {
				border-top: none;
				border-radius: 0 0 6px 6px;
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
				margin-bottom: 15px;
				padding: 15px;
				border: 1px solid rgba(255, 255, 255, 0.1);
			}

			/* Custom scrollbar for panels */
			.menu-panel::-webkit-scrollbar {
				width: 6px;
			}

			.menu-panel::-webkit-scrollbar-track {
				background: rgba(0, 0, 0, 0.2);
				border-radius: 3px;
			}

			.menu-panel::-webkit-scrollbar-thumb {
				background: rgba(255, 255, 255, 0.3);
				border-radius: 3px;
			}

			.menu-panel::-webkit-scrollbar-thumb:hover {
				background: rgba(255, 255, 255, 0.5);
			}

			.menu-slider {
				width: 50%;
				accent-color: #fff;
				cursor: pointer;
			}

			.menu-checkbox {
				width: 22px;
				height: 22px;
				min-width: 22px;
				max-width: 22px;
				min-height: 22px;
				max-height: 22px;
				box-sizing: border-box;
				cursor: pointer;
				-webkit-appearance: none;
				appearance: none;
				background: rgba(255, 255, 255, 0.1);
				border: 2px solid rgba(255, 255, 255, 0.4);
				border-radius: 3px;
				position: relative;
				touch-action: manipulation;
				flex-shrink: 0;
				transition: all 0.15s ease;
			}

			.menu-select {
				width: 50%;
				background: rgba(0, 0, 0, 0.3);
				border: 1px solid rgba(255, 255, 255, 0.2);
				border-radius: 4px;
				color: #fff;
				padding: 4px 8px;
				font-family: inherit;
				font-size: 14px;
				cursor: pointer;
				outline: none;
			}
			
			.menu-select:hover {
				background: rgba(40, 40, 40, 0.5);
				border-color: rgba(255, 255, 255, 0.4);
			}

			.menu-select option {
				background: #222;
				color: #fff;
			}

			.menu-checkbox:checked {
				background: rgba(255, 255, 255, 0.85);
				border-color: rgba(255, 255, 255, 0.85);
			}

			.menu-checkbox:checked::after {
				content: '';
				position: absolute;
				left: 6px;
				top: 2px;
				width: 5px;
				height: 10px;
				border: solid #333;
				border-width: 0 2px 2px 0;
				transform: rotate(45deg);
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

				.menu-panel, .menu-tab-content .menu-panel {
					padding: 8px;
					margin-bottom: 10px;
					max-height: 55vh;
					min-height: 0;
					overflow-y: auto;
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
				
				<div id="dialog-overlay" data-class-visible="dialogVisible" data-ref="dialogOverlay">
					<div class="dialog-box">
						<div class="dialog-header" data-ref="dialogHeader"></div>
						<div class="dialog-body" data-ref="dialogBody"></div>
						<div class="dialog-footer" data-ref="dialogFooter"></div>
					</div>
				</div>
			</div>
		`;
	}

	showDialogInternal(title, message, onYes, onNo) {
		this.refs.dialogHeader.textContent = title;
		this.refs.dialogBody.textContent = message;

		const dismiss = (callback) => () => {
			this.dialogVisible.set(false);
			if (callback) callback();
		};

		this.refs.dialogFooter.innerHTML = html`
			<button class="dialog-btn cancel" data-dialog="no">${Translations.get("NO")}</button>
			<button class="dialog-btn confirm" data-dialog="yes">${Translations.get("YES")}</button>
		`.content;

		this.refs.dialogFooter.querySelector("[data-dialog=no]").onclick =
			dismiss(onNo);
		this.refs.dialogFooter.querySelector("[data-dialog=yes]").onclick =
			dismiss(onYes);

		this.dialogVisible.set(true);
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

			// Check if menu has tabs
			if (menu.tabs) {
				const tabBar = join(
					menu.tabs.map(
						(tab, i) =>
							html`<div class="menu-tab${trusted(i === 0 ? " active" : "")}" data-tab="${i}">${tab.label}</div>`,
					),
				);

				const tabPanels = join(
					menu.tabs.map(
						(_, i) =>
							html`<div class="menu-tab-content${trusted(i === 0 ? " active" : "")}" data-tab-panel="${i}"></div>`,
					),
				);

				const bottomBtns = menu.bottomControls
					? join(
							menu.bottomControls.map(
								(control, i) =>
									html`<div class="menu-button" data-bottom="${i}">${control.text}</div>`,
							),
						)
					: trusted("");

				this.refs.controls.innerHTML = html`
					<div class="menu-tabs">${tabBar}</div>
					${tabPanels}
					${bottomBtns}
				`.content;

				// Build controls into each tab panel
				for (const [i, tab] of menu.tabs.entries()) {
					const panel = this.refs.controls.querySelector(
						`[data-tab-panel="${i}"]`,
					);
					this._buildControls(tab.controls, panel);
				}

				// Wire tab switching
				const tabs = this.refs.controls.querySelectorAll("[data-tab]");
				const panels = this.refs.controls.querySelectorAll("[data-tab-panel]");
				for (const tab of tabs) {
					tab.onclick = () => {
						for (const t of tabs) t.classList.remove("active");
						for (const p of panels) p.classList.remove("active");
						tab.classList.add("active");
						panels[tab.dataset.tab].classList.add("active");
					};
				}

				// Wire bottom buttons
				if (menu.bottomControls) {
					for (const el of this.refs.controls.querySelectorAll(
						"[data-bottom]",
					)) {
						el.onclick = menu.bottomControls[el.dataset.bottom].callback;
					}
				}
			} else {
				// Original non-tabbed logic
				this._buildControls(menu.controls, this.refs.controls);
			}
		});
	}

	_renderControlRow(control, index) {
		let input;

		switch (control.type) {
			case "slider":
				input = html`<input type="range" class="menu-slider"
					min="${control.min}" max="${control.max}"
					step="${control.step}" value="${control.value()}" />`;
				break;
			case "checkbox":
				input = html`<label class="menu-checkbox-label"><input type="checkbox"
					class="menu-checkbox" ${trusted(control.value() ? "checked" : "")} /></label>`;
				break;
			case "link":
				input = html`<a href="${control.url}" target="_blank" rel="noopener noreferrer"
					style="color:#6cb4ff;text-decoration:none">${control.linkText || control.url}</a>`;
				break;
			case "select": {
				const currentValue = String(control.value());
				const opts = join(
					control.options.map(
						(opt) =>
							html`<option value="${opt.value}"
								${trusted(String(opt.value) === currentValue ? "selected" : "")}>${opt.label}</option>`,
					),
				);
				input = html`<select class="menu-select">${opts}</select>`;
				break;
			}
		}

		return html`<div class="menu-row" data-ctrl="${index}">
			<span>${control.text}</span>${input}
		</div>`;
	}

	_buildControls(controls, container) {
		const parts = [];
		let panelRows = [];

		const flushPanel = () => {
			if (!panelRows.length) return;
			parts.push(html`<div class="menu-panel">${join(panelRows)}</div>`);
			panelRows = [];
		};

		controls.forEach((control, i) => {
			if (!control.type || control.type === "button") {
				flushPanel();
				parts.push(
					html`<div class="menu-button" data-ctrl="${i}">${control.text}</div>`,
				);
			} else {
				panelRows.push(this._renderControlRow(control, i));
			}
		});
		flushPanel();

		container.innerHTML = join(parts).content;
		this._wireControlEvents(container, controls);
	}

	_wireControlEvents(container, controls) {
		for (const el of container.querySelectorAll("[data-ctrl]")) {
			const control = controls[el.dataset.ctrl];

			if (!control.type || control.type === "button") {
				el.onclick = control.callback;
			} else if (control.type === "slider") {
				el.querySelector("input").oninput = (e) => control.set(e.target.value);
			} else if (control.type === "checkbox") {
				const cb = el.querySelector("input");
				cb.onchange = (e) => control.set(e.target.checked);
				el.style.cursor = "pointer";
				el.onclick = (e) => {
					if (e.target !== cb) {
						cb.checked = !cb.checked;
						control.set(cb.checked);
					}
				};
			} else if (control.type === "select") {
				el.querySelector("select").onchange = (e) =>
					control.set(e.target.value);
			}
		}
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
	showDialog(title, message, onYes, onNo) {
		_ui.showDialogInternal(title, message, onYes, onNo);
	},
};

export default UI;
