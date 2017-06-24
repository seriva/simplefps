import Utils from './utils';
import Input from './input';

let visible = false;
const logs = [];

Utils.addCSS(
    `
    #console {
        -webkit-transition: all 0.150s ease-in-out; 
        display: flex; flex-flow: 
        column nowrap; 
        line-height: 95%; 
        border:1px solid #999; 
        border-bottom:1px solid #fff; 
        background-color: #999; 
        opacity: 0.75; 
        z-index : 2; 
        width: 100%; 
        height: 50%; 
        position: absolute; 
        top: -52vh; 
        left: 0; 
        overflow: scroll; 
        overflow-x: hidden;
    }

    #console-input {
        -webkit-transition: all 0.150s ease-in-out; 
        display: inline; 
        color: #fff; 
        font-size: 14px; 
        position: absolute; 
        top: -52vh; 
        left: 0; width:100%; 
        border:1px solid #999; 
        border-bottom:2px solid #fff; 
        background-color: #999; 
        opacity: 0.75; outline: none;
    }

    #console p { 
        margin-top: auto !important; 
        font-size: 14px; 
        color: #fff; margin: 0px; 
        white-space: nowrap;
    }

    .console-down {
        -webkit-transform: translate(0,52vh);
    }

    .console-input-down {
        -webkit-transform: translate(0,102vh);
    }
    `
);

const consoleDiv = Utils.addElement('div', 'console');
const inputField = Utils.addElement('input', 'console-input');
consoleDiv.disabled = true;

Input.addKeyDownEvent(192, () => {
    Console.toggle();
});
Input.addKeyDownEvent(13, () => {
    Console.execute();
});
Input.touch.on('panup pandown', (ev) => {
    if (ev.type === 'panup') {
        Console.toggle(false);
    }
    if (ev.type === 'pandown') {
        Console.toggle(true);
    }
});

const update = () => {
    let text = '<p>';
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        let color = '#FFF';
        if (log.type === 'warning') {
            color = '#FF0';
        }
        if (log.type === 'error') {
            color = '#F00';
        }
        text = text + '<span style="color:' + color + '">' + log.message + '</span></br>';
    }
    consoleDiv.innerHTML = text + '</p>';
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
};

const Console = {
    visible() {
        return visible;
    },

    execute() {
        // TODO: add actual execution and registration
        if (inputField.value === '') return;
        this.warn('Unknown command "' + inputField.value + '"');
        inputField.value = '';
    },

    toggle(show) {
        if (show === undefined) {
            visible = !visible;
        } else {
            visible = show;
        }
        Input.toggleCursor(visible);
        if (visible) {
            consoleDiv.classList.add('console-down');
            inputField.classList.add('console-input-down');
            inputField.disabled = false;
            setTimeout(() => {
                inputField.focus();
            }, 100);
            update();
        } else {
            consoleDiv.classList.remove('console-down');
            inputField.classList.remove('console-input-down');
            inputField.disabled = true;
        }
    },

    log(m) {
        console.log(m);
        logs.push({
            type: 'log',
            message: m
        });
        update();
    },

    warn(m) {
        console.warn(m);
        logs.push({
            type: 'warning',
            message: m
        });
        update();
    },

    error(m) {
        console.error(m);
        logs.push({
            type: 'error',
            message: m
        });
        update();
        this.toggle();
        throw new Error();
    }
};

export { Console as default };
