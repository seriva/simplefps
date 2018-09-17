import Hammer from 'hammerjs';
import Utils from './utils';
import DOM from './dom';
import Input from './input';

const h = DOM.h;

Utils.addCSS(
    `
    #console {}

    #console-body {
        transition: top 0.150s ease-in-out;
        display: inline-block;
        background-color: transparent;
        position: absolute;
        width: 100%;
        height: 35%;
        left: 0;
        overflow: none;
        z-index : 2500;
    }

    #console-swipe {
        width: 100%;
        height: 100px;
        right: 0px;
        top: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        opacity: 0.01;
    }

    #console-content {
        display: flex;
        flex-direction: column-reverse;
        column nowrap;
        border:1px solid #999;
        background-color: #999;
        opacity: 0.90;
        width: 100%;
        height: 100%;
        overflow: scroll;
        overflow-x: hidden;
    }

    #console-content p {
        font-size: 14px;
        color: #fff; 
        width: 100%;
        white-space: nowrap;
        margin: 0px;
        line-height: 115%;
    }

    #console-input {
        display: flex;
        color: #fff;
        font-size: 14px;
        position: absolute;
        left: 0;
        width: 100%;
        border: 1px solid #999;
        border-bottom: 2px solid #fff;
        border-top: 2px solid #fff;
        background-color: #999;
        opacity: 0.75;
        outline: none;
    }

    .console-show {
        top: -35vh;
    }

    .console-show.console-show-active {
        top: 0;
    }
    .console-hide {
        top: 0;
    }

    .console-hide.console-hide-active {
        top: -35vh;
    }
    `
);

// where will bind all the commands to eval execution
window.qdfps = {};

// local vars
let visible = false;
let command = '';
const logs = [];

// gui functions
const setFocus = (el) => {
    setTimeout(() => {
        el.disabled = false;
        el.focus();
    }, 100);
};

const setScrollPos = (el) => {
    el.scrollTop = el.scrollHeight;
};

const updateCommand = (evt) => {
    command = evt.target.value;
};

const hideConsole = () => {
    if (Utils.isMobile()) {
        Console.toggle(false);
    }
};

DOM.append(() =>
    h('div#console',
    visible ?
    [
        h('div#console-body', {
            enterAnimation: DOM.createEnterCssTransition('console-show'),
            exitAnimation: DOM.createExitCssTransition('console-hide')
        }, [
            h('div#console-content', {
                onchange: setScrollPos
            }, [
                h('p', [
                    logs.map((log, index) => {
                        return h('span', { key: index, style: 'color:' + log.color }, [log.message, h('br')]);
                    })
                ]),
            ]),
            h('input#console-input', {
                disabled: true,
                value: command,
                oninput: updateCommand,
                afterCreate: setFocus,
                onblur: hideConsole
            })
        ])
    ]
    :
    [])
);

// Console controls
Input.addKeyDownEvent(192, () => {
    Console.toggle();
    Input.toggleCursor();
});
Input.addKeyDownEvent(13, () => {
    Console.execute();
});

if (Utils.isMobile()) {
    // Swipedown console for mobile.
    const consoleTouch = new Hammer(Utils.addElement('div', 'console-swipe', document.getElementById('console')));
    consoleTouch.get('pan').set({
        direction: Hammer.DIRECTION_ALL
    });
    consoleTouch.on('pandown', (ev) => {
        if (ev.distance > 50) {
            if (ev.type === 'pandown') {
                Console.toggle(true);
            }
        }
    });
}

const Console = {
    visible() {
        return visible;
    },

    execute() {
        if (command === '') return;
        try {
            Console.log(command);
            eval('qdfps.' + command.toLowerCase());
        } catch (error) {
            Console.warn('Failed to execute command');
        }
        command = '';
        DOM.update();
    },

    toggle(show) {
        show === undefined ? visible = !visible: visible = show;
    },

    log(m) {
        console.log(m);
        logs.push({
            color: '#FFF',
            message: m
        });
    },

    warn(m) {
        console.warn(m);
        logs.push({
            color: '#FF0',
            message: m
        });
    },

    error(m) {
        document.body.innerHTML = m;
        console.error(m);
        logs.push({
            color: '#F00',
            message: m
        });
        this.toggle();
        throw new Error();
    },

    registerCmd(name, value) {
        window.qdfps[name.toLowerCase()] = value;
    }
};

export { Console as default };
