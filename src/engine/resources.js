import Texture from './texture';
import Mesh from './mesh';
import Shader from './shader';

class Resources {
  constructor (engine) {
    var e = this.e = engine;
    var r = this;
    r.resources = {};

    //add loading css
    e.utils.addCSS(
        '#logo { position: fixed; width: 20%; height:20%; top: 50%; left: 50%; margin-top: -10%; margin-left: -10%; -webkit-animation:spin 3s linear infinite;}' +
        '@-webkit-keyframes spin { 100% { -webkit-transform: rotate(360deg); } }'
    );

    //add loading element
    r.loading = e.utils.addElement('img', 'logo');
    r.loading.src = 'resources/logo.svg';
    r.loading.style.display = 'none';
  }

  load (resources, afterLoading) {
      var r = this;
      var re = /(?:\.([^.]+))?$/;
      var count = Object.keys(resources).length;
      var counter = 0;

      r.loading.style.display = 'inline';

      function onSuccess (path) {
          counter++;
          r.e.console.log('Loaded "' + path + '"');
          if (counter === count) {
              r.loading.style.display = 'none';
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
              this.resources[key] = new Mesh(path, this.e, onSuccess, onError);
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
