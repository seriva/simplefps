import DOM from './dom';
import Game from './game';

const h = DOM.h;

// add css
DOM.registerCSS({
    '#menu': {
        backgroundColor: 'transparent'
    },

    '#menu-base': {
        transform: 'translate(-50%, -50%)',
        userSelect: 'none',
        maxWidth: '500px',
        position: 'absolute',
        color: '#fff',
        padding: '10px',
        paddingBottom: '0px',
        fontSize: '16px',
        top: '50%',
        left: '50%',
        border: '2px solid #fff',
        backgroundColor: '#999',
        zIndex: 1000,
        display: 'block',
        opacity: 0
    },

    '#menu-header': {
        textAlign: 'center',
        marginBottom: '10px'
    },

    '.menu-button': {
        textAlign: 'center',
        border: '2px solid #fff',
        backgroundColor: '#999',
        marginBottom: '10px',
        padding: '10px',
        cursor: 'pointer'
    },

    '.menu-button:hover': {
        backgroundColor: '#888'
    }
});

let isVisible = false;
let header = '';
let buttons = [];

DOM.append(() =>
    h('div#menu', isVisible ?
    [
        h('div#menu-base', {
            enterAnimation: (domElement) => {
                DOM.animate(domElement, { opacity: 0.9 }, { mobileHA: false, duration: 150, delay: 0, easing: 'linear' });
            },
            exitAnimation: (domElement) => {
                DOM.animate(domElement, { opacity: 0 }, { mobileHA: false, duration: 150, delay: 0, easing: 'linear' });
            }
        }, [
            h('div#menu-header', [header]),
            buttons.map((button) => {
                return h('div.menu-button', {
                    key: button.text,
                    onclick: button.callback
                }, [button.text]);
            })
        ]),
    ]
    :
    [])
);

const showMenu = (mh, mb) => {
    Menu.hideMenu();
    Game.setState('MENU');
    header = mh;
    buttons = mb;
    isVisible = true;
};

const Menu = {
    showMenu,
    hideMenu: () => {
        isVisible = false;
        Game.setState('GAME');
    }
};

export { Menu as default };
