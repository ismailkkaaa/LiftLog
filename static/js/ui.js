window.LiftLogUI = (() => {
    const sessionKey = "liftlog.activeSession";

    function toast(message, tone = "default") {
        const root = document.getElementById("toast-root");
        if (!root) return;
        const item = document.createElement("div");
        item.className = `pointer-events-auto rounded-2xl px-4 py-3 text-sm font-semibold shadow-soft transition-all ${
            tone === "success" ? "bg-emerald-500 text-white" : tone === "error" ? "bg-rose-500 text-white" : "bg-slate-900 text-white"
        }`;
        item.textContent = message;
        root.appendChild(item);
        setTimeout(() => {
            item.style.opacity = "0";
            item.style.transform = "translateY(-8px)";
        }, 2200);
        setTimeout(() => item.remove(), 2600);
    }

    function setFormValues(form, values = {}) {
        Array.from(form.elements).forEach((element) => {
            if (!element.name || values[element.name] === undefined || values[element.name] === null) return;
            element.value = values[element.name];
        });
    }

    function serializeForm(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function persistSessionState(value) {
        localStorage.setItem(sessionKey, JSON.stringify(value));
    }

    function readSessionState() {
        try {
            return JSON.parse(localStorage.getItem(sessionKey) || "null");
        } catch {
            return null;
        }
    }

    function clearSessionState() {
        localStorage.removeItem(sessionKey);
    }

    function clearSampleLocalStorage() {
        // Remove known legacy sample/demo localStorage keys if present
        [
            'liftlog.demoPlan',
            'liftlog.samplePlan',
            'liftlog.defaultPlan',
            'liftlog.demo',
            'demo_workout',
        ].forEach((k) => localStorage.removeItem(k));
    }

    function sanitizeLocalStorage() {
        // Non-destructive validation of JSON entries used by app
        try {
            const keysToCheck = ['liftlog.activeSession'];
            keysToCheck.forEach((k) => {
                const raw = localStorage.getItem(k);
                if (!raw) return;
                try {
                    JSON.parse(raw);
                } catch (e) {
                    localStorage.removeItem(k);
                }
            });

            // Remove any duplicate demo-like keys
            ['demo_workout', 'liftlog.demo', 'liftlog.samplePlan', 'liftlog.defaultPlan'].forEach(k => localStorage.removeItem(k));

            // Ensure no duplicate items in a hypothetical workouts list
            const maybeList = localStorage.getItem('liftlog.workouts');
            if (maybeList) {
                try {
                    const arr = JSON.parse(maybeList);
                    if (Array.isArray(arr)) {
                        const uniq = Array.from(new Map(arr.map(i => [i && i.id ? i.id : JSON.stringify(i), i])).values());
                        localStorage.setItem('liftlog.workouts', JSON.stringify(uniq));
                    } else {
                        localStorage.removeItem('liftlog.workouts');
                    }
                } catch (e) {
                    localStorage.removeItem('liftlog.workouts');
                }
            }
        } catch (e) {
            console.debug('sanitizeLocalStorage error', e);
        }
    }

    async function clearAllClientStorage() {
        try {
            // Clear all localStorage (keep only keys needed?) — for now clear known keys plus others
            try { localStorage.clear(); } catch (e) { console.warn('localStorage clear failed', e); }

            // Clear all caches
            if (window.caches && caches.keys) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }

            // Clear IndexedDB databases where supported
            if (indexedDB && indexedDB.databases) {
                const dbs = await indexedDB.databases();
                await Promise.all(dbs.map(db => new Promise((res, rej) => {
                    try { indexedDB.deleteDatabase(db.name).onsuccess = res; } catch (e) { res(); }
                })));
            } else {
                // Best-effort: try common DB names
                const known = ['liftlog-db', 'workout-db', 'idb_database'];
                await Promise.all(known.map(name => new Promise((res) => {
                    try { indexedDB.deleteDatabase(name).onsuccess = res; } catch (e) { res(); }
                })));
            }

            // Notify service worker if present to purge its caches too
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_CLEAR_SITE_DATA_ACK' });
            }

            // Do not auto-reload here — let the user control refresh to avoid loops
            console.debug('clearAllClientStorage completed — no auto-reload triggered');
        } catch (e) {
            console.warn('Failed to clear client storage', e);
        }
    }

    function formatDateTime(value) {
        if (!value) return "";
        return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }

    return {
        toast,
        setFormValues,
        serializeForm,
        persistSessionState,
        readSessionState,
        clearSessionState,
        clearSampleLocalStorage,
        sanitizeLocalStorage,
        clearAllClientStorage,
        formatDateTime,
    };
})();
