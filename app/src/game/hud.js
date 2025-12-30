import { css, html, Reactive } from "../engine/utils/reactive.js";
import Utils from "../engine/utils/utils.js";
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
				right: 25px;
				top: 25px;
				width: 80px;
				height: 80px;
				position: absolute;
				z-index: 1001;
				cursor: pointer;
				
				background: rgba(40, 40, 40, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.2);
				box-sizing: border-box; /* Ensure border doesn't add to size */
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				backdrop-filter: blur(4px);
				color: rgba(255, 255, 255, 0.9);
				
				display: flex;
				align-items: center;
				justify-content: center;
				transition: transform 0.1s ease, background 0.2s;
			}
			
			#button-menu:active {
				transform: scale(0.95);
				background: rgba(60, 60, 60, 0.8);
				border-color: rgba(255, 255, 255, 0.4);
			}

			#button-menu svg {
				width: 32px;
				height: 32px;
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
			this.on(this.refs.menuBtn, "click", () => {
				State.enterMenu("MAIN_MENU");
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
