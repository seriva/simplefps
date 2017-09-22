import Utils from './utils';
import GUI from './gui';

const h = GUI.h;

Utils.addCSS(
    `
    #console {}

    #console-content {
        -webkit-transition: all 0.150s ease-in-out;
        display: flex; flex-flow:
        column nowrap;
        line-height: 95%;
        border:1px solid #999;
        background-color: #999;
        opacity: 0.75;
        z-index : 200;
        width: 100%;
        height: 35%;
        position: absolute;
        left: 0;
        overflow: scroll;
        overflow-x: hidden;
        margin-top: auto !important;
        font-size: 14px;
        color: #fff; 
        margin: 0px;
        white-space: nowrap;
    }

    #console-input {
        -webkit-transition: all 0.150s ease-in-out;
        display: inline;
        color: #fff;
        font-size: 14px;
        position: absolute;
        z-index : 200;
        left: 0; width:100%;
        border:1px solid #999;
        border-bottom:2px solid #fff;
        border-top:2px solid #fff;
        background-color: #999;
        opacity: 0.75;
        outline: none;
        top: 35vh;
    }

    .console-content-down {
        -webkit-transform: translate(0,37vh);
    }

    .console-input-down {
        -webkit-transform: translate(0,72vh);
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

GUI.append(() =>
    h('div#console', visible ?
    [
        h('div#console-content', {
            afterUpdate: setScrollPos
        }, [
            logs.map((log, index) => {
                return h('span', { key: index, style: 'color:' + log.color }, log.message, [h('br')]);
            })
        ]),
        h('input#console-input', {
            disabled: true,
            value: command,
            oninput: updateCommand,
            afterCreate: setFocus
        })
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
