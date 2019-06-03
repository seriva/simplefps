import Console from './console.js';
import Texture from './texture.js';
import Mesh from './mesh.js';
import Loading from './loading.js';
import Utils from './utils.js';

let paths = [];
let startTime;
const resources = {};
const basepath = 'resources/';
const re = /(?:\.([^.]+))?$/;

const Resources = {
    load(p) {
        const l = paths.length;
        paths = paths.concat(p);
        if (l !== 0) {
            return null;
        }
        return new Promise((resolve) => {
            let counter = 0;
            startTime = new Date().getTime();
            Loading.toggle(true);
            Loading.update(0, paths.length);

            const loadNext = async () => {
                let resource = null;
                const path = paths[counter];
                const fullpath = basepath + path;
                const ext = re.exec(path)[1];

                try {
                    if (!resources[path]) {
                        const response = await Utils.fetch(fullpath);
                        switch (ext) {
                        case 'jpg':
                            resource = new Texture({ data: response });
                            break;
                        case 'mesh':
                            resource = new Mesh(JSON.parse(response), this);
                            break;
                        case 'list': {
                            resource = JSON.parse(response).resources;
                            Resources.load(resource);
                            break;
                        }
                        default:
                            break;
                        }

                        Console.log(`Loaded: ${path}`);
                        resources[path] = resource;
                    }
                    counter++;
                    Loading.update(counter, paths.length);
                    if (counter === paths.length) {
                        Loading.toggle(false);
                        paths = [];
                        const ms = new Date().getTime() - startTime;
                        Console.log(`Loaded resources in ${ms} ms`);
                        resolve();
                    } else {
                        loadNext();
                    }
                } catch (err) {
                    Console.error(`Error loading ${path}: ${err}`);
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
        Console.error(`Resource "${key}" does not exist`);
        return null;
    }
};

export { Resources as default };
