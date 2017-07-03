import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Shader from './shader';
import Loading from './loading';

const resources = {};

const Resources = {
    load(paths, afterLoading) {
        const re = /(?:\.([^.]+))?$/;
        const count = Object.keys(paths).length;
        let counter = 0;

        Loading.toggle(true);

        const onSuccess = (path) => {
            counter++;
            Console.log('Loaded "' + path + '"');
            if (counter === count) {
                Loading.toggle(false);
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
