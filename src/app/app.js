import Engine from '../engine/engine';

const engine = new Engine();

engine.resources.load({
    statue: 'resources/statue.obj',
    texture: 'resources/statue.jpg',
    shader: 'resources/diffuse.shader'
},
  () => {
      engine.renderer.setup();
      engine.run();
  }
);
