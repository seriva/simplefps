// engine imports
import Utils from './utils';
import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Shader from './shader';

class Resources {
    constructor(engine) {
        this.e = engine;
        const r = this;
        r.resources = {};

        // add loading css
        Utils.addCSS(
            `
            #logo { 
                position: fixed; 
                width: 20%; 
                height:20%; 
                top: 50%; 
                left: 50%; 
                margin-top: -10%; 
                margin-left: -10%; 
                -webkit-animation:spin 3s linear infinite;
            }

            @-webkit-keyframes spin { 
                100% { 
                    -webkit-transform: rotate(360deg); 
                } 
            }
            `
        );

        // add loading element
        r.loading = Utils.addElement('img', 'logo');
        r.loading.src = 'resources/logo.svg';
        r.loading.style.display = 'none';
    }

    load(resources, afterLoading) {
        const r = this;
        const re = /(?:\.([^.]+))?$/;
        const count = Object.keys(resources).length;
        let counter = 0;

        r.loading.style.display = 'inline';

        function onSuccess(path) {
            counter++;
            Console.log('Loaded "' + path + '"');
            if (counter === count) {
                r.loading.style.display = 'none';
                afterLoading();
            }
        }

        function onError(path) {
            Console.log('Error loading "' + path + '"');
        }

        for (const key in resources) {
            const path = resources[key];
            const ext = re.exec(path)[1];
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

    get(key) {
        const resource = this.resources[key];
        if (resource) {
            return resource;
        }
        Console.error('Resource "' + key + '" does not exist');
        return null;
    }
}

export { Resources as default };
