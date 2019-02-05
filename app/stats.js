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
    '#stats-fps': {
        color: '#F00',
        marginLeft: '5px'
    },
    '#stats-ft': {
        color: '#0F0',
        marginLeft: '5px'
    },
    '#stats-mem': {
        color: '#00F',
        marginLeft: '5px'
    },
    '#stats-pos': {
        fontSize: '12px',
        color: '#FFF',
        left: '13px',
        top: '22px',
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
                h('span##stats-fps', [`${fps}fps`]),
                h('span##stats-ft', [`${Math.round(frameTime)}ms`]),
                h('span##stats-mem', [`${memory}mb`])
            ]),
            h('div#stats-pos', [
                `xyz: ${Math.round(Camera.position[0])}, 
                      ${Math.round(Camera.position[1])}, 
                      ${Math.round(Camera.position[2])}`
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
