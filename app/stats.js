import DOM from './dom';

let fps = 0;
let fpscounter = 0;
let frametime = 0;

window.setInterval(() => {
    fps = fpscounter.toPrecision(5);
    fpscounter = 0;
    DOM.update();
}, 1000);

const Stats = {
    fps() {
        return fps;
    },
    frametime() {
        return frametime;
    },
    update(ft) {
        fpscounter++;
        frametime = ft.toPrecision(5);
    }
};

export { Stats as default };
