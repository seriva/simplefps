import Settings from "../core/settings.js";
import { css, html, Reactive } from "../utils/reactive.js";
import Utils from "../utils/utils.js";

// ============================================================================
// Private
// ============================================================================

let _visibleCursor = true;
const _cursorMovement = {
	x: 0,
	y: 0,
};
const _cursorDelta = {
	x: 0,
	y: 0,
};
let _pressed = {};
let _upevents = [];
let _downevents = [];

window.addEventListener(
	"keyup",
	(ev) => {
		delete _pressed[ev.keyCode];
		for (let l = 0; l < _upevents.length; l++) {
			if (_upevents[l].key === ev.keyCode) {
				_upevents[l].event();
			}
		}
		for (let l = 0; l < _downevents.length; l++) {
			if (_downevents[l].pressed) {
				_downevents[l].pressed = false;
			}
		}
	},
	false,
);

window.addEventListener(
	"keydown",
	(ev) => {
		_pressed[ev.keyCode] = true;
		for (let l = 0; l < _downevents.length; l++) {
			if (_downevents[l].key === ev.keyCode && !_downevents[l].pressed) {
				_downevents[l].event();
				_downevents[l].pressed = true;
			}
		}
	},
	false,
);

const _setCursorMovement = (x, y) => {
	// Accumulate mouse delta between frames (consumed in update)
	_cursorDelta.x += x;
	_cursorDelta.y += y;
};

window.addEventListener(
	"mousemove",
	(ev) => {
		_setCursorMovement(ev.movementX, ev.movementY);
	},
	false,
);

// Mobile Virtual Input Component
class _VirtualInputUI extends Reactive.Component {
	constructor() {
		super();
		this._cursorPos = null;
		this._lastPos = null;
		this._stickPos = null;
		this._dragStart = null;
	}

	state() {
		return {
			visible: this.signal(true, "input:visible"),
			cursorOpacity: this.signal(0, "input:cursorOpacity"),
			cursorX: this.signal(0, "input:cursorX"),
			cursorY: this.signal(0, "input:cursorY"),
			stickX: this.signal(0, "input:stickX"),
			stickY: this.signal(0, "input:stickY"),
		};
	}

	styles() {
		return css`
			#input {
				z-index: 500;
				display: none;
			}

			#input.visible {
				display: block;
			}

			#look {
				width: 80%;
				height: 100%;
				right: 0;
				bottom: 0;
				margin: 0;
				padding: 0;
				position: absolute;
				z-index: 502;
			}

			#cursor {
				position: absolute;
				display: block;
				width: 50px;
				height: 50px;
				margin-left: -25px;
				margin-top: -25px;
				background: white;
				border-radius: 50%;
				z-index: 501;
				user-select: none;
				transition: opacity 100ms ease-in;
			}

			#joystick-base {
				background: white;
				width: 100px;
				height: 100px;
				left: 35px;
				bottom: 35px;
				position: absolute;
				opacity: 0.35;
				border-radius: 50%;
				z-index: 501;
			}

			#joystick-stick {
				background: white;
				border-radius: 100%;
				cursor: pointer;
				user-select: none;
				width: 50px;
				height: 50px;
				left: 60px;
				bottom: 60px;
				position: absolute;
				opacity: 0.35;
				z-index: 502;
				transition: transform 0.2s;
			}

			#joystick-stick.dragging {
				transition: none;
			}
		`;
	}

	template() {
		return html`
			<div id="input" data-class-visible="visible">
				<div id="joystick-base"></div>
				<div id="joystick-stick" data-ref="stick"></div>
				<div id="look" data-ref="look"></div>
				<div id="cursor" data-ref="cursor"></div>
			</div>
		`;
	}

	mount() {
		// Bind cursor opacity and position
		this.bindStyle(this.refs.cursor, "opacity", this.cursorOpacity);

		// Update cursor and stick positions
		this.effect(() => {
			const x = this.cursorX.get();
			const y = this.cursorY.get();
			this.refs.cursor.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
		});

		this.effect(() => {
			const x = this.stickX.get();
			const y = this.stickY.get();
			this.refs.stick.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
		});

		// Touch cursor/look events
		this.on(this.refs.look, "touchstart", (ev) => {
			if (ev.targetTouches) {
				this._cursorPos = {
					x: ev.targetTouches[0].clientX,
					y: ev.targetTouches[0].clientY,
				};
				this._lastPos = this._cursorPos;
			}
			this.cursorOpacity.set(0.35);
		});

		this.on(this.refs.look, "touchend", () => {
			this._cursorPos = null;
			this._lastPos = null;
			_cursorMovement.x = 0;
			_cursorMovement.y = 0;
			this.cursorOpacity.set(0);
		});

		this.on(this.refs.look, "touchmove", (ev) => {
			ev.preventDefault();
			if (ev.targetTouches && this._lastPos) {
				this._cursorPos = {
					x: ev.targetTouches[0].clientX,
					y: ev.targetTouches[0].clientY,
				};
				_setCursorMovement(
					(this._cursorPos.x - this._lastPos.x) * Settings.lookSensitivity,
					(this._cursorPos.y - this._lastPos.y) * Settings.lookSensitivity,
				);
				this._lastPos.x = this._cursorPos.x;
				this._lastPos.y = this._cursorPos.y;
			}
		});

		// Joystick events
		this.on(this.refs.stick, "touchstart", (ev) => {
			this.refs.stick.classList.add("dragging");
			if (ev.targetTouches) {
				this._dragStart = {
					x: ev.targetTouches[0].clientX,
					y: ev.targetTouches[0].clientY,
				};
				return;
			}
			this._dragStart = {
				x: ev.clientX,
				y: ev.clientY,
			};
		});

		this.on(this.refs.stick, "touchend", () => {
			if (this._dragStart === null) return;
			this.refs.stick.classList.remove("dragging");
			this.batch(() => {
				this.stickX.set(0);
				this.stickY.set(0);
			});
			delete _pressed[Settings.forward];
			delete _pressed[Settings.backwards];
			delete _pressed[Settings.left];
			delete _pressed[Settings.right];
			this._dragStart = null;
			this._stickPos = null;
		});

		this.on(this.refs.stick, "touchmove", (ev) => {
			ev.preventDefault();
			if (this._dragStart === null) return;

			if (ev.targetTouches) {
				ev.clientX = ev.targetTouches[0].clientX;
				ev.clientY = ev.targetTouches[0].clientY;
			}

			const xDiff = ev.clientX - this._dragStart.x;
			const yDiff = ev.clientY - this._dragStart.y;
			const angle = Math.atan2(yDiff, xDiff);
			const distance = Math.min(50, Math.hypot(xDiff, yDiff));

			this._stickPos = {
				x: distance * Math.cos(angle),
				y: distance * Math.sin(angle),
			};

			this.batch(() => {
				this.stickX.set(this._stickPos.x);
				this.stickY.set(this._stickPos.y);
			});

			let dAngle = angle * (180 / Math.PI);
			if (dAngle < 0) {
				dAngle = 360 - Math.abs(dAngle);
			}

			delete _pressed[Settings.forward];
			delete _pressed[Settings.backwards];
			delete _pressed[Settings.left];
			delete _pressed[Settings.right];

			if (dAngle && distance > 15) {
				const a = dAngle;
				if ((a >= 337.5 && a < 360) || (a >= 0 && a < 22.5)) {
					_pressed[Settings.right] = true;
				}
				if (a >= 22.5 && a < 67.5) {
					_pressed[Settings.right] = true;
					_pressed[Settings.backwards] = true;
				}
				if (a >= 67.5 && a < 112.5) {
					_pressed[Settings.backwards] = true;
				}
				if (a >= 112.5 && a < 157.5) {
					_pressed[Settings.backwards] = true;
					_pressed[Settings.left] = true;
				}
				if (a >= 157.5 && a < 202.5) {
					_pressed[Settings.left] = true;
				}
				if (a >= 202.5 && a < 247.5) {
					_pressed[Settings.left] = true;
					_pressed[Settings.forward] = true;
				}
				if (a >= 247.5 && a < 292.5) {
					_pressed[Settings.forward] = true;
				}
				if (a >= 292.5 && a < 337.5) {
					_pressed[Settings.forward] = true;
					_pressed[Settings.right] = true;
				}
			}
		});

		// Update virtual input positions
		const updateVirtualInput = () => {
			if (this._cursorPos !== null) {
				this.batch(() => {
					this.cursorX.set(this._cursorPos.x);
					this.cursorY.set(-window.innerHeight + this._cursorPos.y);
				});
			}
			window.requestAnimationFrame(updateVirtualInput);
		};
		window.requestAnimationFrame(updateVirtualInput);
	}

	toggle(show) {
		if (show === undefined) {
			this.visible.set(!this.visible.get());
		} else {
			this.visible.set(show);
		}
	}
}

let _virtualInput = null;

if (Utils.isMobile()) {
	_virtualInput = new _VirtualInputUI();
	_virtualInput.appendTo("body");
}

// ============================================================================
// Public API
// ============================================================================

const Input = {
	cursorMovement() {
		return _cursorMovement;
	},

	toggleCursor(show) {
		if (Utils.isMobile()) return;
		if (show === undefined) {
			_visibleCursor = !_visibleCursor;
		} else {
			_visibleCursor = show;
		}
		if (_visibleCursor) {
			document.exitPointerLock();
		} else {
			document.body.requestPointerLock();
		}
	},

	toggleVirtualInput(show) {
		if (!Utils.isMobile() || !_virtualInput) return;
		_virtualInput.toggle(show);
	},

	clearInputEvents() {
		_pressed = {};
		_upevents = [];
		_downevents = [];
	},

	addKeyDownEvent(key, event) {
		_downevents.push({
			key,
			event,
			pressed: false,
		});
	},

	addKeyUpEvent(key, event) {
		_upevents.push({
			key,
			event,
		});
	},

	isDown(keyCode) {
		return _pressed[keyCode];
	},

	update() {
		// Consume accumulated mouse delta for this frame
		_cursorMovement.x = _cursorDelta.x;
		_cursorMovement.y = _cursorDelta.y;
		_cursorDelta.x = 0;
		_cursorDelta.y = 0;
	},
};

export default Input;
