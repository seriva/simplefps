import Utils from './utils';
import Input from './input';
import Console from './console';
import Stats from './stats';
import Renderer from './renderer';
import Resources from './resources';

class Engine {
  constructor () {
      var e = this;

      //utils
      e.utils = new Utils(e);
      e.utils.addCSS(
          'html { height: 100%; }' +
          'body { background: #000; min-height: 100%; margin: 0; padding: 0; position: relative; overflow: hidden; font-family: Consolas, monaco, monospace; font-weight: bold;}'
      );

      //construct the engine core systems
      e.input = new Input(e);
      e.console = new Console(e);
      e.stats = new Stats(e);
      e.renderer = new Renderer(e);
      e.resources = new Resources(e);

      //Add cordova specfic events if we are on mobile.
      //TEMP: We should probably move this somewhere else.
      if (e.utils.isMobile()){
          document.addEventListener('deviceready', function () {
              e.console.log('Platform: ' + cordova.platformId);
              if (cordova.platformId === 'android') {
                  window.addEventListener('native.keyboardhide', function (e) {
                      AndroidFullScreen.immersiveMode();
                  });
              }
          }, false);
      }
  }

  //main entry point
  run (){
      var time;
      var frameTime = 0;
      var e = this;

      function loop () {
          //timing
          let now = performance.now();
          frameTime = now - (time || now);
          time = now;

          //render the frame
          e.renderer.update(frameTime);

          //update stats
          e.stats.update(frameTime);

          //restart the loop
          window.requestAnimationFrame(loop);
      }
      window.requestAnimationFrame(loop);
  }
}

export { Engine as default};
