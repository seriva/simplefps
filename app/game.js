import HUD from './hud';
import Renderer from './renderer';
import Input from './input';

let state = 'GAME';

const setState = (s) => {
    state = s.toUpperCase();

    switch (state) {
    case 'GAME':
    case 'EDITING':
        Input.toggleVirtualInput(true);
        Input.toggleCursor(false);
        Renderer.toggleBlur(false);
        HUD.toggle(true);
        break;
    case 'MENU' :
        Input.toggleVirtualInput(false);
        Input.toggleCursor(true);
        Renderer.toggleBlur(true);
        HUD.toggle(false);
        break;
    default : break;
    }
};

const Game = {
    getState: () => state,
    setState
};

export { Game as default };
