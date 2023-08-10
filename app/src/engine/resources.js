import Console from './console.js';
import Texture from './texture.js';
import Mesh from './mesh.js';
import Loading from './loading.js';
import Utils from './utils.js';
import Material from './material.js';
import Sound from './sound.js';

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
        Loading.toggle(true);
        Loading.update(0, paths.length);
        return new Promise((resolve) => {
            let counter = 0;
            startTime = new Date().getTime();
            Loading.toggle(true);
            Loading.update(0, paths.length);

            const loadNext = async () => {
                const path = paths[counter];
                const fullpath = basepath + path;
                const ext = re.exec(path)[1];

                try {
                    if (!resources[path]) {
                        const response = await Utils.fetch(fullpath);
                        switch (ext) {
                        case 'jpg': case 'png':
                            resources[path] = new Texture({ data: response });
                            break;
                        case 'mesh':
                            resources[path] = new Mesh(JSON.parse(response), this);
                            break;
                        case 'mat': {
                            JSON.parse(response).materials.forEach((data) => {
                                resources[data.name] = new Material(data, this);
                            });
                            break;
                        }
                        case 'sfx': {
                            resources[path] = new Sound(JSON.parse(response));
                            break;
                        }
                        case 'list': {
                            Resources.load(JSON.parse(response).resources);
                            break;
                        }
                        default:
                            break;
                        }

                        Console.log(`Loaded: ${path}`);
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
