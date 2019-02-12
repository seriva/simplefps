const base = require('./brunch-base.js');

base.buildTarget = 'PROD';
base.plugins.afterBrunch = [
    'node tools/sw-generate.js'
];

module.exports = base;
