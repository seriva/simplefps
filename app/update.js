import Loading from './loading';
import Menu from './menu';

// local vars
let newServiceWorker = null;

const shopUpdateDialog = () => {
    Menu.showMenu('A new version is available. Do you want to update?', [
        {
            text: 'Yes',
            callback: update

        },
        {
            text: 'No',
            callback: () => {
                Menu.hideMenu();
            }
        }
    ]);
};

if (window.localStorage.getItem('update-available') !== null) {
    shopUpdateDialog();
}

const update = () => {
    localStorage.removeItem('update-available');
    if (newServiceWorker !== null) {
        Loading.toggle(true, true);
        newServiceWorker.postMessage({ action: 'skipWaiting' });
    }
};

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
                    shopUpdateDialog();
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
