import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Loading from './loading';
import Utils from './utils';

let paths = [];
const resources = {};
const basepath = 'resources/';

const Resources = {
    load(p, afterLoading) {
        const re = /(?:\.([^.]+))?$/;
        this.addForLoading(p);
        let counter = 0;
        let count = paths.length;

        Loading.toggle(true);

        const onSuccess = (path) => {
            Console.log('Loaded "' + path + '"');
            counter++;
            count = paths.length;
            if (counter === count) {
                Loading.toggle(false);
                paths = [];
                afterLoading();
            } else {
                loadNext();
            }
        };

        const onError = (path) => {
            Console.log('Error loading "' + path + '"');
        };

        const loadNext = () => {
            const path = paths[counter];
            const fullpath = basepath + path;
            const ext = re.exec(path)[1];
            switch (ext) {
            case 'jpg':
                resources[path] = new Texture(fullpath, onSuccess, onError, this);
                break;
            case 'obj':
                resources[path] = new Mesh(fullpath, onSuccess, onError, this);
                break;
            case 'list':
                Utils.loadData(fullpath, (data) => {
                    const obj = JSON.parse(data);
                    this.addForLoading(obj.resources);
                    onSuccess(fullpath);
                }, () => {
                    onError(fullpath);
                });
                break;
            default:
                break;
            }
        };

        loadNext();
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
