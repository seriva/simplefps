import Resources from './engine/resources.js';
import Stats from './engine/stats.js';
import Camera from './engine/camera.js';
import DOM from './engine/dom.js';
import Utils from './engine/utils.js';
import Scene from './engine/scene.js';
import Renderer from './engine/renderer.js';

(async () => {
    await Resources.load(['resources.list']);

    // These modules are dependent on resources so we import them dynamicly after resource loading.
    let imp = await import('./controls.js');
    const Controls = imp.default;
    imp = await import('./world.js');
    const World = imp.default;
    imp = await import('./weapons.js');
    const Weapons = imp.default;

    await World.load('test.map');
    Weapons.load();

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
        Scene.update(frameTime);

        // render the actual frame
        Renderer.render();

        // update dom
        DOM.update();

        // restart the loop
        window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
})();
