const config = require('./webpack.base');
const UglifyPlugin = require('uglifyjs-webpack-plugin');

config.plugins.push(new UglifyPlugin());

module.exports = config;