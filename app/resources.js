import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Loading from './loading';
import Utils from './utils';

let paths = [];
let startTime;
const resources = {};
const basepath = 'resources/';
const re = /(?:\.([^.]+))?$/;

const Resources = {
    load(p) {
        const length = paths.length;
        paths = paths.concat(p);
        if (length !== 0) {
            return null;
        }
        return new Promise((resolve) => {
            let counter = 0;
            startTime = new Date().getTime();
            Loading.toggle(true);

            const loadNext = async () => {
                let resource = null;
                const path = paths[counter];
                const fullpath = basepath + path;
                const ext = re.exec(path)[1];
                try {
                    const response = await Utils.fetch(fullpath);
                    switch (ext) {
                    case 'jpg':
                        resource = new Texture({ data: response });
                        break;
                    case 'obj':
                        resource = new Mesh(response, this);
                        break;
                    case 'list': {
                        resource = JSON.parse(response).resources;
                        Resources.load(resource);
                        break;
                    }
                    default:
                        break;
                    }

                    Console.log('Loaded "' + path + '"');
                    resources[path] = resource;
                    counter++;
                    if (counter === paths.length) {
                        Loading.toggle(false);
                        paths = [];
                        const ms = new Date().getTime() - startTime;
                        Console.log('Loaded resources in ' + ms + 'ms');
                        resolve();
                    } else {
                        loadNext();
                    }
                } catch (err) {
                    Console.log('Error loading "' + path + '": ' + err);
                }
            };

            loadNext();
        });
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
