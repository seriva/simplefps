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
        rules: [
            {
                enforce: "pre",
                test: /\.js$/,
                exclude: /node_modules/,
                loader: "eslint-loader",
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: "babel-loader",
            },
        ]
    }
};
