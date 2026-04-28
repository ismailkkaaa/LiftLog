const CACHE_NAME = "liftlog-v2";
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
    "/static/images/icon-192.svg",
    "/static/images/icon-512.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
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
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                return response;
            }).catch(() => caches.match("/"));
        })
    );
});
