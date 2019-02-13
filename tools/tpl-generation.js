const recursive = require('recursive-readdir');
const path = require('path');
const fs = require('fs');

try {
    if (!process.argv[2]) {
        throw new Error('Invalid input parameter');
    }
    const env = process.argv[2];
    const rootDir = path.join(__dirname, '../public/');
    const templateDir = path.join(__dirname, '/templates/');

    // Process the index.tpl template
    let indexTemplate = fs.readFileSync(`${templateDir}index.tpl`, 'utf8');
    indexTemplate = indexTemplate.replace('{{environment}}', env);
    fs.writeFileSync(`${rootDir}index.html`, indexTemplate);

    if (env !== 'PRODUCTION') process.exit();

    // Process the sw.tpl template
    let swTemplate = fs.readFileSync(`${templateDir}sw.tpl`, 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    const timeStamp = new Date().getTime();
    const exclude = [];
    recursive(rootDir, exclude, (err, files) => {
        const rp = path.normalize(rootDir);
        let filesNew = "[\n  '.',\n";
        files.forEach((s) => {
            filesNew += `  '${s.replace(rp, '').replace(/\\/g, '/')}',\n`;
        });
        filesNew += ']';
        swTemplate = swTemplate.replace('{{cacheArray}}', filesNew.toString());
        swTemplate = swTemplate.replace('{{cacheName}}', `${pkg.name}-${pkg.version}-${timeStamp}`);
        fs.writeFileSync(`${rootDir}sw.js`, swTemplate);
    });
} catch (e) {
    console.error(e);
}
