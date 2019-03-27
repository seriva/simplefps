import DOM from './dom.js';

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

const toggle = (show) => {
    show === undefined ? (visible = !visible) : (visible = show);
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
                        afterCreate: setFocus
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

function setDeepValue(obj, path, value) {
    if (typeof path === "string") {
        var path = path.split('.');
    }

    if (path.length > 1) {
        var p = path.shift();
        if (obj[p] == null || typeof obj[p] !== 'object') {
            obj[p] = {};
        }
        setDeepValue(obj[p], path, value);
    } else {
        obj[path[0]] = value;
    }
}

const Console = {
    visible() {
        return visible;
    },

    toggle,

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
        throw new Error(m);
    },

    registerCmd(name, value) {
        window.qdfpa[name.toLowerCase()] = value;
    },

    executeCmd() {
        if (command === '') return;
        try {
            Console.log(command);
            const cmd = `qdfpa.${command.toLowerCase()}`;
            if (cmd.indexOf('=') > -1) {
                // we are dealing with a var assignement.
                let split = cmd.split('=');
                let variable = split[0].trim();
                let value = split[1].trim();
                if (deepTest(variable) === undefined) throw new Error('Variable does not exist');
                setDeepValue(window, variable, value);
            } else if (cmd.indexOf('(') > -1) {
                // we are dealing with a function.
            } else {
                throw new Error('Parsing command failed');
            }
        } catch (error) {
            Console.warn(`Failed to execute command: ${error}`);
        }
        command = '';
        DOM.update();
    }
};

export { Console as default };
