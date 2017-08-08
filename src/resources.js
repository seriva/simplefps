import Console from './console';
import Texture from './texture';
import Mesh from './mesh';
import Loading from './loading';
import Utils from './utils';

let counter = 0;
let paths = [];
let end = null;
let startTime;
const resources = {};
const re = /(?:\.([^.]+))?$/;
const basepath = window.location.href + 'resources/';

const Resources = {
    load(p) {
        const load = (data) => {
            if (data.constructor === Array) {
                paths = paths.concat(data);
                data.forEach((path) => {
                    load(path);
                });
                return;
            }

            let resource = null;
            const path = data;
            const fullpath = basepath + path;
            const ext = re.exec(path)[1];
            Utils.loadData(fullpath, (response) => {
                try {
                    switch (ext) {
                    case 'jpg':
                        resource = new Texture(response);
                        break;
                    case 'obj':
                        resource = new Mesh(response, Resources);
                        break;
                    case 'list': {
                        resource = JSON.parse(response).resources;
                        load(resource);
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
                        if (end !== null) end();
                        end = null;
                        const timeDiff = new Date().getTime() - startTime;
                        Console.log('Loaded resources in ' + timeDiff + 'ms');
                    }
                } catch (err) {
                    Console.log('Error loading "' + path + '": ' + err);
                }
            });
        };

        if (end === null) {
            return new Promise((resolve) => {
                startTime = new Date().getTime();
                Loading.toggle(true);
                counter = 0;
                end = resolve;
                load(p);
            });
        }
        load(p);
        return null;
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
