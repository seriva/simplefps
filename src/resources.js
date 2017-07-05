import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Loading from './loading';

let paths = [];
const resources = {};
const basepath = 'resources/';

const Resources = {
    load(p, afterLoading) {
        const re = /(?:\.([^.]+))?$/;
        this.addForLoading(p);
        let counter = 0;

        Loading.toggle(true);

        const onSuccess = (path) => {
            counter++;
            Console.log('Loaded "' + path + '"');
            if (counter === paths.length) {
                Loading.toggle(false);
                paths = [];
                afterLoading();
            }
        };

        const onError = (path) => {
            Console.log('Error loading "' + path + '"');
        };

        paths.forEach((path) => {
            const fullpath = basepath + path;
            const ext = re.exec(path)[1];

            switch (ext) {
            case 'jpg':
                resources[path] = new Texture(fullpath, onSuccess, onError);
                break;
            case 'obj':
                resources[path] = new Mesh(fullpath, onSuccess, onError);
                break;
            default:
                break;
            }
        });
    },

    addForLoading(p) {
        paths = paths.concat(p);
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
