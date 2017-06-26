import Hammer from '../node_modules/hammerjs/hammer';
import Utils from './utils';
import Renderer from './renderer';

Utils.addCSS(
    `
    .hide-cursor {
        cursor: none;
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

