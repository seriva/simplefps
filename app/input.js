import Hammer from 'hammerjs';
import nipplejs from 'nipplejs';
import Utils from './utils';
import Settings from './settings';

Utils.addCSS(
    `
    #input {
        z-index: 500;
    }

    .hide-cursor {
        cursor: none;
    }

    #virtual-cursor {
        position: absolute;
        display: block;
        width: 50px;
        height: 50px;
        marginLeft: -25px;
        marginTop: -25px;
        background: white;
        opacity: 0;
        border-radius: 50%;
    }

    @-webkit-keyframes virtual-cursor-fadein {
        from { opacity: 0; }
        to   { opacity: 0.5; }
    }

    .virtual-cursor-fadein {
        -webkit-animation: virtual-cursor-fadein .1s ease-in 1 forwards;
    }

    @-webkit-keyframes virtual-cursor-fadeout {
        from { opacity: 0.5; }
        to   { opacity: 0; }
    }

    .virtual-cursor-fadeout {
        -webkit-animation: virtual-cursor-fadeout .1s ease-in 1 forwards;
    }

    #move-div {
        width: 200px;
        height: 100%;
        left: 0px;
        bottom: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        visibility :hidden;
    }

    #look-div {
        width: calc(100% - 200px);
        height: 100%;
        right: 0px;
        bottom: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        opacity: 0.01;
    }

    .show-joystick {
        visibility: visible;
    }
    `
);

let visibleCursor = true;
let virtualInputVisible = Utils.isMobile();
let cursorMovement = {
    x: 0,
    y: 0
};
let pressed = {};
let upevents = [];
let downevents = [];
let timeout;

window.addEventListener('keyup', (event) => {
    delete pressed[event.keyCode];
    for (let l = 0; l < upevents.length; l++) {
        if (upevents[l].key === event.keyCode) {
            upevents[l].event();
        }
    }
    for (let l = 0; l < downevents.length; l++) {
        if (downevents[l].pressed) {
            downevents[l].pressed = false;
        }
    }
}, false);

window.addEventListener('keydown', (event) => {
    pressed[event.keyCode] = true;
    for (let l = 0; l < downevents.length; l++) {
        if (downevents[l].key === event.keyCode && (!downevents[l].pressed)) {
            downevents[l].event();
            downevents[l].pressed = true;
        }
    }
}, false);

window.addEventListener('mousemove', (evt) => {
    cursorMovement = {
        x: evt.movementX,
        y: evt.movementY
    };
    if (timeout !== undefined) {
        window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
        cursorMovement = {
            x: 0,
            y: 0
        };
    }, 50);
}, false);

if (Utils.isMobile()) {
    // virtual mouse input
    const virtualInputRoot = Utils.addElement('div', 'input');
    const virtualCursor = Utils.addElement('div', 'virtual-cursor', virtualInputRoot);
    const lookDiv = Utils.addElement('div', 'look-div', virtualInputRoot);
    const look = new Hammer(lookDiv, { touchAction: 'auto', inputClass: Hammer.TouchInput });
    look.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    look.on('panstart panmove panend', (ev) => {
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
                virtualCursor.style.left = ev.pointers[0].clientX-25+'px';
                virtualCursor.style.top = ev.pointers[0].clientY-25+'px';
            }
        }
        if (ev.type === 'panstart') {
            virtualCursor.classList.add('virtual-cursor-fadein');
            virtualCursor.classList.remove('virtual-cursor-fadeout');
        }
        if (ev.type === 'panend') {
            virtualCursor.classList.remove('virtual-cursor-fadein');
            virtualCursor.classList.add('virtual-cursor-fadeout');
        }
    });

    // WASD input with virtual joystick
    const moveDiv = Utils.addElement('div', 'move-div', virtualInputRoot);
    const move = nipplejs.create({
        zone: moveDiv,
        mode: 'static',
        position: { left: '80px', bottom: '80px' },
        color: 'white'
    });
    move.on('move', (evt, data) => {
        if (data.angle && data.distance && data.distance > 20) {
            delete pressed[Settings.forward];
            delete pressed[Settings.backwards];
            delete pressed[Settings.left];
            delete pressed[Settings.right];
            const a = data.angle.degree;
            if ((a >= 337.5 && a < 360) || (a >= 0 && a < 22.5)) {
                pressed[Settings.right] = true;
            }
            if (a >= 22.5 && a < 67.5) {
                pressed[Settings.right] = true;
                pressed[Settings.forward] = true;
            }
            if (a >= 67.5 && a < 112.5) {
                pressed[Settings.forward] = true;
            }
            if (a >= 112.5 && a < 157.5) {
                pressed[Settings.forward] = true;
                pressed[Settings.left] = true;
            }
            if (a >= 157.5 && a < 202.5) {
                pressed[Settings.left] = true;
            }
            if (a >= 202.5 && a < 247.5) {
                pressed[Settings.left] = true;
                pressed[Settings.backwards] = true;
            }
            if (a >= 247.5 && a < 292.5) {
                pressed[Settings.backwards] = true;
            }
            if (a >= 292.5 && a < 337.5) {
                pressed[Settings.backwards] = true;
                pressed[Settings.right] = true;
            }
        }
    }).on('end', () => {
        delete pressed[Settings.forward];
        delete pressed[Settings.backwards];
        delete pressed[Settings.left];
        delete pressed[Settings.right];
    });
    moveDiv.firstChild.classList.add('show-joystick');
}

const Input = {
    cursorMovement() {
        return cursorMovement;
    },

    toggleCursor(show) {
        show === undefined ? visibleCursor = !visibleCursor: visibleCursor = show;
        if (visibleCursor) {
            document.body.classList.remove('hide-cursor');
            document.exitPointerLock();
        } else {
            document.body.classList.add('hide-cursor');
            document.getElementById('game').requestPointerLock();
        }
    },

    toggleVirtualInput(show) {
        if (!Utils.isMobile()) return;
        show === undefined ? virtualInputVisible = !virtualInputVisible: virtualInputVisible = show;
        const move = document.getElementById('move-div');
        if (virtualInputVisible) {
            move.firstChild.classList.add('show-joystick');
        } else {
            move.firstChild.classList.remove('show-joystick');
        }
    },

    clearInputEvents() {
        pressed = {};
        upevents = [];
        downevents = [];
    },

    addKeyDownEvent(key, event) {
        downevents.push({
            /* eslint-disable */
            key: key,
            event: event,
            /* eslint-disable */
            pressed: false
        });
    },

    addKeyUpEvent(key, event) {
        upevents.push({
             /* eslint-disable */
            key: key,
            event: event
             /* eslint-disable */
        });
    },

    isDown(keyCode){
        return pressed[keyCode];
    }
}

export {Input as default };

