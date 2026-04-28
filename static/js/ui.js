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
        formatDateTime,
    };
})();
