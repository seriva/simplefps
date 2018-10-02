import { glMatrix, vec3 } from 'gl-matrix';
import Input from './input';
import Console from './console';
import Camera from './camera';
import Settings from './settings';
import Game from './game';
import Menu from './menu';
import Update from './update';
import Translations from './translations';

const showMainMenu = () => {
    Menu.showMenu(Translations.get('MAIN_MENU'), [
        {
            text: Translations.get('VERSION_CHECK'),
            callback: () => {
                Update.force();
            }
        },
        {
            text: Translations.get('BACK'),
            callback: () => {
                Menu.hideMenu();
            }
        },
        {
            text: Translations.get('EXIT'),
            callback: () => {
                window.close();
            }
        }
    ]);
};

// keyboard input
Input.addKeyDownEvent(27, () => {
    showMainMenu();
});

// mouse and keyboard input
const Controls = {
    update(frametime) {
        if (Console.visible() || (Game.getState() === 'MENU')) return;

        const ft = frametime / 1000;

        // look
        const mpos = Input.cursorMovement();
        Camera.rotation[0] = Camera.rotation[0] - ((mpos.x/33.0) * Settings.looksensitivity);
        Camera.rotation[1] = Camera.rotation[1] + ((mpos.y/33.0) * Settings.looksensitivity);
        if (Camera.rotation[1]>89) { Camera.rotation[1] = 89; }
        if (Camera.rotation[1]<-89) { Camera.rotation[1] = -89; }
        if (Camera.rotation[0]<0) { Camera.rotation[0] = 360; }
        if (Camera.rotation[0]>360) { Camera.rotation[0] = 0; }
        Camera.direction[0] = 0; Camera.direction[1] = 0; Camera.direction[2] = 1;
        vec3.rotateX(Camera.direction, Camera.direction, [0, 0, 0], glMatrix.toRadian(Camera.rotation[1]));
        vec3.rotateY(Camera.direction, Camera.direction, [0, 0, 0], glMatrix.toRadian(Camera.rotation[0]));
        vec3.normalize(Camera.direction, Camera.direction);

        // movement
        let move = 0;
        let strafe = 0;
        if (Input.isDown(Settings.forward)) {
            move = move + 1;
        }
        if (Input.isDown(Settings.backwards)) {
            move = move - 1;
        }
        if (Input.isDown(Settings.left)) {
            strafe = strafe - 1;
        }
        if (Input.isDown(Settings.right)) {
            strafe = strafe + 1;
        }

        // calculate new position and view direction
        const v = vec3.clone(Camera.direction);
        v[1] = 0;
        vec3.rotateY(v, v, [0, 0, 0], glMatrix.toRadian(-90));
        vec3.normalize(v, v);
        move = move * (ft * Settings.movespeed);
        strafe = strafe * (ft * Settings.movespeed);
        Camera.position[0] = Camera.position[0] + (Camera.direction[0] * move) + (v[0] * strafe);
        Camera.position[1] = Camera.position[1] + (Camera.direction[1] * move) + (v[1] * strafe);
        Camera.position[2] = Camera.position[2] + (Camera.direction[2] * move) + (v[2] * strafe);
    },
    showMainMenu
};

export { Controls as default };
