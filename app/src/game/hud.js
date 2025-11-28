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
				border: 2px solid #fff;
				background-color: #999;
				right: 15px;
				top: 15px;
				width: 50px;
				height: 50px;
				position: absolute;
				opacity: 0.6;
				z-index: 1001;
				content: url(resources/menu.png);
				cursor: pointer;
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
				${this._isMobile ? html`<div id="button-menu" data-ref="menuBtn"></div>` : html``}
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
