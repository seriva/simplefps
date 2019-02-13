const base = require('./brunch-base.js');

base.plugins.autoReload = {
    enabled: true
};
base.plugins.afterBrunch = [
    'node tools/tpl-generation.js DEVELOPMENT'
];

module.exports = base;
