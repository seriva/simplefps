import GUI from './gui';
import Renderer from './renderer';
import Input from './input';

let state = 'GAME';

const setState = (s) => {
    state = s.toUpperCase();

    switch (state) {
    case 'GAME':
    case 'EDITING':
        Input.toggleCursor(false);
        Renderer.toggleBlur(false);
        GUI.toggle(true);
        break;
    case 'MENU' :
        Input.toggleCursor(true);
        Renderer.toggleBlur(true);
        GUI.toggle(false);
        break;
    default : break;
    }
};

const Game = {
    getState: () => state,
    setState
};

export { Game as default };
