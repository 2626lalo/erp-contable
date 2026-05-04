const CACHE_NAME = 'erp-contable-v4';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css',
    '/app.js'
];

// Instalar nueva versión
self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando nueva versión...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activar y limpiar caché vieja
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activando y limpiando caché vieja...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Eliminando caché:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Notificando a clientes para actualizar...');
            // Notificar a todos los clientes que hay nueva versión
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'UPDATE_AVAILABLE', version: CACHE_NAME });
                });
            });
            return self.clients.claim();
        })
    );
});

// Interceptar fetch y servir desde caché
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

// Escuchar mensajes desde la app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
