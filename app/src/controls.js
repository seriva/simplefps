import { glMatrix, vec3 } from './libs/gl-matrix.js';
import Input from './input.js';
import Console from './console.js';
import Camera from './camera.js';
import Settings from './settings.js';
import State from './state.js';
import UI from './ui.js';
import Update from './update.js';
import Translations from './translations.js';
import Utils from './utils.js';
import Resources from './resources.js';

const music = Resources.get('sounds/music.sfx');

UI.register('MAIN_MENU', {
    header: Translations.get('MAIN_MENU'),
    controls: [
        {
            text: Translations.get('CONTINUE_GAME'),
            callback: () => {
                Utils.dispatchCustomEvent('changestate', {
                    state: 'GAME'
                });
                music.play();
            }
        },
        {
            text: Translations.get('VERSION_CHECK'),
            callback: () => {
                Update.force();
            }
        }
    ]
});

document.addEventListener(
    'pointerlockchange',
    () => {
        if (document.pointerLockElement === null) {
            if (State !== 'MENU') {
                Utils.dispatchCustomEvent('changestate', {
                    state: 'MENU',
                    menu: 'MAIN_MENU'
                });
                music.pause();
            }
        }
    },
    false
);

window.addEventListener(
    'focus',
    () => {
        if (State !== 'MENU') {
            Utils.dispatchCustomEvent('changestate', {
                state: 'MENU',
                menu: 'MAIN_MENU'
            });
        }
    },
    false
);

// console
Input.addKeyDownEvent(192, () => {
    Console.toggle();
});
Input.addKeyDownEvent(13, () => {
    Console.executeCmd();
});

// mouse and keyboard input
const Controls = {
    update(frametime) {
        if (Console.visible() || State === 'MENU') return;
        const ft = frametime / 1000;

        // look
        const mpos = Input.cursorMovement();
        Camera.rotation[0] -= (mpos.x / 33.0) * Settings.looksensitivity;
        Camera.rotation[1] += (mpos.y / 33.0) * Settings.looksensitivity;
        if (Camera.rotation[1] > 89) {
            Camera.rotation[1] = 89;
        }
        if (Camera.rotation[1] < -89) {
            Camera.rotation[1] = -89;
        }
        if (Camera.rotation[0] < 0) {
            Camera.rotation[0] = 360;
        }
        if (Camera.rotation[0] > 360) {
            Camera.rotation[0] = 0;
        }
        Camera.direction[0] = 0;
        Camera.direction[1] = 0;
        Camera.direction[2] = 1;
        vec3.rotateX(Camera.direction, Camera.direction, [0, 0, 0], glMatrix.toRadian(Camera.rotation[1]));
        vec3.rotateY(Camera.direction, Camera.direction, [0, 0, 0], glMatrix.toRadian(Camera.rotation[0]));
        vec3.normalize(Camera.direction, Camera.direction);

        // movement
        let move = 0;
        let strafe = 0;
        if (Input.isDown(Settings.forward)) {
            move += 1;
        }
        if (Input.isDown(Settings.backwards)) {
            move -= 1;
        }
        if (Input.isDown(Settings.left)) {
            strafe -= 1;
        }
        if (Input.isDown(Settings.right)) {
            strafe += 1;
        }

        // calculate new position and view direction
        const v = vec3.clone(Camera.direction);
        v[1] = 0;
        vec3.rotateY(v, v, [0, 0, 0], glMatrix.toRadian(-90));
        vec3.normalize(v, v);
        move *= ft * Settings.movespeed;
        strafe *= ft * Settings.movespeed;
        Camera.position[0] = Camera.position[0] + Camera.direction[0] * move + v[0] * strafe;
        Camera.position[1] = Camera.position[1] + Camera.direction[1] * move + v[1] * strafe;
        Camera.position[2] = Camera.position[2] + Camera.direction[2] * move + v[2] * strafe;
    }
};

export { Controls as default };
