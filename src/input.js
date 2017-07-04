import Hammer from 'hammerjs';
import nipplejs from 'nipplejs';
import Utils from './utils';
import Renderer from './renderer';
import Settings from './settings';

Utils.addCSS(
    `
    .hide-cursor {
        cursor: none;
    }

    #left-half {
        width: 50%;
        height: 100%;
        left: 0px;
        top: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        z-index : 50;
        visibility :hidden;
    }

    #right-half {
        width: 50%;
        height: 100%;
        right: 0px;
        top: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        z-index : 50;
        visibility :hidden;
    }

    .show-joystick {
        visibility: visible;
    }
    `
);

let showCursor = true;
let cursorMovement = {
    x: 0,
    y: 0
};
let pressed = {};
let upevents = [];
let downevents = [];

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

let timeout;
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

// touch input
const hammer = new Hammer(document.body);
hammer.get('pan').set({
    direction: Hammer.DIRECTION_ALL
});

// WASD input with virtual joystick
let leftUsed = false;
const leftDiv = Utils.addElement('div', 'left-half');
const move = nipplejs.create({
    zone: leftDiv,
    mode: 'static',
    position: { left: '80px', bottom: '80px' },
    color: 'white'
});
move.on('move', (evt, data) => {
    leftUsed = true;
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
    leftUsed = false;
    delete pressed[Settings.forward];
    delete pressed[Settings.backwards];
    delete pressed[Settings.left];
    delete pressed[Settings.right];
});

// mouse input with virtual joystick
let rightUsed = false;
const rightDiv = Utils.addElement('div', 'right-half');
const look = nipplejs.create({
    zone: rightDiv,
    mode: 'static',
    position: { right: '80px', bottom: '80px' },
    color: 'white'
});
look.on('move', (evt, data) => {
    rightUsed = true;
    if (data.distance && data.distance > 20) {
        cursorMovement = {
            x: (data.position.x - data.instance.position.x) / 2.5,
            y: (data.position.y - data.instance.position.y) / 3.5
        };
    }
}).on('end', () => {
    rightUsed = false;
    cursorMovement = {
        x: 0,
        y: 0
    };
});

if (Utils.isMobile()) {
    leftDiv.firstChild.classList.add('show-joystick');
    rightDiv.firstChild.classList.add('show-joystick');
}

const Input = {
    touch: hammer,

    cursorMovement() {
        return cursorMovement;
    },

    toggleCursor(show) {
        if (show === undefined) {
            showCursor = !showCursor;
        } else {
            showCursor = show;
        }
        if (showCursor) {
            document.body.classList.remove('hide-cursor');
            document.exitPointerLock();
        } else {
            document.body.classList.add('hide-cursor');
            Renderer.canvas.requestPointerLock();
        }
    },

    joysticksUsed() {
        return rightUsed || leftUsed;
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

