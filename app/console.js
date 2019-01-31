import Utils from './utils';
import DOM from './dom';
import Input from './input';

const h = DOM.h;

DOM.registerCSS({
    '#console': {},
    '#console-body': {
        display: 'inline-block',
        backgroundColor: 'transparent',
        position: 'absolute',
        width: '100%',
        height: '35%',
        left: 0,
        overflow: 'none',
        zIndex: '2500',
        top: '-35vh'
    },
    '#console-content': {
        display: 'flex',
        flexDirection: 'column-reverse',
        column: 'nowrap',
        border: '1px solid #999',
        backgroundColor: '#999',
        opacity: 0.9,
        width: '100%',
        height: '100%',
        overflow: 'scroll',
        overflowX: 'hidden'
    },
    '#console-content p': {
        fontSize: '14px',
        color: '#fff',
        width: '100%',
        whiteSpace: 'nowrap',
        margin: '0px',
        lineHeight: '115%'
    },
    '#console-input': {
        display: 'flex',
        color: '#fff',
        fontSize: '14px',
        position: 'absolute',
        left: 0,
        width: '100%',
        border: '1px solid #999',
        borderBottom: '2px solid #fff',
        borderTop: '2px solid #fff',
        backgroundColor: '#999',
        opacity: 0.75,
        outline: 'none'
    }
});

// where will bind all the commands to eval execution
window.qdfpa = {};

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
        visible = false;
    }
};

DOM.append(() => h(
    'div#console',
    visible
        ? [
            h(
                'div#console-body',
                {
                    enterAnimation: (domElement) => {
                        DOM.animate(
                            domElement,
                            { top: 0 },
                            {
                                duration: 150,
                                delay: 0,
                                easing: 'ease-in-out'
                            }
                        );
                    },
                    exitAnimation: (domElement, removeDomNodeFunction) => {
                        DOM.animate(
                            domElement,
                            { top: '-35vh' },
                            {
                                duration: 150,
                                delay: 0,
                                easing: 'ease-in-out',
                                complete: removeDomNodeFunction
                            }
                        );
                    }
                },
                [
                    h(
                        'div#console-content',
                        {
                            onchange: setScrollPos
                        },
                        [
                            h('p', [
                                logs.map((log, index) => h(
                                    'span',
                                    {
                                        key: index,
                                        style: `color: ${log.color}`
                                    },
                                    [log.message, h('br')]
                                ))
                            ])
                        ]
                    ),
                    h('input#console-input', {
                        disabled: true,
                        value: command,
                        oninput: updateCommand,
                        afterCreate: setFocus,
                        onblur: hideConsole
                    })
                ]
            )
        ]
        : []
));

const deepTest = (s) => {
    s = s.split('.');
    let obj = window[s.shift()];
    while (obj && s.length) obj = obj[s.shift()];
    return obj;
};

// Console controls
Input.addKeyDownEvent(192, () => {
    visible = !visible;
});
Input.addKeyDownEvent(13, () => {
    if (command === '') return;
    try {
        Console.log(command);
        const cmd = `qdfpa.${command.toLowerCase()}`;
        let evalCmd = '';
        if (cmd.indexOf('=') > -1) {
            // we are dealing with a var assignement.
            evalCmd = cmd.split('=')[0];
        } else if (cmd.indexOf('(') > -1) {
            // we are dealing with a function.
            evalCmd = cmd.split('(')[0];
        } else {
            evalCmd = cmd;
        }
        if (evalCmd !== '') {
            evalCmd = evalCmd.trim();
            if (deepTest(evalCmd) === undefined) throw 'Command does not exist';
        }
        eval(cmd);
    } catch (error) {
        Console.warn(`Failed to execute command: ${error}`);
    }
    command = '';
    DOM.update();
});

const Console = {
    visible() {
        return visible;
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
        visible = true;
        throw new Error();
    },

    registerCmd(name, value) {
        window.qdfpa[name.toLowerCase()] = value;
    }
};

export { Console as default };
