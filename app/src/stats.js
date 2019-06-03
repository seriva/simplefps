import DOM from './dom.js';
import Console from './console.js';
import Camera from './camera.js';

DOM.css({
    '#stats': {
        margin: 0,
        padding: 0,
        backgroundColor: 'transparent'
    },
    '#stats-text': {
        fontSize: '12px',
        color: '#FFF',
        left: '8px',
        top: '8px',
        zIndex: 2001,
        position: 'absolute'
    },
    '.stats-info': {
        marginLeft: '5px'
    },
    '#stats-pos': {
        color: '#FFF',
        fontSize: '12px',
        left: '13px',
        top: '24px',
        zIndex: 2001,
        position: 'absolute'
    }
});

let fps = 0;
let frameTime = 0;
let memory = 0;
let visible = true;
let prevTime = 0;
let frames = 0;

const toggle = (show) => {
    show === undefined ? (visible = !visible) : (visible = show);
};

Console.registerCmd('stats', (show) => {
    toggle(show);
});

window.setInterval(() => {
    fps = frames;
    frames = 0;
    memory = 0;
    if (performance.memory) {
        memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
    }
}, 1000);

DOM.append(() => DOM.h(
    'div#stats',
    visible
        ? [
            DOM.h('div#stats-text', [
                DOM.h('span.stats-info', [`${fps}fps`]),
                DOM.h('span.stats-info', [`${Math.round(frameTime)}ms`]),
                DOM.h('span.stats-info', [`${memory}mb`])
            ]),
            DOM.h('div#stats-pos', [
                // eslint-disable-next-line
                      `xyz: ${Math.round(Camera.position[0])},${Math.round(Camera.position[1])},${Math.round(
                    Camera.position[2]
                )}`
            ])
        ]
        : []
));

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
