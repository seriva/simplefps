import Texture from './texture';
import Model from './model';
import Shader from './shader';

class Resources {
  constructor (engine) {
    var e = this.e = engine;
    var r = this;
    r.resources = {};
  }

  load (resources, afterLoading) {
      var r = this;
      var re = /(?:\.([^.]+))?$/;
      var count = Object.keys(resources).length;
      var counter = 0;

      function onSuccess (path) {
          counter++;
          r.e.console.log('Loaded "' + path + '"');
          if (counter === count) {
              afterLoading();
          }
      }

      function onError (path) {
          r.e.console.log('Error loading "' + path + '"');
      }

      for (var key in resources) {
          let path = resources[key];
          let ext = re.exec(path)[1];
          switch (ext) {
            case 'jpg':
              this.resources[key] = new Texture(path, this.e, onSuccess, onError);
              break;
            case 'obj':
              this.resources[key] = new Model(path, this.e, onSuccess, onError);
              break;
            case 'shader':
              this.resources[key] = new Shader(path, this.e, onSuccess, onError);
              break;
            default:
              break;
          }
      }
  }

  get (key) {
      let resource = this.resources[key];
      if (resource) {
          return resource;
      } else {
          this.e.console.error('Resource "' + key + '" does not exist');
      }
  }
}

export { Resources as default };
