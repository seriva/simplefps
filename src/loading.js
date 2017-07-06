import Utils from './utils';

Utils.addCSS(
    `
    #loading-div {
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

    #logo { 
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

let showLoading = false;
const loadingDiv = Utils.addElement('div', 'loading-div');
const loadingImg = Utils.addElement('img', 'logo');
loadingImg.src = 'resources/logo.svg';
loadingImg.style.display = 'none';
loadingDiv.style.display = 'none';

const Loading = {
    toggle(show) {
        if (show === undefined) {
            showLoading = !showLoading;
        } else {
            showLoading = show;
        }
        if (showLoading) {
            loadingImg.style.display = 'inline';
            loadingDiv.style.display = 'block';
        } else {
            loadingImg.style.display = 'none';
            loadingDiv.style.display = 'none';
        }
    }
};

export { Loading as default };
