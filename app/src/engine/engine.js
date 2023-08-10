import Console from './console.js';
import Settings from './settings.js';
import Utils from './utils.js';
import DOM from './dom.js';
import Loading from './loading.js';
import Stats from './stats.js';
import Input from './input.js';
import Sound from './sound.js';
import Physics from './physics.js';
import Resources from './resources.js';
import Camera from './camera.js';
import { Context } from './context.js';
import Renderer from './renderer.js';
import Scene from './scene.js';
import { EntityTypes } from './entity.js';
import MeshEntity from './meshentity.js';
import FpsMeshEntity from './fpsmeshentity.js';
import DirectionalLightEntity from './directionallightentity.js';
import PointLightEntity from './pointlightentity.js';

let time;
let frameTime = 0;

const loop = () => {
    const frame = () => {
        // timing
        const now = performance.now();
        frameTime = now - (time || now);
        time = now;

        // update stats
        Stats.update();

        // update controls
        Input.update(frameTime);

        // update camera
        Camera.update();

        // update the scene
        Scene.update(frameTime);

        // render the actual frame
        Renderer.render();

        // update dom
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
};

export {
    loop,
    Console,
    Settings,
    Utils,
    DOM,
    Loading,
    Stats,
    Input,
    Physics,
    Resources,
    Camera,
    Context,
    Renderer,
    Scene,
    EntityTypes,
    Sound,
    MeshEntity,
    FpsMeshEntity,
    DirectionalLightEntity,
    PointLightEntity
};
