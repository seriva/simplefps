import Resources from './resources.js';
import Stats from './stats.js';
import Camera from './camera.js';
import DOM from './dom.js';
import Utils from './utils.js';

(async () => {
    await Resources.load(['resources.list']);

    // These modules are dependant on Resources so we import them dynamicly after resource loading.
    let imp = await import('./controls.js');
    const Controls = imp.default;
    imp = await import('./world.js');
    const World = imp.default;
    imp = await import('./renderer.js');
    const Renderer = imp.default;
    imp = await import('./skybox.js');

    await World.load('test.map');

    Utils.dispatchCustomEvent('changestate', {
        state: 'MENU',
        menu: 'MAIN_MENU'
    });
    Utils.dispatchEvent('resize');

    let time;
    let frameTime = 0;

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
        World.update(frameTime);

        // render the actual frame
        Renderer.render();

        // update dom
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();
