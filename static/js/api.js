window.LiftLogAPI = (() => {
    async function request(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Request failed");
        }
        return data;
    }

    return {
        getProfile: () => request("/api/profile"),
        saveProfile: (payload) => request("/api/profile", { method: "POST", body: JSON.stringify(payload) }),
        getDashboard: () => request("/api/dashboard"),
        getWorkouts: () => request("/api/workouts"),
        getWorkout: (id) => request(`/api/workouts/${id}`),
        createWorkout: (payload) => request("/api/workouts", { method: "POST", body: JSON.stringify(payload) }),
        updateWorkout: (id, payload) => request(`/api/workouts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
        deleteWorkout: (id) => request(`/api/workouts/${id}`, { method: "DELETE" }),
        startLiveWorkout: (dayId) => request("/api/live-workout", { method: "POST", body: JSON.stringify({ workout_day_id: dayId }) }),
        getCurrentSession: () => request("/api/live-workout"),
        getSession: (id) => request(`/api/live-workout?session_id=${encodeURIComponent(id)}`),
        completeSet: (sessionId, payload) =>
            request("/api/live-set", { method: "POST", body: JSON.stringify({ ...payload, session_id: sessionId }) }),
        getProgress: () => request("/api/progress"),
        getHistory: () => request("/api/history"),
        logBodyWeight: (payload) => request("/api/body-weight", { method: "POST", body: JSON.stringify(payload) }),
    };
})();
