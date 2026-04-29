if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");

            // If waiting worker exists, instruct it to skip waiting so activation happens
            if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            // Listen for updates found (new worker installing)
            reg.addEventListener('updatefound', () => {
                const installing = reg.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    if (installing.state === 'installed') {
                        // New content is available; request it activate now
                        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // If controller changes (new SW took control), reload to use new assets
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                // Avoid multiple reloads
                if (window.__swReloading) return;
                window.__swReloading = true;
                window.location.reload(true);
            });

            // If there is an active controller, ask it to clear stale caches (best-effort)
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_SITE_DATA' });
            }

            navigator.serviceWorker.addEventListener('message', (event) => {
                const data = event.data || {};
                if (data && data.type === 'CLIENT_CLEAR_SITE_DATA') {
                    // SW requests clients to clear local storage and indexedDB
                    try { window.LiftLogUI?.clearAllClientStorage?.(); } catch (e) { console.debug('clearAllClientStorage failed', e); }
                    // Acknowledge to SW
                    if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_CLEAR_SITE_DATA_ACK' });
                }

                if (data && data.type === 'NEW_VERSION_AVAILABLE') {
                    // auto-reload when new version is activated
                    console.info('New app version available, reloading...');
                    try { window.__swReloading = true; window.location.reload(true); } catch (e) { console.debug('reload failed', e); }
                }
            });
        } catch (e) {
            // keep app usable when service workers are unavailable
            console.debug('SW registration failed', e);
        }
    });
}

