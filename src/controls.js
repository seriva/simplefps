import { glMatrix, vec3 } from 'gl-matrix';
import Input from './input';
import Console from './console';
import Camera from './camera';
import Stats from './stats';

// console
Input.addKeyDownEvent(192, () => {
    Console.toggle();
    Stats.toggle();
    Input.toggleCursor();
});
Input.addKeyDownEvent(13, () => {
    Console.execute();
});
Input.touch.on('panup pandown', (ev) => {
    if (ev.distance > 175) {
        if (ev.type === 'panup') {
            Console.toggle(false);
            Input.toggleCursor(false);
            Stats.toggle(true);
        }
        if (ev.type === 'pandown') {
            Console.toggle(true);
            Input.toggleCursor(true);
            Stats.toggle(false);
        }
    }
});

// mouse and keyboard input
const Controls = {
    update(frametime) {
        if (Console.visible()) return;

        const ft = frametime / 1000;

        // look
        const mpos = Input.cursorMovement();
        Camera.rotation[0] = Camera.rotation[0] - (mpos.x/10);
        Camera.rotation[1] = Camera.rotation[1] + (mpos.y/10);
        if (Camera.rotation[1]>89) { Camera.rotation[1] = 89; }
        if (Camera.rotation[1]<-89) { Camera.rotation[1] = -89; }
        if (Camera.rotation[0]<0) { Camera.rotation[0] = 360; }
        if (Camera.rotation[0]>360) { Camera.rotation[0] = 0; }
        Camera.direction[0] = 0; Camera.direction[1] = 0; Camera.direction[2] = 1;
        vec3.rotateX(Camera.direction, Camera.direction, [0, 0, 0], glMatrix.toRadian(Camera.rotation[1]));
        vec3.rotateY(Camera.direction, Camera.direction, [0, 0, 0], glMatrix.toRadian(Camera.rotation[0]));

        // movement
        let move = 0;
        let strafe = 0;
        if (Input.isDown(87)) {
            move = move + 1;
        }
        if (Input.isDown(65)) {
            strafe = strafe - 1;
        }
        if (Input.isDown(68)) {
            strafe = strafe + 1;
        }
        if (Input.isDown(83)) {
            move = move - 1;
        }

        // calculate new position and view direction
        const v = vec3.clone(Camera.direction);
        v[1] = 0;
        vec3.rotateY(v, v, [0, 0, 0], glMatrix.toRadian(-90));
        move = move * (ft * 7);
        strafe = strafe * (ft * 7);
        Camera.position[0] = Camera.position[0] + (Camera.direction[0] * move) + (v[0] * strafe);
        Camera.position[1] = Camera.position[1] + (Camera.direction[1] * move) + (v[1] * strafe);
        Camera.position[2] = Camera.position[2] + (Camera.direction[2] * move) + (v[2] * strafe);
    }
};

export { Controls as default };
