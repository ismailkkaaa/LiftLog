const CACHE_NAME = "liftlog-v5";
const APP_ASSETS = [
    "/",
    "/dashboard",
    "/workout-creator",
    "/live-workout",
    "/progress",
    "/profile",
    "/static/css/app.css",
    "/static/js/api.js",
    "/static/js/ui.js",
    "/static/js/charts.js",
    "/static/js/app.js",
    "/static/js/pwa.js",
    "/static/manifest.json",
    "/static/images/logo.png",
];

self.addEventListener("install", (event) => {
    // Pre-cache critical assets and force reload to bypass http cache where supported
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            const requests = APP_ASSETS.map((url) => new Request(url, { cache: 'reload' }));
            await cache.addAll(requests);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    // Delete older liftlog caches (different version names)
                    if (key !== CACHE_NAME && key.startsWith('liftlog-')) {
                        return caches.delete(key);
                    }
                    return Promise.resolve(true);
                })
            )
        ).then(() => {
            // Claim clients so the new service worker takes control immediately
            return self.clients.claim();
        }).then(() => {
            // Notify clients that a new version is active
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION_AVAILABLE' }));
            });
        })
    );
});

// Listen for messages from clients to trigger cache / site-data clearing
self.addEventListener('message', (event) => {
    try {
        const data = event.data || {};
        if (data && data.type === 'CLEAR_SITE_DATA') {
            // Remove all caches (allow client to clear localStorage/indexedDB)
            caches.keys().then((keys) => Promise.all(keys.map(k => caches.delete(k))));
            // Notify clients to clear their own storage
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => client.postMessage({ type: 'CLIENT_CLEAR_SITE_DATA' }));
            });
        }
        if (data && data.type === 'SKIP_WAITING') {
            self.skipWaiting();
        }
    } catch (e) {
        // ignore
    }
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const requestUrl = new URL(event.request.url);
    if (requestUrl.pathname.startsWith("/api/")) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Use network-first for JS/CSS/manifest so updates are fetched quickly,
    // fall back to cache. For other static assets prefer cache-first.
    const url = event.request.url;
    const isNav = event.request.mode === 'navigate';
    const isAppAsset = url.includes('/static/js/') || url.includes('/static/css/') || url.endsWith('/manifest.json');

    if (isAppAsset || isNav) {
        event.respondWith(
            fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            }).catch(() => caches.match(event.request).then((r) => r || caches.match('/')))
        );
        return;
    }

    // Cache-first for images and other assets
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200) return response;
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                return response;
            }).catch(() => caches.match('/'));
        })
    );
});
