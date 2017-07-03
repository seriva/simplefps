import Hammer from 'hammerjs';
import nipplejs from 'nipplejs';
import Utils from './utils';
import Renderer from './renderer';

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
        background-color: red;
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
        background-color: blue;
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

window.addEventListener('mousemove', (evt) => {
    cursorMovement = {
        x: evt.movementX,
        y: evt.movementY
    };
}, false);

const hammer = new Hammer(document.body);
hammer.get('pan').set({
    direction: Hammer.DIRECTION_ALL
});

const leftDiv = Utils.addElement('div', 'left-half');
const rightDiv = Utils.addElement('div', 'right-half');

nipplejs.create({
    zone: leftDiv,
    mode: 'static',
    position: { left: '75px', bottom: '75px' },
    color: 'white'
});

nipplejs.create({
    zone: rightDiv,
    mode: 'static',
    position: { right: '75px', bottom: '75px' },
    color: 'white'
});

if (Utils.isMobile()) {
    leftDiv.firstChild.classList.add('show-joystick');
    rightDiv.firstChild.classList.add('show-joystick');
}

const Input = {
    touch: hammer,

    cursorMovement() {
        const cm = cursorMovement;
        cursorMovement = {
            x: 0,
            y: 0
        };
        return cm;
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

