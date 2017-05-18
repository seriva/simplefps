import Texture from './texture';
import Mesh from './mesh';
import Shader from './shader';

class Resources {
    constructor(engine) {
        const e = this.e = engine;
        const r = this;
        r.resources = {};

        // add loading css
        e.utils.addCSS(
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
        r.loading = e.utils.addElement('img', 'logo');
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
            r.e.console.log('Loaded "' + path + '"');
            if (counter === count) {
                r.loading.style.display = 'none';
                afterLoading();
            }
        }

        function onError(path) {
            r.e.console.log('Error loading "' + path + '"');
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
        this.e.console.error('Resource "' + key + '" does not exist');
        return null;
    }
}

export { Resources as default };
