import Stats from './stats';
import Utils from './utils';
import DOM from './dom';
import State from './state';

const h = DOM.h;

// add css
DOM.registerCSS({
    '#gui': {
        margin: 0,
        padding: 0,
        zIndex: 1000,
        backgroundColor: 'transparent',
    },
    '#stats-fps': {
        fontSize: '14px',
        color: '#FFF',
        left: '15px',
        top: '15px',
        position: 'absolute',
    },
    '#stats-ftm': {
        fontSize: '14px',
        color: '#FFF',
        left: '15px',
        top: '30px',
        position: 'absolute'
    },
    '#button-menu': {
        borderRadius: '50%',
        border: '2px solid #fff',
        backgroundColor: '#999',
        right: '15px',
        top: '15px',
        width: '50px',
        height: '50px',
        position: 'absolute',
        opacity: 0.60,
        content: 'url(resources/menu.png)'
    }
});

let visible = true;

DOM.append(() =>
    h('div#gui', visible ?
    [
        Utils.isMobile() ? [h('div#button-menu', {
            onclick: () => {
                State.setState('UI', 'MAIN_MENU');
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

const HUD = {
    toggle
};

export { HUD as default };
