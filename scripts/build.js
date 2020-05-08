const rollup = require('rollup');
const terser = require('rollup-plugin-terser');
const eslint = require('rollup-plugin-eslint');
const commonjs = require('@rollup/plugin-commonjs');
const nodeResolve = require('@rollup/plugin-node-resolve');
const nodePolyfills = require('rollup-plugin-node-polyfills');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');

const port = 8181;

const copyRecursiveSync = (src, dest, exclude) => {
    if (!exclude) exclude = [];
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (exists && isDirectory) {
        fs.mkdirSync(dest);
        fs.readdirSync(src).forEach((childItemName) => {
            if (exclude.indexOf(childItemName) > -1) return;
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName), exclude);
        });
    } else {
        fs.linkSync(src, dest);
    }
};

const deleteRecursiveSync = (dir) => {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach((file) => {
            const curDir = `${dir}/${file}`;
            if (fs.lstatSync(curDir).isDirectory()) {
                deleteRecursiveSync(curDir);
            } else {
                fs.unlinkSync(curDir);
            }
        });
        fs.rmdirSync(dir);
    }
};

const listRecursiveSync = (dir, filelist) => {
    const files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach((file) => {
        if (fs.statSync(path.join(dir, file)).isDirectory()) {
            filelist = listRecursiveSync(path.join(dir, file), filelist);
        } else {
            filelist.push(path.join(dir, file));
        }
    });
    return filelist;
};

try {
    if (!process.argv[2]) {
        throw new Error('Invalid input parameter');
    }
    const env = process.argv[2];
    const rootDir = path.join(__dirname, '../app/');
    const libDir = path.join(rootDir, '/src/libs/');
    const publicDir = path.join(__dirname, '../public/');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

    const start = new Date();
    switch (env) {
    case 'PREPARE':
        console.log('Preparing dependencies:');
        deleteRecursiveSync(libDir);
        fs.mkdirSync(libDir);
        let i = 0;
        pkg.prepareDependencies.forEach((e) => {
            const bundle = async () => {
                console.log(`- ${e}`);
                const b = await rollup.rollup({
                    input: `node_modules/${e}`,
                    plugins: [nodePolyfills(), nodeResolve(), commonjs()]
                });
                await b.write({
                    format: 'es',
                    entryFileNames: `${e}.js`,
                    dir: libDir
                });
            };
            bundle().then(() => {
                i++;
                if (i === pkg.prepareDependencies.length) {
                    const end = new Date() - start;
                    console.log('Preparing time: %dms', end);
                }
            });
        });
        break;
    case 'PRODUCTION':
        console.log('Publishing static files');
        deleteRecursiveSync(publicDir);
        copyRecursiveSync(rootDir, publicDir, ['src']);

        console.log('Generating app bundle');
        const bundle = async () => {
            const b = await rollup.rollup({
                input: 'app/src/main.js',
                plugins: [terser.terser(), eslint.eslint()],
                preserveEntrySignatures: false
            });
            await b.write({
                format: 'es',
                entryFileNames: 'main.js',
                chunkFileNames: 'main-[hash].js',
                dir: 'public/src/'
            });
        };
        bundle().then(() => {
            console.log('Generating service worker');
            let swTemplate = fs.readFileSync(path.join(__dirname, 'sw.tpl'), 'utf8');
            const timeStamp = new Date().getTime();
            const swFiles = [];
            listRecursiveSync(publicDir, swFiles);
            const rp = path.normalize(publicDir);
            let filesNew = "[\n  '.',\n";
            swFiles.forEach((s) => {
                filesNew += `  '${s.replace(rp, '').replace(/\\/g, '/')}',\n`;
            });
            filesNew += ']';
            swTemplate = swTemplate.replace('{{cacheArray}}', filesNew.toString());
            swTemplate = swTemplate.replace('{{cacheName}}', `${pkg.name}-${pkg.version}-${timeStamp}`);
            fs.writeFileSync(`${publicDir}sw.js`, swTemplate);

            const end = new Date() - start;
            console.log('Build time: %dms', end);
        });
        break;
    case 'DEVELOPMENT':
        console.log(`Started dev server on ${port}`);
        http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url);
            let pathname = `${rootDir}/${parsedUrl.pathname}`;
            let { ext } = path.parse(pathname);
            const map = {
                '.ico': 'image/x-icon',
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.json': 'application/json',
                '.css': 'text/css',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.ogg': 'audio/mpeg',
                '.svg': 'image/svg+xml'
            };

            const printStatus = (color) => {
                console.log(`${color}%s\x1b[0m`, `${req.method} ${res.statusCode} ${req.url}`);
            };

            fs.exists(pathname, (exist) => {
                if (!exist) {
                    res.statusCode = 404;
                    res.end(`File ${pathname} not found.`);
                    printStatus('\x1b[31m');
                } else {
                    if (fs.statSync(pathname).isDirectory()) {
                        pathname += '/index.html';
                        ext = '.html';
                    }

                    fs.readFile(pathname, (err, data) => {
                        if (err) {
                            res.statusCode = 500;
                            res.end(`Error getting the file: ${err}.`);
                            printStatus('\x1b[31m');
                        } else {
                            res.statusCode = 200;
                            res.setHeader('Content-type', map[ext] || 'text/plain');
                            res.end(data);
                            printStatus('\x1b[32m');
                        }
                    });
                }
            });
        }).listen(port);
        break;
    default:
        // code block
    }
} catch (e) {
    console.error(e);
}
