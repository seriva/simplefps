import DOM from './dom';

const h = DOM.h;

// add css
DOM.registerCSS({
    '#ui': {
        backgroundColor: 'transparent'
    },

    '#menu-base': {
        transform: 'translate(-50%, -50%)',
        userSelect: 'none',
        maxWidth: '500px',
        position: 'absolute',
        color: '#fff',
        padding: '10px',
        paddingBottom: '0px',
        fontSize: '16px',
        top: '50%',
        left: '50%',
        border: '2px solid #fff',
        backgroundColor: '#999',
        zIndex: 1000,
        display: 'block',
        opacity: 0
    },

    '#menu-header': {
        textAlign: 'center',
        marginBottom: '10px'
    },

    '.menu-button': {
        textAlign: 'center',
        border: '2px solid #fff',
        backgroundColor: '#999',
        marginBottom: '10px',
        padding: '10px',
        cursor: 'pointer'
    },

    '.menu-button:hover': {
        backgroundColor: '#888'
    }
});

let isVisible = false;
let current = '';
const uis = {};

DOM.append(() =>
    h('div#ui', isVisible ?
    [
        h('div#menu-base', {
            enterAnimation: (domElement) => {
                DOM.animate(domElement, { opacity: 0.9 }, { mobileHA: false, duration: 150, delay: 0, easing: 'linear' });
            },
            exitAnimation: (domElement, removeDomNodeFunction) => {
                DOM.animate(domElement, { opacity: 0 }, { mobileHA: false, duration: 150, delay: 0, easing: 'linear', complete: removeDomNodeFunction });
            }
        }, [
            h('div#menu-header', [uis[current].header]),
            uis[current].controls.map((button) => {
                return h('div.menu-button', {
                    key: button.text,
                    onclick: button.callback
                }, [button.text]);
            })
        ]),
    ]
    :
    [])
);

const UI = {
    register: (name, ui) => {
        uis[name] = ui;
    },
    show: (name) => {
        isVisible = false;
        DOM.update();
        current = name;
        isVisible = true;
    },
    hide: () => {
        isVisible = false;
    }
};

export { UI as default };
