var path = require("path");

module.exports = {
    entry: {
        app: [
            path.join(__dirname, 'src/app/app.js')
        ]
    },
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'bundle.js'
    },
    module: {
        loaders: [
            {
            test: /\.js$/,
            exclude: /(node_modules)/,
            loader: 'babel-loader?presets[]=es2017'
            }
        ]
    },
    devServer: {
        stats: {
            colors: true,
            hash: true,
            version: true,
            timings: true,
            assets: true,
            chunks: true,
            modules: true,
            reasons: true,
            children: true,
            source: true,
            errors: true,
            errorDetails: true,
            warnings: true,
            publicPath: true
        }
    }
};
