/* ═══════════════════════════════════════════════════
   TESLATUBE — service-worker.js
════════════════════════════════════════════════════ */

const CACHE_NAME    = 'teslatube-v2';
const STATIC_ASSETS = [
    '/teslatube/',
    '/teslatube/index.html',
    '/teslatube/style.css',
    '/teslatube/script.js',
    '/teslatube/pwa.js',
    '/teslatube/manifest.json'
];

/* ── Installation : cache souple (ignore les erreurs) ── */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // On cache chaque fichier individuellement
            // pour qu'une erreur sur un fichier ne bloque pas tout
            return Promise.allSettled(
                STATIC_ASSETS.map(url =>
                    cache.add(url).catch(err =>
                        console.warn('[SW] Impossible de cacher :', url, err)
                    )
                )
            );
        })
    );
    self.skipWaiting();
});

/* ── Activation : nettoyage des anciens caches ── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

/* ── Fetch : stratégie selon le type de requête ── */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API YouTube → Network Only
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('youtube.com')) {
        event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    // Firebase → Network Only
    if (url.hostname.includes('firebase') || url.hostname.includes('firestore') || url.hostname.includes('identitytoolkit')) {
        event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    // Thumbnails YouTube → Cache First
    if (url.hostname.includes('ytimg.com') || url.hostname.includes('yt3.ggpht.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 408 }));
            })
        );
        return;
    }

    // Google Fonts → Cache First
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 408 }));
            })
        );
        return;
    }

    // Assets locaux → Network First avec fallback cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
