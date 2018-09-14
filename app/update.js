import Loading from './loading';

if (navigator.serviceWorker && window.location.hostname !== 'localhost') {
    let newWorker;

    navigator.serviceWorker.register('./sw.js')
    .then((registration) => {
        console.log('SW - Registered: ', registration);
        registration.update();
        registration.addEventListener('updatefound', () => {
            console.log('SW - Service worker update found');
            newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                    Loading.show(true, 'Updating...', true);
                    newWorker.postMessage({ action: 'skipWaiting' });
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
