const base = require('./brunch-base.js');

base.buildTarget = 'DEV';
base.plugins.autoReload = {
    enabled: true
};

module.exports = base;
