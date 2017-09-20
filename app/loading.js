import Utils from './utils';

Utils.addCSS(
    `
    #loading {
        width: 100%;
        height: 100%;
        left: 0px;
        top: 0px;
        margin: 0;
        padding: 0;
        position: absolute;
        background-color: black;
        z-index : 99998;
        display : none;
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

let visible = false;
const loadingDiv = Utils.addElement('div', 'loading');
Utils.addElement('img', 'loading-logo', loadingDiv);

const Loading = {
    toggle(show) {
        show === undefined ? visible = !visible : visible = show;
        visible ? loadingDiv.style.display = 'block' : loadingDiv.style.display = 'none';
    }
};

export { Loading as default };
