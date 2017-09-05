import Utils from './utils';

Utils.addCSS(
    `
    #loading-overlay {
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
    }

    @-webkit-keyframes spin { 
        100% { 
            -webkit-transform: rotate(360deg); 
        } 
    }
    `
);

let visible = false;
const loadingOverlay = Utils.addElement('div', 'loading-overlay');
const loadingLogo = Utils.addElement('img', 'loading-logo', loadingOverlay);
loadingLogo.src = 'resources/logo.svg';
loadingOverlay.style.display = 'none';

const Loading = {
    toggle(show) {
        show === undefined ? visible = !visible : visible = show;
        visible ? loadingOverlay.style.display = 'block' : loadingOverlay.style.display = 'none';
    }
};

export { Loading as default };
