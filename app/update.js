import Loading from './loading';
import GUI from './gui';
import Utils from './utils';

const h = GUI.h;

Utils.addCSS(
    `
    #update {
        background-color: transparent;
    }

    #update-button { 
        position: fixed; 
        width: 200px; 
        height: 50px; 
        color: #fff;
        text-align: center;
        line-height: 50px;
        font-size: 20px;
        bottom: 20px; 
        right: 20px; 
        opacity: 0.75;
        border: 2px solid #fff;
        background-color: #999;
        z-index : 99950;
        cursor: pointer;
    }
    `
);

// local vars
let isVisible = false;
let newServiceWorker = null;

if (window.localStorage.getItem('update-available') !== null) {
    isVisible = true;
}

const update = () => {
    isVisible = false;
    localStorage.removeItem('update-available');
    if (newServiceWorker !== null) {
        Loading.show(true, 'Updating...', true);
        newServiceWorker.postMessage({ action: 'skipWaiting' });
    }
};

// gui function
GUI.append(() =>
    h('div#update', isVisible ?
    [
        h('div# #update-button', {
            onclick: update
        }, ['Click to update!']),
    ]
    :
    [])
);

if (navigator.serviceWorker && window.location.hostname !== 'localhost') {
    navigator.serviceWorker.register('./sw.js')
    .then((registration) => {
        console.log('SW - Registered: ', registration);
        registration.update();
        registration.addEventListener('updatefound', () => {
            console.log('SW - Service worker update found');
            newServiceWorker = registration.installing;
            newServiceWorker.addEventListener('statechange', () => {
                if (newServiceWorker.state === 'installed') {
                    isVisible = true;
                    localStorage.setItem('update-available', '');
                }
            });
        });
    }).catch((error) => {
        console.log('SW - Registration failed: ', error);
    });

    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        console.log('SW - Refreshing to load new version');
        window.location.reload();
        refreshing = true;
    });
}
