class Input {
    constructor(engine) {
        this.e = engine;
        const i = this;
        i.pressed = {};
        i.upevents = [];
        i.downevents = [];

        window.addEventListener('keyup', (event) => {
            delete i.pressed[event.keyCode];
            for (let l = 0; l < i.upevents.length; l++) {
                if (i.upevents[l].key === event.keyCode) {
                    i.upevents[l].event();
                }
            }
            for (let l = 0; l < i.downevents.length; l++) {
                if (i.downevents[l].pressed) {
                    i.downevents[l].pressed = false;
                }
            }
        }, false);
        window.addEventListener('keydown', (event) => {
            i.pressed[event.keyCode] = true;
            for (let l = 0; l < i.downevents.length; l++) {
                if (i.downevents[l].key === event.keyCode && (!i.downevents[l].pressed)) {
                    i.downevents[l].event();
                    i.downevents[l].pressed = true;
                }
            }
        }, false);
    }

    clearInputEvents() {
        this.pressed = {};
        this.upevents = [];
        this.downevents = [];
    }

    addKeyDownEvent(key, event) {
        this.downevents.push({
            /* eslint-disable */
            key: key,
            event: event,
            /* eslint-disable */
            pressed: false
        });
    }

    addKeyUpEvent(key, event) {
        this.upevents.push({
             /* eslint-disable */
            key: key,
            event: event
             /* eslint-disable */
        });
    }

    isDown(keyCode) {
        return this.pressed[keyCode];
    }
}

export {Input as default };

