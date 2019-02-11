import DOM from './dom';
import Console from './console';
import Camera from './camera';

const h = DOM.h;

DOM.registerCSS({
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
        zIndex: 3000,
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
        zIndex: 3000,
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
    memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
}, 1000);

DOM.append(() => h(
    'div#stats',
    visible
        ? [
            h('div#stats-text', [
                h('span.stats-info', [`${fps}fps`]),
                h('span.stats-info', [`${Math.round(frameTime)}ms`]),
                h('span.stats-info', [`${memory}mb`])
            ]),
            h('div#stats-pos', [
                // eslint-disable-next-line
                      `xyz: ${Math.round(Camera.position[0])},${Math.round(
                    Camera.position[1]
                )},${Math.round(Camera.position[2])}`
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
