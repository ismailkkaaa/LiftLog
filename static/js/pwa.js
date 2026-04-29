if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");
            // If there's an active worker, ask it to clear site data to force icon refresh
            if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            // Ask the service worker to clear caches and notify clients to clear local storage / indexedDB
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
                if (data && data.type === 'CLIENT_CLEAR_SITE_DATA_ACK') {
                    console.debug('Client storage cleared ack');
                }
            });
        } catch (e) {
            // keep app usable when service workers are unavailable
            console.debug('SW registration failed', e);
        }
    });
}

