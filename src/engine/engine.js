import Utils from './utils';
import Console from './console';
import Stats from './stats';
import Renderer from './renderer';

class Engine {
  constructor () {
      //construct the engine core systems
      this.utils = new Utils(this);
      this.console = new Console(this);
      this.renderer = new Renderer(this);
      this.stats = new Stats(this);

      //add general css for our page
      this.utils.addCSS(
          'html { height: 100%; }' +
          'body { min-height: 100%; margin: 0; padding: 0; position: relative; overflow: hidden;  font-family: Arial;}'
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
