import { Context, Input, Scene } from '../engine/engine.js';
import HUD from './hud.js';
import UI from './ui.js';

let State = 'MENU';

const setState = (s, menu) => {
    State = s.toUpperCase();

    switch (State) {
    case 'GAME':
        Input.toggleVirtualInput(true);
        Input.toggleCursor(false);
        Context.toggleBlur(false);
        HUD.toggle(true);
        UI.hide();
        Scene.pause(false);
        break;
    case 'MENU':
        Input.toggleVirtualInput(false);
        Input.toggleCursor(true);
        Context.toggleBlur(true);
        HUD.toggle(false);
        UI.show(menu);
        Scene.pause(true);
        break;
    default:
        break;
    }
};

window.addEventListener('changestate', (e) => {
    setState(e.detail.state, e.detail.menu);
});

export { State as default };
