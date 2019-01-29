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
        ],
        babel: {
            presets: ['@babel/preset-env'],
            plugins: [
                ['@babel/plugin-transform-runtime']
            ]
        }
    }
};
