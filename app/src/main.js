import Settings from './settings.js';
import './console.js';
import './translations.js';
import './hud.js';
import './ui.js';
import './update.js';
import Resources from './resources.js';
import Stats from './stats.js';
import Camera from './camera.js';
import Controls from './controls.js';
import DOM from './dom.js';
import Utils from './utils.js';

(async () => {
    await Resources.load(['resources.list']);

    // These modules are dependant on Resources so we import them 
    // dynamicly after resource loading.
    /* eslint-disable */
    let imp = await import('./world.js');
    let World = imp.default;
    imp = await import('./renderer.js');
    let Renderer = imp.default;
    imp = await import('./skybox.js');
    let Skybox = imp.default;
    /* eslint-disable */

    Utils.dispatchCustomEvent('changestate', {
        state: 'MENU',
        menu: 'MAIN_MENU'
    });

    let time;
    let frameTime = 0;

    Skybox.setTextures(Resources.get('skyboxes/1/1.list'));
    Camera.setProjection(45, Settings.znear, Settings.zfar);
    Camera.setPosition([6, 1.75, 4]);
    Camera.setRotation([0, 0, 0]);

    const loop = () => {
        // timing
        const now = performance.now();
        frameTime = now - (time || now);
        time = now;

        // update stats
        Stats.update();

        // update controls
        Controls.update(frameTime);

        // update camera
        Camera.update();

        // update the map
        World.update();

        // render the actual frame
        Renderer.render();

        // update dom
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();
