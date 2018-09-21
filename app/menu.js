import DOM from './dom';
import Utils from './utils';
import Game from './game';

const h = DOM.h;

Utils.addCSS(
    `
    #menu {
        background-color: transparent;
    }

    #menu-base { 
        max-width: 500px;
        max-width: 250px;
        position: absolute;
        color: #fff;
        padding: 10px;
        padding-bottom: 0px;
        font-size: 16px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border: 2px solid #fff;
        background-color: #999;
        z-index : 1000;
        display: block;
        opacity: 0.90;
    }

    #menu-header { 
        text-align: center;
        margin-bottom: 10px;
    }

    #menu-button { 
        text-align: center;
        border: 2px solid #fff;
        background-color: #999;
        margin-bottom: 10px;
        padding: 10px;
        cursor: pointer;
    }

    #menu-button:hover { 
        background-color: #888;
    }
    `
);

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
                        return h('div#menu-button', {
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
