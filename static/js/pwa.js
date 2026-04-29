if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");

            console.info('Service worker registered at', reg.scope);

            // Listen for updates found (new worker installing)
            reg.addEventListener('updatefound', () => {
                const installing = reg.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    if (installing.state === 'installed') {
                        // New content is available; notify user (do NOT auto-activate)
                        console.info('Service worker state: installed (update available)');
                        try { showUpdateUIBanner(); } catch (e) { console.debug('showUpdateUIBanner failed', e); }
                    }
                });
            });

            // If controller changes (new SW took control), show update banner (do not auto-reload)
            if (!window.__swListenersAdded) {
                window.__swListenersAdded = true;

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.info('service worker controller changed');
                    // Show update banner once
                    try { showUpdateUIBanner(); } catch (e) { console.debug('showUpdateUIBanner failed', e); }
                });

                navigator.serviceWorker.addEventListener('message', (event) => {
                    const data = event.data || {};
                    if (data && data.type === 'CLIENT_CLEAR_SITE_DATA') {
                        // SW requests clients to clear local storage and indexedDB
                        try { window.LiftLogUI?.clearAllClientStorage?.(); } catch (e) { console.debug('clearAllClientStorage failed', e); }
                        // Acknowledge to SW
                        if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_CLEAR_SITE_DATA_ACK' });
                    }

                    if (data && data.type === 'NEW_VERSION_AVAILABLE') {
                        console.info('New app version available');
                        try { showUpdateUIBanner(); } catch (e) { console.debug('showUpdateUIBanner failed', e); }
                    }
                });


            }

            function showUpdateUIBanner() {
                if (document.getElementById('update-banner')) return;
                const banner = document.createElement('div');
                banner.id = 'update-banner';
                banner.style = 'position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;background:#075985;color:#fff;font-weight:700;gap:8px';
                banner.innerHTML = '<span>New update available</span>';
                const btn = document.createElement('button');
                btn.textContent = 'Refresh';
                btn.style = 'background:#fff;color:#075985;border-radius:8px;padding:6px 10px;font-weight:700;border:none;cursor:pointer';
                btn.addEventListener('click', () => {
                    try { navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' }); } catch (e) { console.debug(e); }
                    setTimeout(() => location.reload(), 200); // user-initiated; safe single reload
                });
                banner.appendChild(btn);
                document.body.appendChild(banner);
            }
        } catch (e) {
            // keep app usable when service workers are unavailable
            console.debug('SW registration failed', e);
        }
    });
}

