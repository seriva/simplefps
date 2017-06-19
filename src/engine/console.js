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

const consolediv = Utils.addElement('div', 'console');
const inputfield = Utils.addElement('input', 'console-input');
inputfield.disabled = true;

Input.addKeyDownEvent(192, () => {
    Console.toggle();
});
Input.addKeyDownEvent(13, () => {
    Console.execute();
});
/*
e.touch.on('panup pandown', (ev) => {
    if (ev.type === 'panup') {
        Console.toggle(false);
    }
    if (ev.type === 'pandown') {
        Console.toggle(true);
    }
});
*/

const Console = {
    execute() {
        // TODO: add actual execution and registration
        if (inputfield.value === '') return;
        this.warn('Unknown command "' + inputfield.value + '"');
        inputfield.value = '';
    },

    toggle(show) {
        if (show === undefined) {
            visible = !visible;
        } else {
            visible = show;
        }
        if (visible) {
            consolediv.classList.add('console-down');
            inputfield.classList.add('console-input-down');
            inputfield.disabled = false;
            setTimeout(() => {
                inputfield.focus();
            }, 100);
            this.update();
        } else {
            consolediv.classList.remove('console-down');
            inputfield.classList.remove('console-input-down');
            inputfield.disabled = true;
        }
    },

    update() {
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
        consolediv.innerHTML = text + '</p>';
        consolediv.scrollTop = consolediv.scrollHeight;
    },

    log(m) {
        console.log(m);
        logs.push({
            type: 'log',
            message: m
        });
        this.update();
    },

    warn(m) {
        console.warn(m);
        logs.push({
            type: 'warning',
            message: m
        });
        this.update();
    },

    error(m) {
        console.error(m);
        logs.push({
            type: 'error',
            message: m
        });
        this.update();
        this.toggle();
        throw new Error();
    }
};

export { Console as default };
