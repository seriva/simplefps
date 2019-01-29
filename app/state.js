import HUD from './hud';
import Renderer from './renderer';
import Input from './input';
import UI from './ui';

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
