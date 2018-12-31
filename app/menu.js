import DOM from './dom';
import Game from './game';

const h = DOM.h;

// add css
DOM.registerCSS({
    '#menu': {
        backgroundColor: 'transparent'
    },

    '#menu-base': {
        userSelect: 'none',
        maxWidth: '500px',
        position: 'absolute',
        color: '#fff',
        padding: '10px',
        paddingBottom: '0px',
        fontSize: '16px',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        border: '2px solid #fff',
        backgroundColor: '#999',
        zIndex: 1000,
        display: 'block',
        opacity: 0.90,
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

let renderfunc = null;

const showMenu = (header, buttons) => {
    Menu.hideMenu();
    Game.setState('MENU');
    renderfunc = () => {
        return h('div#menu',
            [
                h('div#menu-base', [
                    h('div#menu-header', [header]),
                    buttons.map((button) => {
                        return h('div.menu-button', {
                            onclick: button.callback
                        }, [button.text]);
                    })
                ]),
            ]);
    };
    DOM.append(renderfunc);
};

const Menu = {
    showMenu,
    hideMenu: () => {
        if (renderfunc !== null) {
            DOM.detach(renderfunc);
            renderfunc = null;
        }
        Game.setState('GAME');
    }
};

export { Menu as default };
