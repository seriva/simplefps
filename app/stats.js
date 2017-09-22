import Utils from './utils';
import GUI from './gui';

const h = GUI.h;

// add css
Utils.addCSS(
    `
    #stats {
        margin: 0;
        padding: 0;
        color: #FFF;
        z-index: 150;
        font-size: 14px;
    }

    #stats-fps { 
        left: 15px;
        top: 15px;
        position: absolute;
    }

    #stats-ftm {
        left: 15px;
        top: 30px;
        position: absolute;
    }
    `
);

// local vars
let visible = true;
let fps = 0;
let fpscounter = 0;
let frametime = 0;

// gui function
GUI.append(() =>
    h('div#stats', visible ?
    [
        h('span#stats-fps', 'FPS: ' + fps),
        h('span#stats-ftm', 'FTM: ' + frametime)
    ]
    :
    [])
);

window.setInterval(() => {
    fps = fpscounter.toPrecision(5);
    fpscounter = 0;
}, 1000);

const Stats = {
    toggle(show) {
        show === undefined ? visible = !visible : visible = show;
    },

    update(ft) {
        fpscounter++;
        frametime = ft.toPrecision(5);
    }
};

export { Stats as default };
