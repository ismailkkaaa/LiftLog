if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            // Silent fail keeps the app usable when service workers are unavailable.
        });
    });
}
