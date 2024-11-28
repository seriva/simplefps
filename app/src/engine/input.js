import Console from "./console.js";
import DOM from "./dom.js";
import Settings from "./settings.js";
import Utils from "./utils.js";

DOM.css({
	"#input": {
		zIndex: 500,
	},

	"#look": {
		width: "80%",
		height: "100%",
		right: "0px",
		bottom: "0px",
		margin: 0,
		padding: 0,
		position: "absolute",
		zIndex: 502,
	},

	"#cursor": {
		position: "absolute",
		display: "block",
		width: "50px",
		height: "50px",
		marginLeft: "-25px",
		marginTop: "-25px",
		background: "white",
		opacity: 0,
		borderRadius: "50%",
		zIndex: 501,
		userSelect: "none",
	},

	"#joystick-base": {
		background: "white",
		width: "100px",
		height: "100px",
		left: "35px",
		bottom: "35px",
		position: "absolute",
		opacity: 0.35,
		borderRadius: "50%",
		zIndex: 501,
	},

	"#joystick-stick": {
		background: "white",
		borderRadius: "100%",
		cursor: "pointer",
		userSelect: "none",
		width: "50px",
		height: "50px",
		left: "60px",
		bottom: "60px",
		position: "absolute",
		opacity: 0.35,
		zIndex: 502,
	},
});

let visibleCursor = true;
let virtualInputVisible = Utils.isMobile();
const cursorMovement = {
	x: 0,
	y: 0,
};
let pressed = {};
let upevents = [];
let downevents = [];
let timeout;
let input = null;
let gamepad = false;
let updateCallback = null;

window.addEventListener(
	"keyup",
	(ev) => {
		delete pressed[ev.keyCode];
		for (let l = 0; l < upevents.length; l++) {
			if (upevents[l].key === ev.keyCode) {
				upevents[l].event();
			}
		}
		for (let l = 0; l < downevents.length; l++) {
			if (downevents[l].pressed) {
				downevents[l].pressed = false;
			}
		}
	},
	false,
);

window.addEventListener(
	"keydown",
	(ev) => {
		pressed[ev.keyCode] = true;
		for (let l = 0; l < downevents.length; l++) {
			if (downevents[l].key === ev.keyCode && !downevents[l].pressed) {
				downevents[l].event();
				downevents[l].pressed = true;
			}
		}
	},
	false,
);

const setCursorMovement = (x, y) => {
	cursorMovement.x = x;
	cursorMovement.y = y;
	if (timeout !== undefined) {
		window.clearTimeout(timeout);
	}
	timeout = window.setTimeout(() => {
		cursorMovement.x = 0;
		cursorMovement.y = 0;
	}, 50);
};

window.addEventListener(
	"mousemove",
	(ev) => {
		setCursorMovement(ev.movementX, ev.movementY);
	},
	false,
);

window.addEventListener("gamepadconnected", () => {
	const gp = navigator.getGamepads()[0];
	Console.log(`Gamepad connected: : ${gp.id}`);
	gamepad = true;
	Utils.dispatchCustomEvent("changestate", {
		state: "MENU",
		menu: "MAIN_MENU",
	});
});

window.addEventListener("gamepaddisconnected", () => {
	Console.log("Gamepad disconnected");
	gamepad = false;
	Utils.dispatchCustomEvent("changestate", {
		state: "MENU",
		menu: "MAIN_MENU",
	});
});

if (Utils.isMobile()) {
	let cursorPos = null;
	let lastPos = null;
	let stickPos = null;

	const look = DOM.h("div#look");
	const cursor = DOM.h("div#cursor");
	const joystickStick = DOM.h("div#joystick-stick");
	const joystickBase = DOM.h("div#joystick-base");
	input = DOM.h("div#input", [joystickBase, joystickStick, look, cursor]);
	DOM.append(() => input);

	// touch cursor/mouse
	look.domNode.addEventListener(
		"touchstart",
		(ev) => {
			if (ev.targetTouches) {
				cursorPos = {
					x: ev.targetTouches[0].clientX,
					y: ev.targetTouches[0].clientY,
				};
				lastPos = cursorPos;
			}
			DOM.animate(
				cursor.domNode,
				{
					opacity: 0.35,
				},
				{
					mobileHA: false,
					duration: 100,
					delay: 0,
					easing: "ease-in",
				},
			);
		},
		false,
	);
	look.domNode.addEventListener(
		"touchend",
		() => {
			cursorPos = null;
			lastPos = null;
			cursorMovement.x = 0;
			cursorMovement.y = 0;
			DOM.animate(
				cursor.domNode,
				{
					opacity: 0.0,
				},
				{
					mobileHA: false,
					duration: 100,
					delay: 0,
					easing: "ease-in",
				},
			);
		},
		false,
	);
	look.domNode.addEventListener(
		"touchmove",
		(ev) => {
			ev.preventDefault();
			if (ev.targetTouches) {
				cursorPos = {
					x: ev.targetTouches[0].clientX,
					y: ev.targetTouches[0].clientY,
				};
				setCursorMovement(
					(cursorPos.x - lastPos.x) * Settings.lookSensitivity,
					(cursorPos.y - lastPos.y) * Settings.lookSensitivity,
				);
				lastPos.x = cursorPos.x;
				lastPos.y = cursorPos.y;
			}
		},
		false,
	);

	let dragStart = null;

	joystickStick.domNode.addEventListener("touchstart", (ev) => {
		joystickStick.domNode.style.transition = "0s";
		if (ev.targetTouches) {
			dragStart = {
				x: ev.targetTouches[0].clientX,
				y: ev.targetTouches[0].clientY,
			};
			return;
		}
		dragStart = {
			x: ev.clientX,
			y: ev.clientY,
		};
	});
	joystickStick.domNode.addEventListener("touchend", () => {
		if (dragStart === null) return;
		joystickStick.domNode.style.transition = ".2s";
		joystickStick.domNode.style.transform = "translate3d(0px, 0px, 0px)";
		delete pressed[Settings.forward];
		delete pressed[Settings.backwards];
		delete pressed[Settings.left];
		delete pressed[Settings.right];
		dragStart = null;
		stickPos = null;
	});
	joystickStick.domNode.addEventListener("touchmove", (ev) => {
		ev.preventDefault();
		if (dragStart === null) return;
		if (ev.targetTouches) {
			ev.clientX = ev.targetTouches[0].clientX;
			ev.clientY = ev.targetTouches[0].clientY;
		}
		const xDiff = ev.clientX - dragStart.x;
		const yDiff = ev.clientY - dragStart.y;
		const angle = Math.atan2(yDiff, xDiff);
		const distance = Math.min(50, Math.hypot(xDiff, yDiff));
		stickPos = {
			x: distance * Math.cos(angle),
			y: distance * Math.sin(angle),
		};

		let dAngle = angle * (180 / Math.PI);
		if (dAngle < 0) {
			dAngle = 360 - Math.abs(dAngle);
		}

		delete pressed[Settings.forward];
		delete pressed[Settings.backwards];
		delete pressed[Settings.left];
		delete pressed[Settings.right];

		if (dAngle && distance > 15) {
			const a = dAngle;
			if ((a >= 337.5 && a < 360) || (a >= 0 && a < 22.5)) {
				pressed[Settings.right] = true;
			}
			if (a >= 22.5 && a < 67.5) {
				pressed[Settings.right] = true;
				pressed[Settings.backwards] = true;
			}
			if (a >= 67.5 && a < 112.5) {
				pressed[Settings.backwards] = true;
			}
			if (a >= 112.5 && a < 157.5) {
				pressed[Settings.backwards] = true;
				pressed[Settings.left] = true;
			}
			if (a >= 157.5 && a < 202.5) {
				pressed[Settings.left] = true;
			}
			if (a >= 202.5 && a < 247.5) {
				pressed[Settings.left] = true;
				pressed[Settings.forward] = true;
			}
			if (a >= 247.5 && a < 292.5) {
				pressed[Settings.forward] = true;
			}
			if (a >= 292.5 && a < 337.5) {
				pressed[Settings.forward] = true;
				pressed[Settings.right] = true;
			}
		}
	});

	// update virtual input
	const updateVirtualInput = () => {
		if (stickPos !== null) {
			joystickStick.domNode.style.transform = `translate3d(${stickPos.x}px, ${stickPos.y}px, 0px)`;
		}
		if (cursorPos !== null) {
			cursor.domNode.style.transform = `translate3d(${cursorPos.x}px, ${
				-window.innerHeight + cursorPos.y
			}px, 0px)`;
		}
		window.requestAnimationFrame(updateVirtualInput);
	};
	window.requestAnimationFrame(updateVirtualInput);
}

// update virtual input
const updateGamepad = () => {
	const gp = navigator.getGamepads()[0];
	if (gamepad && gp) {
		delete pressed[Settings.forward];
		delete pressed[Settings.backwards];
		delete pressed[Settings.left];
		delete pressed[Settings.right];

		if (gp.axes[0] < 0) {
			pressed[Settings.left] = true;
		} else if (gp.axes[0] > 0) {
			pressed[Settings.right] = true;
		}
		if (gp.axes[1] < 0) {
			pressed[Settings.forward] = true;
		} else if (gp.axes[1] > 0) {
			pressed[Settings.backwards] = true;
		}

		// TODO: add sensitivity
		setCursorMovement(gp.axes[2] * 15, gp.axes[3] * 15);
	}
	window.requestAnimationFrame(updateGamepad);
};
window.requestAnimationFrame(updateGamepad);

const Input = {
	cursorMovement() {
		return cursorMovement;
	},

	toggleCursor(show) {
		if (Utils.isMobile()) return;
		if (show === undefined) {
			visibleCursor = !visibleCursor;
		} else {
			visibleCursor = show;
		}
		if (visibleCursor) {
			document.exitPointerLock();
		} else {
			document.body.requestPointerLock();
		}
	},

	toggleVirtualInput(show) {
		if (!Utils.isMobile()) return;
		if (show === undefined) {
			virtualInputVisible = !virtualInputVisible;
		} else {
			virtualInputVisible = show;
		}
		if (virtualInputVisible && gamepad === false) {
			input.domNode.style.visibility = "visible";
		} else {
			input.domNode.style.visibility = "hidden";
		}
	},

	clearInputEvents() {
		pressed = {};
		upevents = [];
		downevents = [];
	},

	addKeyDownEvent(key, event) {
		downevents.push({
			key,
			event,
			pressed: false,
		});
	},

	addKeyUpEvent(key, event) {
		upevents.push({
			key,
			event,
		});
	},

	isDown(keyCode) {
		return pressed[keyCode];
	},

	setUpdateCallback(callback) {
		updateCallback = callback;
	},

	update(frameTime) {
		if (updateCallback !== null) {
			updateCallback(frameTime);
		}
	},
};

export { Input as default };
