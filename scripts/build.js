/* eslint-disable no-case-declarations */
/* eslint-disable import/no-extraneous-dependencies */
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

const renderTemplate = (template, data, output) => {
    const content = fs.readFileSync(template, { encoding: 'utf8' });
    const newContent = content.replace(/{{.*?}}/g,
        (match) => data[`${match.slice(2, -2)}`]);
    const p = path.dirname(output);
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p);
    }
    fs.writeFileSync(output, newContent);
};

try {
    if (!process.argv[2]) {
        throw new Error('Invalid input parameter');
    }

    const env = process.argv[2];
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    const rootDir = path.join(__dirname, '../app/');
    const libDir = path.join(rootDir, '/src/libs/');
    const publicDir = path.join(__dirname, '../public/');
    const port = 8181;

    const start = new Date();
    switch (env) {
    case 'prepare':
        console.log('Preparing dependencies:');
        deleteRecursiveSync(libDir);
        fs.mkdirSync(libDir);
        let i = 0;
        Object.keys(pkg.dependencies).forEach((e) => {
            const bundle = async () => {
                console.log(`- ${e}`);
                const b = await rollup.rollup({
                    input: `node_modules/${e}`,
                    plugins: [nodeResolve(), commonjs(), nodePolyfills()]
                });
                await b.write({
                    format: 'es',
                    entryFileNames: `${e}.js`,
                    dir: libDir
                });
            };
            bundle().then(() => {
                i++;
                if (i === Object.keys(pkg.dependencies).length) {
                    const end = new Date() - start;
                    console.log('Preparing time: %dms', end);
                }
            });
        });
        break;
    case 'production':
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
            const files = [];
            listRecursiveSync(publicDir, files);
            const rp = path.normalize(publicDir);
            let cacheArray = "[\n    '.',\n";
            files.forEach((s) => {
                cacheArray += `    '${s.replace(rp, '').replace(/\\/g, '/')}',\n`;
            });
            cacheArray += ']';
            const data = {
                cacheName: `${pkg.name}-${pkg.version}-${new Date().getTime()}`,
                cacheArray
            };
            renderTemplate(
                path.join(__dirname, 'sw.tpl'),
                data,
                `${publicDir}/sw.js`
            );
            const end = new Date() - start;
            console.log('Build time: %dms', end);
        });
        break;
    case 'development':
        console.log(`Started dev server on localhost:${port}`);
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
        console.log('Unknow build command!');
    }
} catch (e) {
    console.error(e);
}
