import { css, html, Reactive } from "./reactive.js";

// Loading UI component
class _LoadingUI extends Reactive.Component {
	constructor() {
		super();
		this._forceUntilReload = false;
	}

	state() {
		return {
			visible: this.signal(false, "loading:visible"),
		};
	}

	styles() {
		return css`
			#loading {
				z-index: 2000;
				display: none;
			}

			#loading.visible {
				display: block;
			}

			#loading-background {
				width: 100%;
				height: 100%;
				position: absolute;
				left: 0;
				top: 0;
				margin: 0;
				padding: 0;
				background-color: black;
				z-index: 2001;
			}

			#loading-logo {
				position: fixed;
				width: 30vh;
				height: 30vh;
				top: 50%;
				left: 50%;
				margin-top: -15vh;
				margin-left: -15vh;
				content: url(resources/logo.svg);
				z-index: 2002;
				animation: spin 3s linear infinite;
			}

			@keyframes spin {
				from {
					transform: rotateZ(0deg);
				}
				to {
					transform: rotateZ(360deg);
				}
			}
		`;
	}

	template() {
		return html`
			<div id="loading" data-class-visible="visible">
				<div id="loading-logo"></div>
				<div id="loading-background"></div>
			</div>
		`;
	}

	toggle(visible, force) {
		if (this._forceUntilReload) return;
		if (this.visible.get() && visible) return;

		this.visible.set(visible);
		if (force != null) this._forceUntilReload = force;
	}
}

// Loading UI singleton
const _ui = new _LoadingUI();
_ui.appendTo("body");

const Loading = {
	toggle(visible, force) {
		_ui.toggle(visible, force);
	},
};

export default Loading;
