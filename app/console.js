import Utils from './utils';
import GUI from './gui';
import Stats from './stats';

const h = GUI.h;

Utils.addCSS(
    `
    #console {
        transition: top 0.150s ease-in-out;
        display: inline-block;
        background-color: transparent;
        position: absolute;
        z-index : 200;
        width: 100%;
        height: 35%;
        left: 0;
        overflow: none;
    }

    #console-content {
        display: flex;
        flex-direction: column-reverse;
        column nowrap;
        border:1px solid #999;
        background-color: #999;
        opacity: 0.75;
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
        Stats.toggle(true);
    }
};

GUI.append(() =>
    h('div',
    visible ?
    [
        h('div#console', {
            enterAnimation: GUI.createEnterCssTransition('console-show'),
            exitAnimation: GUI.createExitCssTransition('console-hide')
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

const Console = {
    visible() {
        return visible;
    },

    execute() {
        // TODO: add actual execution and registration
        if (command === '') return;
        this.warn('Unknown command "' + command + '"');
        command = '';
        GUI.update();
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
    }
};

export { Console as default };
