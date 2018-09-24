import Utils from './utils';
import Stats from './stats';
import DOM from './dom';
import Controls from './controls';

const h = DOM.h;

// add css
Utils.addCSS(
    `
    #gui {
        margin: 0;
        padding: 0;
        z-index: 1000;
        background-color: transparent;
    }

    #stats-fps { 
        font-size: 14px;
        color: #FFF;
        left: 15px;
        top: 15px;
        position: absolute;
    }

    #stats-ftm {
        font-size: 14px;
        color: #FFF;
        left: 15px;
        top: 30px;
        position: absolute;
    }

    #button-menu { 
        border-radius: 50%;
        border: 2px solid #fff;
        background-color: #999;
        right: 15px;
        top: 15px;
        width: 50px;
        height: 50px;
        position: absolute;
        opacity: 0.60;
        content:url(resources/menu.png);
    }
    `
);

let visible = true;

DOM.append(() =>
    h('div#gui', visible ?
    [
        Utils.isMobile() ? [h('div#button-menu', {
            onclick: () => {
                Controls.showMainMenu();
            }
        },
        [h('div#button-menu-bar')])] : [],
        h('span#stats-fps', ['FPS: ' + Stats.fps().toString()]),
        h('span#stats-ftm', ['FTM: ' + Stats.frametime().toString()])
    ]
    :
    [])
);

const toggle = (show) => {
    show === undefined ? visible = !visible: visible = show;
};

const GUI = {
    toggle
};

export { GUI as default };
