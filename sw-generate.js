const recursive = require('recursive-readdir');
const path = require('path');
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '/package.json'), 'utf8'));
let swTemplate = fs.readFileSync(path.join(__dirname, '/sw-template.tpl'), 'utf8');
const timeStamp = new Date().getTime();
const rootDir = path.join(__dirname, '/public/');
const exclude = [];

recursive(rootDir, exclude, (err, files) => {
    // Update and write service worker template.
    const rp = path.normalize(rootDir);
    let filesNew = "[\n  '.',\n";
    files.forEach((s) => {
        filesNew += "  '" + s.replace(rp, '').replace(/\\/g, '/') + "',\n";
    });
    filesNew += ']';
    swTemplate = swTemplate.replace('{{cacheArray}}', filesNew.toString());
    swTemplate = swTemplate.replace('{{cacheName}}', pkg.name + '-' + pkg.version + '-' + timeStamp);
    fs.writeFileSync(rootDir + '/sw.js', swTemplate);

    console.log('Generated service worker successfully');
});
