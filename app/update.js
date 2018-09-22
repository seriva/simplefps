import Loading from './loading';
import Menu from './menu';

// local vars
let newServiceWorker = null;
let registration = null;

const shopUpdateDialog = () => {
    Menu.showMenu('A new version is available. Do you want to update now?', [
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

const update = () => {
    if (newServiceWorker !== null) {
        Loading.toggle(true, true);
        newServiceWorker.postMessage({ action: 'skipWaiting' });
    } else {
        Menu.hideMenu();
        console.log('SW - No new service worker found to update');
    }
};

if (navigator.serviceWorker && window.location.hostname !== 'localhost') {
    navigator.serviceWorker.register('./sw.js')
    .then((reg) => {
        console.log('SW - Registered: ', reg);
        registration = reg;
        registration.update();
        if (registration.waiting) {
            newServiceWorker = registration.waiting;
            shopUpdateDialog();
        } else {
            registration.addEventListener('updatefound', () => {
                console.log('SW - Service worker update found');
                newServiceWorker = registration.installing;
                newServiceWorker.addEventListener('statechange', () => {
                    if (newServiceWorker.state === 'installed') {
                        shopUpdateDialog();
                    }
                });
            });
        }
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

const Update = {
    force: () => {
        if (newServiceWorker !== null) {
            shopUpdateDialog();
            return;
        }
        if (registration !== null) {
            registration.update();
        }
    }
};

export { Update as default };
