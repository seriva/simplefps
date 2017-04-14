// external imports
import Hammer from '../../node_modules/hammerjs/hammer';

// engine imports
import Utils from './utils';
import Input from './input';
import Console from './console';
import Stats from './stats';
import Renderer from './renderer';
import Resources from './resources';

class Engine {
    constructor() {
        const e = this;

        // utils
        e.utils = Utils;
        e.utils.addCSS(
            'html { height: 100%; }' +
            'body { background: #000; min-height: 100%; margin: 0; padding: 0; position: relative; overflow: hidden; font-family: Consolas, monaco, monospace; font-weight: bold;}'
        );

        // Add hammer for touch events
        e.touch = new Hammer(document.body);
        e.touch.get('pan').set({
            direction: Hammer.DIRECTION_ALL
        });

        // Add cordova specfic events if we are on mobile
        // TEMP: We should probably move this somewhere else.
        if (e.utils.isMobile()) {
            document.addEventListener('deviceready', () => {
                e.console.log('Platform: ' + cordova.platformId);
                if (cordova.platformId === 'android') {
                    window.addEventListener('native.keyboardhide', () => {
                        AndroidFullScreen.immersiveMode();
                    });
                }
            }, false);
        }

        // construct the engine core systems
        e.input = new Input(e);
        e.console = new Console(e);
        e.stats = new Stats(e);
        e.renderer = new Renderer(e);
        e.resources = new Resources(e);
    }

    // main entry point
    run() {
        let time;
        let frameTime = 0;
        const e = this;

        function loop() {
            // timing
            const now = performance.now();
            frameTime = now - (time || now);
            time = now;

            // render the frame
            e.renderer.update(frameTime);

            // update stats
            e.stats.update(frameTime);

            // restart the loop
            window.requestAnimationFrame(loop);
        }
        window.requestAnimationFrame(loop);
    }
}

export { Engine as default };
