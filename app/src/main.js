import Settings from './settings.js';
import Resources from './resources.js';
import Stats from './stats.js';
import Camera from './camera.js';
import Controls from './controls.js';
import DOM from './dom.js';
import Utils from './utils.js';

(async () => {
    await Resources.load(['resources.list']);

    // These modules are dependant on Resources so we import them dynamicly after resource loading.
    // TODO: Check eslint for dynamic import support, for now we exclude main.js.
    let imp = await import('./world.js');
    let World = imp.default;
    imp = await import('./renderer.js');
    let Renderer = imp.default;
    imp = await import('./skybox.js');

    await World.load('/resources/maps/test.map');

    Utils.dispatchCustomEvent('changestate', {
        state: 'MENU',
        menu: 'MAIN_MENU'
    });

    let time;
    let frameTime = 0;

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
