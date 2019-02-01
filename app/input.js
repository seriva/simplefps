import Utils from './utils';
import Settings from './settings';
import DOM from './dom';

const h = DOM.h;

DOM.registerCSS({
    '#input': {
        zIndex: 500
    },

    '#look': {
        width: '50%',
        height: '100%',
        right: '0px',
        bottom: '0px',
        margin: 0,
        padding: 0,
        position: 'absolute'
    },

    '#cursor': {
        position: 'absolute',
        display: 'block',
        width: '50px',
        height: '50px',
        marginLeft: '-25px',
        marginTop: '-25px',
        background: 'white',
        opacity: 0,
        borderRadius: '50%'
    },

    '#move': {
        width: '50%',
        height: '100%',
        left: '0px',
        bottom: '0px',
        margin: 0,
        padding: 0,
        position: 'absolute'
    },

    '#joystick': {
        background: 'white',
        width: '100px',
        height: '100px',
        left: '35px',
        bottom: '35px',
        position: 'absolute',
        opacity: 0.5,
        borderRadius: '50%',
        zIndex: 501
    },

    '#stick': {
        background: 'white',
        borderRadius: '100%',
        cursor: 'pointer',
        userSelect: 'none',
        width: '50px',
        height: '50px',
        left: '60px',
        bottom: '60px',
        position: 'absolute',
        opacity: 0.5,
        zIndex: 502
    }
});

let visibleCursor = true;
let virtualInputVisible = Utils.isMobile();
const cursorMovement = {
    x: 0,
    y: 0
};
let pressed = {};
let upevents = [];
let downevents = [];
let timeout;
let input = null;

window.addEventListener(
    'keyup',
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
    false
);

window.addEventListener(
    'keydown',
    (ev) => {
        pressed[ev.keyCode] = true;
        for (let l = 0; l < downevents.length; l++) {
            if (downevents[l].key === ev.keyCode && !downevents[l].pressed) {
                downevents[l].event();
                downevents[l].pressed = true;
            }
        }
    },
    false
);

window.addEventListener(
    'mousemove',
    (ev) => {
        cursorMovement.x = ev.movementX;
        cursorMovement.y = ev.movementY;
        if (timeout !== undefined) {
            window.clearTimeout(timeout);
        }
        timeout = window.setTimeout(() => {
            cursorMovement.x = 0;
            cursorMovement.y = 0;
        }, 50);
    },
    false
);

if (Utils.isMobile()) {
    const look = h('div#look');
    const cursor = h('div#cursor');
    const stick = h('div#stick');
    const joystick = h('div#joystick');
    const move = h('div#move', [joystick, stick]);
    input = h('div#input', [move, look, cursor]);
    DOM.append(() => input);

    let cursorPos = null;

    // touch cursor/mouse
    look.domNode.addEventListener(
        'touchstart',
        (ev) => {
            if (ev.targetTouches) {
                cursorPos = {
                    x: ev.targetTouches[0].clientX,
                    y: ev.targetTouches[0].clientY
                };
            }
            DOM.animate(
                cursor.domNode,
                { opacity: 0.5 },
                {
                    mobileHA: false,
                    duration: 100,
                    delay: 0,
                    easing: 'ease-in'
                }
            );
        },
        false
    );
    look.domNode.addEventListener(
        'touchend',
        () => {
            cursorPos = null;
            DOM.animate(
                cursor.domNode,
                { opacity: 0.0 },
                {
                    mobileHA: false,
                    duration: 100,
                    delay: 0,
                    easing: 'ease-in'
                }
            );
        },
        false
    );
    look.domNode.addEventListener(
        'touchmove',
        (ev) => {
            ev.preventDefault();
            if (ev.targetTouches) {
                cursorPos = {
                    x: ev.targetTouches[0].clientX,
                    y: ev.targetTouches[0].clientY
                };
            }
        },
        false
    );

    // touch joystick
    let dragStart = null;
    let stickPos = null;

    stick.domNode.addEventListener('touchstart', (ev) => {
        stick.domNode.style.transition = '0s';
        if (ev.targetTouches) {
            dragStart = {
                x: ev.targetTouches[0].clientX,
                y: ev.targetTouches[0].clientY
            };
            return;
        }
        dragStart = {
            x: ev.clientX,
            y: ev.clientY
        };
    });
    move.domNode.addEventListener('touchend', () => {
        if (dragStart === null) return;
        stick.domNode.style.transition = '.2s';
        stick.domNode.style.transform = 'translate3d(0px, 0px, 0px)';
        delete pressed[Settings.forward];
        delete pressed[Settings.backwards];
        delete pressed[Settings.left];
        delete pressed[Settings.right];
        dragStart = null;
        stickPos = null;
    });
    move.domNode.addEventListener('touchmove', (ev) => {
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
            y: distance * Math.sin(angle)
        };

        let dAngle = angle * (180 / Math.PI);
        if (dAngle < 0) {
            dAngle = 360 - Math.abs(dAngle);
        }

        if (dAngle && distance > 20) {
            delete pressed[Settings.forward];
            delete pressed[Settings.backwards];
            delete pressed[Settings.left];
            delete pressed[Settings.right];
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

    // update cursor/joystink
    const updateInput = () => {
        if (stickPos !== null) {
            stick.domNode.style.transform = `translate3d(${stickPos.x}px, ${stickPos.y}px, 0px)`;
        }
        if (cursorPos !== null) {
            cursor.domNode.style.left = `${cursorPos.x}px`;
            cursor.domNode.style.top = `${cursorPos.y}px`;
        }
        window.requestAnimationFrame(updateInput);
    };
    window.requestAnimationFrame(updateInput);

    /*
    const lookTouch = new Hammer(look.domNode, {
        touchAction: 'auto',
        inputClass: Hammer.TouchInput
    });
    lookTouch.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    lookTouch.on('panstart panmove panend', (ev) => {
        cursorMovement = {
            x: 0,
            y: 0
        };
        if (ev.type === 'panmove') {
            cursorMovement = {
                x: ev.velocityX * 16 * Settings.looksensitivity,
                y: ev.velocityY * 16 * Settings.looksensitivity
            };
            if (ev.pointers && ev.pointers[0]) {
                cursor.domNode.style.left = `${ev.pointers[0].clientX}px`;
                cursor.domNode.style.top = `${ev.pointers[0].clientY}px`;
            }
        }
    });
    */
}

const Input = {
    cursorMovement() {
        return cursorMovement;
    },

    toggleCursor(show) {
        show === undefined ? (visibleCursor = !visibleCursor) : (visibleCursor = show);
        if (visibleCursor) {
            document.exitPointerLock();
        } else {
            document.body.requestPointerLock();
        }
    },

    toggleVirtualInput(show) {
        if (!Utils.isMobile()) return;
        show === undefined
            ? (virtualInputVisible = !virtualInputVisible)
            : (virtualInputVisible = show);
        if (virtualInputVisible) {
            input.domNode.style.visibility = 'visible';
        } else {
            input.domNode.style.visibility = 'hidden';
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
            pressed: false
        });
    },

    addKeyUpEvent(key, event) {
        upevents.push({
            key,
            event
        });
    },

    isDown(keyCode) {
        return pressed[keyCode];
    }
};

export { Input as default };
