import { css, html, Reactive } from "../dependencies/reactive.js";
import { Utils } from "../engine/core/engine.js";
import State from "./state.js";

// ============================================================================
// Private
// ============================================================================

class _HUDUI extends Reactive.Component {
	constructor() {
		super();
		this._isMobile = Utils.isMobile();
	}

	state() {
		return {
			visible: this.signal(true, "hud:visible"),
		};
	}

	styles() {
		return css`
			#hud {
				margin: 0;
				padding: 0;
				z-index: 1000;
				background-color: transparent;
				display: none;
			}

			#hud.visible {
				display: block;
			}

			#button-menu {
				border-radius: 50%;
				right: 20px;
				top: 20px;
				width: 70px;
				height: 70px;
				position: absolute;
				z-index: 1001;
				cursor: pointer;
				
				background: rgba(40, 40, 40, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.2);
				box-sizing: border-box;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				backdrop-filter: blur(4px);
				color: rgba(255, 255, 255, 0.9);
				
				display: flex;
				align-items: center;
				justify-content: center;
				transition: transform 0.1s ease, background 0.2s;
			}
			
			#button-menu:active,
			#button-menu.pressed {
				transform: scale(0.9);
				background: rgba(80, 80, 80, 0.9);
				border-color: rgba(255, 255, 255, 0.5);
			}

			#button-menu svg {
				width: 24px;
				height: 24px;
				fill: currentColor;
			}

			#crosshair {
				position: absolute;
				top: 50%;
				left: 50%;
				margin-top: -20px;
				margin-left: -20px;
				width: 40px;
				height: 40px;
				z-index: 1001;
				content: url(resources/crosshair.png);
			}
		`;
	}

	template() {
		return html`
			<div id="hud" data-class-visible="visible">
				${
					this._isMobile
						? html`
					<div id="button-menu" data-ref="menuBtn">
						<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
					</div>`
						: html``
				}
				<div id="crosshair"></div>
			</div>
		`;
	}

	mount() {
		if (this._isMobile) {
			this.on(this.refs.menuBtn, "touchstart", () => {
				this.refs.menuBtn.classList.add("pressed");
			});
			this.on(this.refs.menuBtn, "touchend", () => {
				this.refs.menuBtn.classList.remove("pressed");
				State.enterMenu("MAIN_MENU");
			});
			this.on(this.refs.menuBtn, "touchcancel", () => {
				this.refs.menuBtn.classList.remove("pressed");
			});
		}

		// Subscribe to state changes to toggle visibility
		State.signal.subscribe((state) => {
			this.toggle(state === "GAME");
		});
	}

	toggle(show) {
		if (show === undefined) {
			this.visible.set(!this.visible.get());
		} else {
			this.visible.set(show);
		}
	}
}

// HUD UI singleton
const _ui = new _HUDUI();
_ui.appendTo("body");

// ============================================================================
// Public API
// ============================================================================

const HUD = {
	toggle(show) {
		_ui.toggle(show);
	},
};

export default HUD;
