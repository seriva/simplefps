import DOM from './dom';

const h = DOM.h;

DOM.registerCSS({
    '#loading': {
        zIndex: 2000
    },

    '#loading-background': {
        width: '100%',
        height: '100%',
        left: '0px',
        top: '0px',
        margin: 0,
        padding: 0,
        position: 'absolute',
        backgroundColor: 'black',
        zIndex: 2001
    },

    '#loading-logo': {
        position: 'fixed',
        width: '20vh',
        height: '20vh',
        top: '50%',
        left: '50%',
        marginTop: '-10vh',
        marginLeft: '-10vh',
        animation: 'spin 3s linear infinite',
        content: 'url(resources/logo.svg)',
        zIndex: 2002
    },

    /*
    '@keyframes spin': {
        '100%': {
            transform: 'rotate(360deg)'
        }
    }
    */
});

// local vars
let isVisible = false;
let forceUntilReload = false;

// gui function
DOM.append(() =>
    h('div#loading', isVisible ?
    [
        h('div#loading-logo'),
        h('div#loading-background'),
    ]
    :
    [])
);

const Loading = {
    toggle(visible, force) {
        if (forceUntilReload === true) return;

        isVisible = visible;
        if (force !== undefined && force !== null) forceUntilReload = force;

        DOM.update();
    }
};

export { Loading as default };
