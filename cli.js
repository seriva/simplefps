const minify = require('@node-minify/core');
const uglifyJS = require('@node-minify/uglify-js');
const uglifyES = require('@node-minify/uglify-es');
const liveServer = require('live-server');
const path = require('path');
const fs = require('fs');

const copyRecursiveSync = (src, dest) => {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (exists && isDirectory) {
        fs.mkdirSync(dest);
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
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
    const rootDir = path.join(__dirname, 'app/');
    const publicDir = path.join(__dirname, 'public/');
    const templateDir = path.join(__dirname, 'templates/');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

    console.log('Generate libs bundle');
    minify({
        compressor: uglifyJS,
        input: pkg.dependencyPaths,
        output: 'app/libs/libs.js',
        callback: () => {}
    });

    console.log('Generate libs import');
    let imports = '';
    pkg.dependencyGlobalNames.forEach((name) => {
        imports += `const ${name} = window.${name};\ndelete window.${name};\nexport { ${name} };\n\n`;
    });
    fs.writeFileSync(`${rootDir}libs/import.js`, imports);

    if (env === 'PRODUCTION') {
        console.log('Publishing files');
        deleteRecursiveSync(publicDir);
        copyRecursiveSync(rootDir, publicDir);

        console.log('Generating service worker');
        let swTemplate = fs.readFileSync(`${templateDir}sw.tpl`, 'utf8');
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

        console.log('Minifying source');
        const minifyFiles = [];
        listRecursiveSync(`${publicDir}src/`, minifyFiles);
        minify({
            compressor: uglifyES,
            input: minifyFiles,
            output: minifyFiles.map(s => `${s}c`),
            callback: () => {
                minifyFiles.forEach((f) => {
                    fs.renameSync(`${f}c`, f);
                });
            }
        });
    }

    if (env === 'DEVELOPMENT') {
        console.log('Start dev server');
        liveServer.start({
            root: rootDir
        });
    }
} catch (e) {
    console.error(e);
}
