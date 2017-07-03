const path = require('path');
const CircularDependencyPlugin = require('circular-dependency-plugin')

module.exports = {
    entry: {
        app: [
            path.join(__dirname, 'src/index.js')
        ]
    },
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'bundle.js'
    },
    plugins: [
        new CircularDependencyPlugin({
            exclude: /a\.js|node_modules/,
            failOnError: true
        })
    ],
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: ['babel-loader', 'eslint-loader']
            }
        ]
    }
};
