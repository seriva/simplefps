const recursive = require("recursive-readdir");
const path = require("path");
const fs = require('fs');

const package = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8'));
let   swTemplate = fs.readFileSync(__dirname + '/sw-template.tpl', 'utf8');
const timeStamp = new Date().getTime();
const rootDir = __dirname + '/public/';
const exclude = []

recursive(rootDir, exclude, function (err, files) {
    // Update and write service worker template.
    let rp = path.normalize(rootDir);
    let filesNew = "[\n  '.',\n"
    files.forEach( function(s) { 
        filesNew +=  "  '" + s.replace(rp, '').replace(/\\/g, '/') + "',\n";
    } );
    filesNew += "]"
    swTemplate = swTemplate.replace('{{cacheArray}}', filesNew.toString());
    swTemplate = swTemplate.replace('{{cacheName}}', package.name + '-' + package.version  + '-' + timeStamp);
    fs.writeFileSync(rootDir + '/sw.js' , swTemplate)

    console.log('Generated service worker successfully\n');
});
