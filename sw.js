const CACHE_NAME = 'erp-contable-v5_2_2';
const urlsToCache = ['/', '/index.html', '/manifest.json', '/styles.css', '/app.js', '/version.json'];

self.addEventListener('install', event => {
    console.log('[SW] Instalando nueva versión...', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Activando y limpiando caché vieja...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'UPDATE_AVAILABLE', version: CACHE_NAME });
                });
            });
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    return response;
                });
            })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
