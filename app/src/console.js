import DOM from './dom.js';

DOM.css({
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
window.simplefps = {};

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

DOM.append(() => DOM.h(
    'div#console',
    visible
        ? [
            DOM.h(
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
                    DOM.h(
                        'div#console-content',
                        {
                            onchange: setScrollPos
                        },
                        [
                            DOM.h('p', [
                                logs.map((log, index) => DOM.h(
                                    'span',
                                    {
                                        key: index,
                                        style: `color: ${log.color}`
                                    },
                                    [log.message, DOM.h('br')]
                                ))
                            ])
                        ]
                    ),
                    DOM.h('input#console-input', {
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

const convertValue = (type, value) => {
    switch (type) {
    case 'string':
        return value;
    case 'number':
        if (Number.isNaN(Number(value))) {
            throw new Error('Parsing of value failed');
        }
        return Number(value);
    case 'boolean':
    case 'object':
        return JSON.parse(value);
    default:
        throw new Error('Parsing of value failed');
    }
};

const deepTest = (s) => {
    s = s.split('.');
    let obj = window[s.shift()];
    while (obj && s.length) obj = obj[s.shift()];
    return obj;
};

const setDeepValue = (obj, path, value) => {
    if (typeof path === 'string') {
        path = path.split('.');
    }

    if (path.length > 1) {
        const p = path.shift();
        setDeepValue(obj[p], path, value);
    } else {
        obj[path[0]] = convertValue(typeof obj[path[0]], value);
    }
};

const executeDeepFunction = (obj, path, params) => {
    if (typeof path === 'string') {
        path = path.split('.');
    }

    if (path.length > 1) {
        const p = path.shift();
        executeDeepFunction(obj[p], path, params);
    } else if (typeof obj[path[0]] === 'function') obj[path[0]](...params);
    else throw new Error('Parsing of function failed');
};

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
        window.simplefps[name.toLowerCase()] = value;
    },

    executeCmd() {
        if (command === '') return;
        try {
            Console.log(command);
            const cmd = `simplefps.${command}`;
            if (cmd.indexOf('=') > -1) {
                // we are dealing with a var assignement.
                const split = cmd.split('=');
                const variable = split[0].trim();
                const value = split[1].trim();
                if (deepTest(variable) === undefined) throw new Error('Variable does not exist');
                setDeepValue(window, variable, value);
            } else if (cmd.indexOf('(') > -1) {
                const split = cmd.split('(');
                const func = split[0].trim();
                const params = JSON.parse(`[${split[1].trim().replace(')', ']')}`);
                if (deepTest(func) === undefined) throw new Error('Function does not exist');
                executeDeepFunction(window, func, params);
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
