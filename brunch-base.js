module.exports = {
    files: {
        javascripts: {
            joinTo: {
                'app.js': /^/
            }
        }
    },
    plugins: {
        babel: {
            presets: ['@babel/preset-env'],
            plugins: [
                ['@babel/plugin-transform-runtime']
            ]
        }
    }
};
