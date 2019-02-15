import HUD from './hud.js';
import Renderer from './renderer.js';
import Input from './input.js';
import UI from './ui.js';

let state = 'UI';

const setState = (s, ui) => {
    state = s.toUpperCase();

    switch (state) {
    case 'GAME':
    case 'EDITING':
        Input.toggleVirtualInput(true);
        Input.toggleCursor(false);
        Renderer.toggleBlur(false);
        HUD.toggle(true);
        UI.hide();
        break;
    case 'UI':
        Input.toggleVirtualInput(false);
        Input.toggleCursor(true);
        Renderer.toggleBlur(true);
        HUD.toggle(false);
        UI.show(ui);
        break;
    default:
        break;
    }
};

const State = {
    getState: () => state,
    setState
};

export { State as default };
