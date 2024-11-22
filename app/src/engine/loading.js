import DOM from './dom.js';

// Constants for shared values
const ZINDEX_BASE = 2000;
const LOGO_SIZE = '30vh';
const LOGO_OFFSET = '-15vh';

DOM.css({
    '#loading': {
        zIndex: ZINDEX_BASE
    },

    '#loading-background': {
        width: '100%',
        height: '100%',
        position: 'absolute',
        left: '0px',
        top: '0px',
        margin: 0,
        padding: 0,
        backgroundColor: 'black',
        zIndex: ZINDEX_BASE + 1
    },

    '#loading-logo': {
        position: 'fixed',
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        top: '50%',
        left: '50%',
        marginTop: LOGO_OFFSET,
        marginLeft: LOGO_OFFSET,
        content: 'url(resources/logo.svg)',
        zIndex: ZINDEX_BASE + 2
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
        zIndex: ZINDEX_BASE + 2
    },

    '#loading-bar': {
        width: '0%',
        height: '100%',
        background: '#FFF'
    }
});

// State management
const state = {
    isVisible: false,
    forceUntilReload: false
};

// Memoized animation config
const SPIN_ANIMATION = {
    transform: ['rotateZ(360deg)', 'rotateZ(0deg)'],
    options: {
        duration: 3000,
        delay: 0,
        easing: 'linear',
        repeat: true
    }
};

// Cache DOM element
const bar = DOM.h('div#loading-bar');

// Optimize render function
const renderLoading = () => DOM.h(
    'div#loading',
    state.isVisible ? [
        DOM.h('div#loading-logo', {
            enterAnimation: (domElement) => {
                DOM.animate(domElement, SPIN_ANIMATION.transform, SPIN_ANIMATION.options);
            }
        }),
        DOM.h('div#loading-bar-background', [bar]),
        DOM.h('div#loading-background')
    ] : []
);

DOM.append(renderLoading);

const Loading = {
    toggle(visible, force) {
        if (state.forceUntilReload) return;

        state.isVisible = visible;
        if (force != null) state.forceUntilReload = force;

        DOM.update();
    },

    update(step, max) {
        if (!bar.domNode) return;

        // Ensure valid numbers and prevent division by zero
        const progress = max > 0 ? Math.min(Math.max((step * 100) / max, 0), 100) : 0;
        bar.domNode.style.width = `${Math.round(progress)}%`;
        DOM.update();
    }
};

export default Loading;
