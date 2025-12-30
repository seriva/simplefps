import { css, html, Reactive } from "../utils/reactive.js";

// Loading UI component
class _LoadingUI extends Reactive.Component {
	constructor() {
		super();
		this._forceUntilReload = false;
		this._loadingCount = 0;
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
				background-color: #000;
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

		if (visible) {
			this._loadingCount++;
		} else {
			this._loadingCount = Math.max(0, this._loadingCount - 1);
		}

		const shouldBeVisible = this._loadingCount > 0;

		if (this.visible.get() !== shouldBeVisible) {
			this.visible.set(shouldBeVisible);
		}

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
