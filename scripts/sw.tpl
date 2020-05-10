/* eslint-disable no-restricted-globals */
const staticCacheName = '{{cacheName}}';
const filesToCache = {{cacheArray}};

self.addEventListener('install', (event) => {
    console.log('SW - Installing service worker and cache static assets');
    event.waitUntil(
        caches.open(staticCacheName)
            .then((cache) => cache.addAll(filesToCache))
    );
});

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        console.log('SW - Start installing of new service worker');
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    console.log('SW - Activating new service worker');
    const cacheWhitelist = [staticCacheName];
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.map((cacheName) => {
                if (cacheWhitelist.indexOf(cacheName) === -1) {
                    console.log('SW - Delete old cache: ', cacheName);
                    return caches.delete(cacheName);
                }
            })
        ))
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    console.log('SW - Fetch from cache: ', event.request.url);
                    return response;
                }
                console.log('SW - Fetch from network: ', event.request.url);
                return fetch(event.request);
            }).catch((error) => {
                console.log('SW - Fetch error: ', error);
            })
    );
});