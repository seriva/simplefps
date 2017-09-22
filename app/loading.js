import Utils from './utils';
import GUI from './gui';

const h = GUI.h;

Utils.addCSS(
    `
    #loading {}

    #loading-background {
        width: 100%;
        height: 100%;
        left: 0px;
        top: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        background-color: black;
        z-index : 99998;
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
        z-index : 99999;
        content:url(resources/logo.svg);
    }

    @-webkit-keyframes spin { 
        100% { 
            -webkit-transform: rotate(360deg); 
        } 
    }
    `
);

// local vars
let visible = false;

// gui function
GUI.append(() =>
    h('div#loading', visible ?
    [
        h('div#loading-logo'),
        h('div#loading-background')
    ]
    :
    [])
);

const Loading = {
    toggle(show) {
        show === undefined ? visible = !visible : visible = show;
        GUI.update();
    }
};

export { Loading as default };
