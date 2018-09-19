import GUI from './gui';
import Renderer from './renderer';

let state = 'GAME';

const setState = (s) => {
    state = s.toUpperCase();
    Renderer.toggleBlur(true);
    switch (state) {
    case 'GAME' :
        Renderer.toggleBlur(false);
        GUI.toggle(true);
        break;
    case 'MENU' :
        GUI.toggle(false);
        break;
    case 'EDITOR' : break;
    default : break;
    }
};

const Game = {
    setState
};

export { Game as default };
