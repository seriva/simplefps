import Utils from './utils';

let showStats = true;
let fps = 0;
let fpscounter = 0;
let frametime = 0;

// add css for stats
Utils.addCSS(
    `
    #stat-fps { 
        left: 15px; 
        top: 15px; 
        margin: 0; 
        padding: 0; 
        position: absolute; 
        color: #FFF;
        z-index: 150;
        font-size: 14px;
    }

    #stat-ftm { 
        left: 15px; 
        top: 30px; 
        margin: 0; 
        padding: 0; 
        position: absolute; 
        color: #FFF;
        z-index: 150;
        font-size: 14px;
    }
    `
);

const fpsSpan = Utils.addElement('span', 'stat-fps');
const ftmSpan = Utils.addElement('span', 'stat-ftm');

window.setInterval(() => {
    fps = fpscounter;
    fpscounter = 0;
    document.getElementById('stat-fps').innerHTML = 'FPS : ' + fps.toPrecision(5);
    document.getElementById('stat-ftm').innerHTML = 'FTM : ' + frametime.toPrecision(5);
}, 1000);

const Stats = {
    toggle(show) {
        if (show === undefined) {
            showStats = !showStats;
        } else {
            showStats = show;
        }
        if (showStats) {
            fpsSpan.style.display = 'block';
            ftmSpan.style.display = 'block';
        } else {
            fpsSpan.style.display = 'none';
            ftmSpan.style.display = 'none';
        }
    },

    update(ft) {
        fpscounter++;
        frametime = ft;
    }
};

export { Stats as default };
