const CACHE_NAME = "liftlog-v3";
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
    "/static/images/icon-192-v2.png",
    "/static/images/icon-512-v2.png",
];

self.addEventListener("install", (event) => {
    // Force reload resources to ensure new icons are fetched
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Use Request with cache: 'reload' to bypass HTTP cache where supported
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
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    // Claim clients so the new service worker takes control immediately
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const requestUrl = new URL(event.request.url);
    if (requestUrl.pathname.startsWith("/api/")) {
        event.respondWith(fetch(event.request));
        return;
    }
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Only cache successful responses
                if (!response || response.status !== 200 || response.type === 'opaque') return response;
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                return response;
            }).catch(() => caches.match("/"));
        })
    );
});
