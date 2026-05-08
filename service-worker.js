/* ═══════════════════════════════════════════════════
   TESLATUBE — service-worker.js
   PWA : Cache statique + stratégie réseau
════════════════════════════════════════════════════ */

const CACHE_NAME    = 'teslatube-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

/* ── Installation : mise en cache des assets statiques ── */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Mise en cache des assets statiques');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

/* ── Activation : suppression des anciens caches ── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Suppression ancien cache :', key);
                        return caches.delete(key);
                    })
            )
        )
    );
    self.clients.claim();
});

/* ── Fetch : stratégie selon le type de requête ── */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. API YouTube → Network Only (pas de cache, données fraîches)
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('youtube.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. Firebase → Network Only (auth + Firestore en temps réel)
    if (url.hostname.includes('firebase') || url.hostname.includes('firestore')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 3. Thumbnails YouTube → Cache First (images statiques, mise en cache auto)
    if (url.hostname.includes('ytimg.com') || url.hostname.includes('yt3.ggpht.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (!response || response.status !== 200) return response;
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                }).catch(() => new Response('', { status: 408 }));
            })
        );
        return;
    }

    // 4. Google Fonts → Cache First
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // 5. Assets locaux (HTML, CSS, JS, icons) → Stale While Revalidate
    //    Répond immédiatement depuis le cache, met à jour en arrière-plan
    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached); // si hors ligne, utilise le cache

            return cached || networkFetch;
        })
    );
});

/* ── Notification push (optionnel, pour plus tard) ── */
self.addEventListener('push', event => {
    if (!event.data) return;
    const data = event.data.json();
    self.registration.showNotification(data.title || 'TeslaTube', {
        body:    data.body || '',
        icon:    '/icons/icon-192.png',
        badge:   '/icons/icon-72.png',
        vibrate: [200, 100, 200]
    });
});
