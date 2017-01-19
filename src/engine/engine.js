import Utils from './utils';
import Console from './console';
import Stats from './stats';
import Renderer from './renderer';

class Engine {
  constructor () {
      //construct the engine core systems
      var e = this;
      e.utils = new Utils(e);
      e.console = new Console(e);
      e.renderer = new Renderer(e);
      e.stats = new Stats(e);

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

      //add general css for our page
      e.utils.addCSS(
          'html { height: 100%; }' +
          'body { min-height: 100%; margin: 0; padding: 0; position: relative; overflow: hidden; font-family: Consolas, monaco, monospace; font-weight: bold;}'
      );
  }

  //main entry point
  run (){
      var time;
      var frameTime = 0;
      var e = this;

      function loop () {
          //timing
          var now = performance.now();
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
