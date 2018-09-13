const staticCacheName = '{{cacheName}}';
const filesToCache = {{cacheArray}};

self.addEventListener('install', event => {
  console.log('SW - Attempting to install service worker and cache static assets');
  event.waitUntil(
    caches.open(staticCacheName).then(cache => {
      return cache.addAll(filesToCache);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', event => {
  console.log('SW - Activating new service worker');
  const cacheWhitelist = [staticCacheName];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log("SW - Delete old cache: ", cacheName)
            return caches.delete(cacheName);
          }
        }));
    }));
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
  console.log('SW - Fetch event for: ', event.request.url);
  event.respondWith(
    caches.match(event.request)
    .then(response => {
      if (response) {
        console.log('SW - Found in cache: ', event.request.url);
        return response;
      }
      console.log('SW - Network request for: ', event.request.url);
      return fetch(event.request)
    }).catch(error => {
      console.log('SW - Fetch error: ', error);
    })
  );
});