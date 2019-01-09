import DOM from './dom';
import Console from './console';

const h = DOM.h;

// add css
DOM.registerCSS({
    '#stats': {
        margin: 0,
        padding: 0,
        backgroundColor: 'transparent',
    },
    '#stats-text': {
        fontSize: '12px',
        color: '#FFF',
        left: '8px',
        top: '8px',
        zIndex: 3000,
        position: 'absolute',
    },
    '#stats-fps': {
        color: '#F00',
        marginLeft: '5px'
    },
    '#stats-ft': {
        color: '#4F4',
        marginLeft: '5px'
    },
    '#stats-mem': {
        color: '#00F',
        marginLeft: '5px'
    }
});

let fps = 0;
let frameTime = 0;
let memory = 0;
let visible = true;
let prevTime = 0;
let frames = 0;

Console.registerCmd('stats', visible);

window.setInterval(() => {
    fps = frames;
    frames = 0;
    memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
}, 1000);

DOM.append(() =>
    h('div#stats', visible ?
    [
        h('div#stats-text', [
            h('span##stats-fps', [fps + 'fps']),
            h('span##stats-ft', [Math.round(frameTime) + 'ms']),
            h('span##stats-mem', [memory + 'mb'])
        ])
    ]
    :
    [])
);

const toggle = (show) => {
    show === undefined ? visible = !visible: visible = show;
};

const Stats = {
    toggle,
    update() {
        const now = performance.now();
        frameTime = now - (prevTime || now);
        prevTime = now;
        frames++;
    }
};

export { Stats as default };
