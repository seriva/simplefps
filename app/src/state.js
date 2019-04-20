import HUD from './hud.js';
import Renderer from './renderer.js';
import Input from './input.js';
import UI from './ui.js';

let State = 'UI';

const setState = (s, menu) => {
    State = s.toUpperCase();

    switch (State) {
    case 'GAME':
        Input.toggleVirtualInput(true);
        Input.toggleCursor(false);
        Renderer.toggleBlur(false);
        HUD.toggle(true);
        UI.hide();
        break;
    case 'MENU':
        Input.toggleVirtualInput(false);
        Input.toggleCursor(true);
        Renderer.toggleBlur(true);
        HUD.toggle(false);
        UI.show(menu);
        break;
    default:
        break;
    }
};

window.addEventListener('changestate', (e) => {
    setState(e.detail.state, e.detail.menu);
});

export { State as default };
