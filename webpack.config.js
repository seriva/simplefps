module.exports = {
    entry: {
        app: [
            './src/app/app.js'
        ]
    },
    output: {
        path: __dirname + '/dist',
        filename: 'bundle.js'
    },
    module: {
        loaders: [
            {
            test: /\.js$/,
            exclude: /(node_modules|bower_components)/,
            loader: 'babel-loader?presets[]=es2017'
            }
        ]
    }
};
