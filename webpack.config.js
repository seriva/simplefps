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
                test: /\.js$/,
                exclude: /node_modules/,
                loader: ["babel-loader", "eslint-loader"]
            }
        ]
    }
};
