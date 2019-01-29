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
            presets: ['env'],
            plugins: [
                ['transform-runtime', {
                    helpers: false,
                    polyfill: false,
                    regenerator: true,
                    moduleName: 'babel-runtime'
                }]
            ]
        }
    }
};
