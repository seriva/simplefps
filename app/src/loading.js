import DOM from './dom.js';

DOM.css({
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
        width: '30vh',
        height: '30vh',
        top: '50%',
        left: '50%',
        marginTop: '-15vh',
        marginLeft: '-15vh',
        content: 'url(resources/logo.svg)',
        zIndex: 2002
    },

    '#loading-bar-background': {
        position: 'fixed',
        width: '60%',
        height: '15px',
        padding: '2px',
        top: '80%',
        left: '50%',
        marginLeft: '-30%',
        border: '2px solid white',
        zIndex: 2002
    },

    '#loading-bar': {
        width: '0%',
        height: '100%',
        background: '#FFF'
    }
});

// local vars
let isVisible = false;
let forceUntilReload = false;

// gui function
const bar = DOM.h('div#loading-bar');
DOM.append(() => DOM.h(
    'div#loading',
    isVisible
        ? [DOM.h('div#loading-logo', {
            enterAnimation: (domElement) => {
                DOM.animate(
                    domElement,
                    { transform: ['rotateZ(360deg)', 'rotateZ(0deg)'] },
                    {
                        duration: 3000,
                        delay: 0,
                        easing: 'linear',
                        repeat: true
                    }
                );
            }
        },), DOM.h('div#loading-bar-background', [bar]), DOM.h('div#loading-background')]
        : []
));

const Loading = {
    toggle(visible, force) {
        if (forceUntilReload === true) return;

        isVisible = visible;
        if (force !== undefined && force !== null) forceUntilReload = force;

        DOM.update();
    },

    update(step, max) {
        if (!bar.domNode) return;
        bar.domNode.style.width = `${Math.round((step * 100) / max)}%`;
        DOM.update();
    }
};

export { Loading as default };
