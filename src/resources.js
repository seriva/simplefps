import Utils from './utils';
import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Shader from './shader';

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

const resources = {};
const loading = Utils.addElement('img', 'logo');
loading.src = 'resources/logo.svg';
loading.style.display = 'none';

const Resources = {
    load(paths, afterLoading) {
        const re = /(?:\.([^.]+))?$/;
        const count = Object.keys(paths).length;
        let counter = 0;

        loading.style.display = 'inline';

        const onSuccess = (path) => {
            counter++;
            Console.log('Loaded "' + path + '"');
            if (counter === count) {
                loading.style.display = 'none';
                afterLoading();
            }
        };

        const onError = (path) => {
            Console.log('Error loading "' + path + '"');
        };

        for (const key in paths) {
            const path = paths[key];
            const ext = re.exec(path)[1];
            switch (ext) {
            case 'jpg':
                resources[key] = new Texture(path, onSuccess, onError);
                break;
            case 'obj':
                resources[key] = new Mesh(path, onSuccess, onError);
                break;
            case 'shader':
                resources[key] = new Shader(path, onSuccess, onError);
                break;
            default:
                break;
            }
        }
    },

    get(key) {
        const resource = resources[key];
        if (resource) {
            return resource;
        }
        Console.error('Resource "' + key + '" does not exist');
        return null;
    }
};

export { Resources as default };
