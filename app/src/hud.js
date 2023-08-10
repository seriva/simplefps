import Utils from './engine/utils.js';
import DOM from './engine/dom.js';

DOM.css({
    '#hud': {
        margin: 0,
        padding: 0,
        zIndex: 1000,
        backgroundColor: 'transparent'
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
        opacity: 0.6,
        zIndex: 1001,
        content: 'url(resources/menu.png)'
    },
    '#crosshair': {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: '-20px',
        marginLeft: '-20px',
        width: '40px',
        height: '40px',
        zIndex: 1001,
        content: 'url(resources/crosshair.png)'
    }
});

let visible = true;

DOM.append(() => DOM.h(
    'div#hud',
    visible
        ? [
            Utils.isMobile()
                ? [
                    DOM.h(
                        'div#button-menu',
                        {
                            onclick: () => {
                                Utils.dispatchCustomEvent('changestate', {
                                    state: 'MENU',
                                    menu: 'MAIN_MENU'
                                });
                            }
                        },
                        [DOM.h('div#button-menu-bar')]
                    ),
                    DOM.h('div#crosshair')
                ]
                : [
                    DOM.h('div#crosshair')
                ]
        ]
        : []
));

const toggle = (show) => {
    show === undefined ? (visible = !visible) : (visible = show);
};

const HUD = {
    toggle
};

export { HUD as default };
