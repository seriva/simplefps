const recursive = require("recursive-readdir");
const path = require("path");
const fs = require('fs');

const package = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8'));
let   swTemplate = fs.readFileSync(__dirname + '/sw-template.tpl', 'utf8');
const timeStamp = new Date().getTime();
const rootDir = __dirname + '/public/';
let   htmlTemplate = fs.readFileSync(rootDir + '/index.html', 'utf8');
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
    fs.writeFileSync(rootDir + '/sw-' + timeStamp + '.js' , swTemplate)

    // Update and write html template.
    htmlTemplate = htmlTemplate.replace('{{swTemplate}}', './sw-' + timeStamp + '.js');
    fs.writeFileSync(rootDir + '/index.html' , htmlTemplate);

    console.log('Generated service worker successfully\n');
});
