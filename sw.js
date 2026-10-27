// ==================== sw.js ====================
// Service Worker - ERP Contable Argentina
// v7.16.15 - Network-first para HTML/JS, auto-actualización, cache-first para assets
// El CACHE_VERSION se bumpea en cada deploy importante.

const CACHE_VERSION = 'v7_24_25';
const CACHE_NAME = `erp-contable-${CACHE_VERSION}`;
const urlsToCache = ['/', '/index.html', '/manifest.json', '/styles.css', '/version.json'];

// ==================== INSTALL: cachear shell y activar de una ====================
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// ==================== ACTIVATE: limpiar cachés viejas y avisar ====================
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
            return self.clients.claim();
        }).then(() => {
            return self.clients.matchAll({ type: 'window' });
        }).then(clients => {
            clients.forEach(client => {
                client.postMessage({ type: 'UPDATE_AVAILABLE', version: CACHE_VERSION });
            });
        })
    );
});

// ==================== FETCH: network-first HTML/JS, cache-first assets ====================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // No cachear: métodos no-GET, otros orígenes (Firebase, gstatic, cdn, etc.)
    if (event.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // Network-first para HTML y JS
    const esHTMLoJS = url.pathname === '/' ||
                      url.pathname.endsWith('.html') ||
                      url.pathname.endsWith('.js');

    if (esHTMLoJS) {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then(response => {
                    // Guardar copia fresca
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Si falla la red (offline), usar caché
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Cache-first para CSS, imágenes, manifest, JSON
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
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

// ==================== MENSAJE: SKIP_WAITING desde el cliente ====================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'FORCE_UPDATE') {
        // Forzar la actualización inmediata
        self.skipWaiting();
    }
});
