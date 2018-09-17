import Utils from './utils';
import DOM from './dom';

const h = DOM.h;

Utils.addCSS(
    `
    #loading {
        z-index : 2000;
    }

    #loading-background {
        width: 100%;
        height: 100%;
        left: 0px;
        top: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        background-color: black;
        z-index : 2001;
    }

    #loading-logo { 
        position: fixed; 
        width: 20vh; 
        height: 20vh; 
        top: 50%; 
        left: 50%; 
        margin-top: -10vh; 
        margin-left: -10vh; 
        -webkit-animation:spin 3s linear infinite;
        content:url(resources/logo.svg);
        z-index : 2002;
        
    }

    @-webkit-keyframes spin { 
        100% { 
            -webkit-transform: rotate(360deg); 
        } 
    }
    `
);

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
