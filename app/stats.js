import Utils from './utils';

let visible = true;
let fps = 0;
let fpscounter = 0;
let frametime = 0;

// add css for stats
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

const statsDiv = Utils.addElement('div', 'stats');
const fpsSpan = Utils.addElement('span', 'stats-fps', statsDiv);
const ftmSpan = Utils.addElement('span', 'stats-ftm', statsDiv);

window.setInterval(() => {
    fps = fpscounter;
    fpscounter = 0;
    fpsSpan.innerHTML = 'FPS : ' + fps.toPrecision(5);
    ftmSpan.innerHTML = 'FTM : ' + frametime.toPrecision(5);
}, 1000);

const Stats = {
    toggle(show) {
        show === undefined ? visible = !visible : visible = show;
        visible ? statsDiv.style.display = 'block' : statsDiv.style.display = 'none';
    },

    update(ft) {
        fpscounter++;
        frametime = ft;
    }
};

export { Stats as default };
