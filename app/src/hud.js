import Utils from './utils.js';
import DOM from './dom.js';

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
                    )
                ]
                : []
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
