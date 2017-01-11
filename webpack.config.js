module.exports = {
    entry: {
        app: [
            "./build/app/app.js"
        ]
    },
    output: {
        path: __dirname + "/dist",
        filename: "bundle.js"
    }
};
