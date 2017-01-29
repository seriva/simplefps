import Engine from '../engine/engine';

var engine = new Engine();
engine.resources.load(
  {
    'statue' : 'resources/statue.obj',
    'texture' : 'resources/statue.jpg'
  },
  function () {
    engine.renderer.setup();
    engine.run();
  }
);
