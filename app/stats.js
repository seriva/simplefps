import DOM from './dom';

const h = DOM.h;

// add css
DOM.registerCSS({
    '#stats': {
        margin: 0,
        padding: 0,
        zIndex: 3000,
        backgroundColor: 'transparent',
    },
    '#stats-text': {
        fontSize: '12px',
        color: '#FFF',
        left: '5px',
        top: '5px',
        position: 'absolute',
    }
});

let fps = 0;
let frameTime = 0;
let memory = 0;
let visible = true;
let prevTime = 0;
let frames = 0;

window.setInterval(() => {
    fps = frames;
    frames = 0;
    memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
}, 1000);

DOM.append(() =>
    h('div#stats', visible ?
    [
        h('span#stats-text', [fps + 'fps/' + Math.round(frameTime) + 'ms/' + memory + 'mb'])
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
