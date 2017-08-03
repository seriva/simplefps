const config = require('./webpack.base');

config.output.sourceMapFilename = 'bundle.js.map';
config.devtool = 'source-map';

module.exports = config;
