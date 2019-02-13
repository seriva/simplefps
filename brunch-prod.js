const base = require('./brunch-base.js');

base.plugins.afterBrunch = [
    'node tools/tpl-generation.js PRODUCTION'
];

module.exports = base;
