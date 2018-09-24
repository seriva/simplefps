module.exports = {
    files: {
        javascripts: {
            joinTo: {
                'app.js': /^/
            }
        }
    },
    plugins: {
        autoReload: {
            enabled: true
        },
        afterBrunch: [
            'node sw-generate.js'
        ]
    }
};
