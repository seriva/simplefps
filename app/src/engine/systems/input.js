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
	// Clamp delta to prevent massive jumps from browser artifacts
	const clamp = 300;
	_cursorDelta.x += Math.max(-clamp, Math.min(clamp, x));
	_cursorDelta.y += Math.max(-clamp, Math.min(clamp, y));
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
				border-radius: 50%;
				z-index: 501;
				user-select: none;
				transition: opacity 100ms ease-in;
				pointer-events: none;

				background: rgba(40, 40, 40, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.2);
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				backdrop-filter: blur(4px);
			}

			#joystick-base {
				width: 90px;
				height: 90px;
				left: 30px;
				bottom: 30px;
				position: absolute;
				border-radius: 50%;
				z-index: 501;

				background: rgba(40, 40, 40, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.2);
				box-sizing: border-box; /* Ensure border doesn't add to size */
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				backdrop-filter: blur(4px);
			}

			#joystick-stick {
				background: rgba(255, 255, 255, 0.2);
				border: 1px solid rgba(255, 255, 255, 0.3);
				box-shadow: 0 2px 2px rgba(0,0,0,0.2);
				border-radius: 100%;
				cursor: pointer;
				user-select: none;
				width: 45px;
				height: 45px;
				left: 52px;
				bottom: 52px;
				position: absolute;
				z-index: 502;
				transition: transform 0.2s;
			}

			#joystick-stick.dragging {
				transition: none;
			}

			.action-btn {
				width: 70px;
				height: 70px;
				border-radius: 50%;
				position: absolute;
				z-index: 503;
				pointer-events: auto;
				
				background: rgba(40, 40, 40, 0.6);
				border: 1px solid rgba(255, 255, 255, 0.2);
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				backdrop-filter: blur(4px);
				color: rgba(255, 255, 255, 0.9);
				
				display: flex;
				align-items: center;
				justify-content: center;
				transition: transform 0.1s ease, background 0.2s;
			}
			
			.action-btn:active {
				transform: scale(0.95);
				background: rgba(60, 60, 60, 0.8);
				border-color: rgba(255, 255, 255, 0.4);
			}

			.action-btn svg {
				width: 24px;
				height: 24px;
				fill: currentColor;
				pointer-events: none;
			}

			#btn-shoot {
				bottom: 30px;
				right: 100px;
			}

			#btn-jump {
				bottom: 100px;
				right: 30px;
			}
		`;
	}

	template() {
		return html`
			<div id="input" data-class-visible="visible">
				<div id="joystick-base"></div>
				<div id="joystick-stick" data-ref="stick"></div>
				
				<div id="btn-shoot" class="action-btn" data-ref="btnShoot">
					<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="5"/></svg>
				</div>
				
				<div id="btn-jump" class="action-btn" data-ref="btnJump">
					<svg viewBox="0 0 24 24"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>
				</div>

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
		this.on(
			this.refs.look,
			"touchstart",
			(ev) => {
				if (ev.targetTouches) {
					this._cursorPos = {
						x: ev.targetTouches[0].clientX,
						y: ev.targetTouches[0].clientY,
					};
					this._lastPos = { x: this._cursorPos.x, y: this._cursorPos.y };
				}
				this.cursorOpacity.set(0.35);
			},
			{ passive: true },
		);

		this.on(
			this.refs.look,
			"touchend",
			() => {
				this._cursorPos = null;
				this._lastPos = null;
				_cursorMovement.x = 0;
				_cursorMovement.y = 0;
				this.cursorOpacity.set(0);
			},
			{ passive: true },
		);

		this.on(
			this.refs.look,
			"touchmove",
			(ev) => {
				ev.preventDefault();
				if (ev.targetTouches && this._lastPos) {
					const currentX = ev.targetTouches[0].clientX;
					const currentY = ev.targetTouches[0].clientY;
					// Update cursor position for visual feedback
					this._cursorPos = { x: currentX, y: currentY };
					// Mobile needs higher sensitivity multiplier for responsive feel
					const mobileSensitivity = Settings.lookSensitivity * 2;
					_setCursorMovement(
						(currentX - this._lastPos.x) * mobileSensitivity,
						(currentY - this._lastPos.y) * mobileSensitivity,
					);
					this._lastPos.x = currentX;
					this._lastPos.y = currentY;
				}
			},
			{ passive: false },
		);

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

		this.on(
			this.refs.stick,
			"touchmove",
			(ev) => {
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
			},
			{ passive: false },
		);

		// Button events
		this.on(this.refs.btnShoot, "touchstart", (ev) => {
			ev.preventDefault(); // Prevent click emulation which might trigger weapon firing via other listeners
			ev.stopPropagation(); // Stop propagation to look area
			Utils.dispatchCustomEvent("game:shoot");
		});

		this.on(this.refs.btnJump, "touchstart", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			Utils.dispatchCustomEvent("game:jump");
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

	resetDelta() {
		_cursorDelta.x = 0;
		_cursorDelta.y = 0;
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
