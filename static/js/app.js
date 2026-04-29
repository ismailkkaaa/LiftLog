(function () {
    const api = window.LiftLogAPI;
    const ui = window.LiftLogUI;

    const page = document.querySelector("main[data-page]")?.dataset.page;
    let activeEditWorkoutId = null;

    // Prevent double initialization across hot reloads / duplicate script loads
    if (window.appInitialized) return;
    window.appInitialized = true;

    document.addEventListener("DOMContentLoaded", () => {
        // Sanitize localStorage and remove known demo keys (non-destructive)
        try { ui.sanitizeLocalStorage?.(); } catch (e) { console.debug('sanitizeLocalStorage failed', e); }
        ui.clearSampleLocalStorage?.();

        if (page === "login") initLogin();
        if (page === "dashboard") initDashboard();
        if (page === "workout_creator") initWorkoutCreator();
        if (page === "live_workout") initLiveWorkout();
        if (page === "progress") initProgress();
        if (page === "profile") initProfile();
    });

    async function initLogin() {
        const form = document.getElementById("onboarding-form");
        const { profile } = await api.getProfile();
        if (profile) {
            ui.setFormValues(form, profile);
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = normalizeProfile(ui.serializeForm(form));
            await api.saveProfile(values);
            ui.toast("Profile saved", "success");
            window.location.href = "/dashboard";
        });
    }

    async function initDashboard() {
        const data = await api.getDashboard();
        const greeting = document.getElementById("dashboard-greeting");
        const todayTitle = document.getElementById("today-workout-title");
        const todaySubtitle = document.getElementById("today-workout-subtitle");
        const weeklyTarget = document.getElementById("weekly-target-score");
        const completedSessions = document.getElementById("completed-sessions");
        const completionRate = document.getElementById("completion-rate");
        const dayGrid = document.getElementById("day-card-grid");
        const emptyState = document.getElementById("dashboard-empty");
        // Clone buttons to ensure there are no duplicate event listeners from prior initializations
        const _startOrig = document.getElementById("start-todays-workout");
        const startButton = _startOrig ? _startOrig.cloneNode(true) : null;
        if (_startOrig && _startOrig.parentNode && startButton) _startOrig.parentNode.replaceChild(startButton, _startOrig);
        const _resumeOrig = document.getElementById("resume-workout-button");
        const resumeButton = _resumeOrig ? _resumeOrig.cloneNode(true) : null;
        if (_resumeOrig && _resumeOrig.parentNode && resumeButton) _resumeOrig.parentNode.replaceChild(resumeButton, _resumeOrig);

        greeting.textContent = data.profile?.name ? `Welcome back, ${data.profile.name}` : "Welcome back";
        weeklyTarget.textContent = `${data.weekly_progress.completed_this_week}/${data.weekly_progress.target}`;
        completedSessions.textContent = String(data.completion_stats.completed_sessions);
        const rate = data.completion_stats.total_sessions
            ? Math.round((data.completion_stats.completed_sessions / data.completion_stats.total_sessions) * 100)
            : 0;
        completionRate.textContent = `${rate}%`;

        if (data.todays_workout) {
            todayTitle.textContent = `${data.todays_workout.day_name} • ${data.todays_workout.category}`;
            if (data.todays_workout.status === "AVAILABLE") {
                todaySubtitle.textContent = `${data.todays_workout.workout_name} is available today.`;
                startButton.textContent = "Start session";
                startButton.disabled = false;
                startButton.addEventListener("click", async () => {
                    const session = await api.startLiveWorkout(data.todays_workout.id);
                    ui.persistSessionState({ sessionId: session.session.id });
                    window.location.href = "/live-workout";
                });
            } else if (data.todays_workout.status === "COMPLETED") {
                todaySubtitle.textContent = "Completed today";
                startButton.textContent = "Completed";
                startButton.disabled = true;
            } else {
                todaySubtitle.textContent = "This workout is locked";
                startButton.textContent = "Locked";
                startButton.disabled = true;
            }
        } else {
            startButton.disabled = true;
            startButton.textContent = "No workout today";
        }

        if (data.resume_session_id) {
            resumeButton.classList.remove("hidden");
            resumeButton.addEventListener("click", () => {
                ui.persistSessionState({ sessionId: data.resume_session_id });
                window.location.href = "/live-workout";
            });
        }

        // Clear container to avoid duplicates and ensure clean layout
        dayGrid.innerHTML = "";
        const seen = new Set();
        if (!data.day_cards.length) {
            emptyState.classList.remove("hidden");
        } else {
            emptyState.classList.add("hidden");
        }

        // Ensure container uses responsive grid class (defined in CSS)
        dayGrid.classList.add('weekly-grid');

        data.day_cards.forEach((day) => {
            if (!day || seen.has(day.id)) return;
            seen.add(day.id);

            const card = document.createElement("article");
            card.className = `workout-day-card ${day.status === "LOCKED" ? "is-locked" : ""} ${day.status === "COMPLETED" ? "is-completed" : ""}`;
            card.style.width = '100%';
            card.innerHTML = `
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] ${day.status === "AVAILABLE" ? "text-cyan-700" : day.status === "COMPLETED" ? "text-emerald-600" : "text-slate-500"}">${day.day_name}</p>
                        <p class="mt-2 text-lg font-bold text-slate-900">${day.category}</p>
                        <p class="mt-1 text-sm text-slate-500">${day.workout_name}</p>
                    </div>
                    <span class="workout-day-badge ${day.status === "AVAILABLE" ? "is-available" : day.status === "COMPLETED" ? "is-complete" : "is-locked"}">
                        ${day.status === "LOCKED" ? `${lockIconMarkup()}LOCKED` : day.status}
                    </span>
                </div>
                <p class="mt-4 text-sm ${day.status === "AVAILABLE" ? "text-cyan-700" : day.status === "COMPLETED" ? "text-emerald-700" : "text-slate-500"}">${dayStatusText(day)}</p>
                <button type="button" class="${day.status === "AVAILABLE" ? "primary-button" : "secondary-button"} mt-4 w-full" ${day.status === "AVAILABLE" ? "" : "disabled"}>
                    ${day.status === "AVAILABLE" ? "Start workout" : day.status === "COMPLETED" ? "Completed" : "Locked"}
                </button>
            `;

            if (day.status === "AVAILABLE") {
                const btn = card.querySelector("button");
                btn.addEventListener("click", async () => {
                    const session = await api.startLiveWorkout(day.id);
                    ui.persistSessionState({ sessionId: session.session.id });
                    window.location.href = "/live-workout";
                });
            }

            dayGrid.appendChild(card);
        });
    }



    async function initWorkoutCreator() {
        const builder = document.getElementById("days-builder");
        const form = document.getElementById("workout-form");
        const savedWorkouts = document.getElementById("saved-workouts");
        const exerciseChips = document.getElementById("exercise-chips");
        const exerciseSearch = document.getElementById("exercise-search");
        const templatesSheet = document.getElementById("templates-sheet");

        const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const EXERCISES = ["Bench Press","Incline Press","Pushups","Cable Fly","Pec Deck","Squat","Deadlift","Overhead Press","Barbell Row","Lat Pulldown"];
        const REP_PRESETS = {
            Strength: "5,5,5,5",
            Hypertrophy: "12,10,8,6",
            Endurance: "15,15,12,12",
        };

        const state = { days: {} };
        let selectedDay = DAYS[0];
        DAYS.forEach((d) => (state.days[d] = { day_name: d, category: "", exercises: [] }));

        function renderDayTabs() {
            const tabs = document.createElement("div");
            tabs.className = "day-tabs";
            DAYS.forEach((d) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = `day-tab ${d === selectedDay ? "active" : ""}`;
                btn.textContent = d.slice(0,3).toUpperCase();
                btn.addEventListener("click", () => { selectedDay = d; render(); });
                tabs.appendChild(btn);
            });
            return tabs;
        }

        function render() {
            builder.innerHTML = "";
            const tabs = renderDayTabs();
            builder.appendChild(tabs);

            const card = document.createElement("div");
            card.className = "day-card mt-3";

            const catLabel = document.createElement("label");
            catLabel.className = "field";
            catLabel.innerHTML = `<span>Category</span>`;
            const catInput = document.createElement("input");
            catInput.value = state.days[selectedDay].category || "";
            catInput.placeholder = "Chest";
            catInput.addEventListener("input", () => (state.days[selectedDay].category = catInput.value));
            catLabel.appendChild(catInput);
            card.appendChild(catLabel);

            const list = document.createElement("div");
            list.className = "mt-3 space-y-2";
            state.days[selectedDay].exercises.forEach((ex, idx) => {
                const exWrap = document.createElement("div");
                exWrap.className = "rounded-lg p-3 bg-slate-50 flex items-start justify-between gap-3";
                exWrap.innerHTML = `
                    <div>
                        <div class="font-bold">${ex.exercise_name}</div>
                        <div class="text-sm text-slate-500">Sets: ${ex.sets.length} • Reps: ${ex.sets.map(s=>s.target_reps).join(",")}</div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button class="secondary-button" data-action="edit">Edit</button>
                        <button class="danger-button" data-action="remove">Remove</button>
                    </div>
                `;
                exWrap.querySelector('[data-action="edit"]').addEventListener("click", () => openExerciseEditor(selectedDay, idx));
                exWrap.querySelector('[data-action="remove"]').addEventListener("click", () => { state.days[selectedDay].exercises.splice(idx,1); render(); });
                list.appendChild(exWrap);
            });
            card.appendChild(list);

            const addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "primary-button w-full mt-3";
            addBtn.textContent = "+ Add Exercise";
            addBtn.addEventListener("click", () => { exerciseSearch.focus(); });
            card.appendChild(addBtn);

            builder.appendChild(card);
        }

        function openExerciseEditor(dayName, index) {
            const ex = state.days[dayName].exercises[index];
            const modal = document.createElement("div");
            modal.className = "modal-shell";
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-card">
                    <h3 class="text-lg font-bold">Edit ${ex.exercise_name}</h3>
                    <label class="field mt-3"><span>Sets</span><input type="number" id="_sets_count" value="${ex.sets.length}" min="1"/></label>
                    <label class="field mt-2"><span>Rep pattern (comma separated)</span><input id="_rep_pattern" value="${ex.sets.map(s=>s.target_reps).join(',')}"/></label>
                    <div class="mt-3 text-right"><button class="secondary-button" id="_cancel">Cancel</button> <button class="primary-button" id="_save">Save</button></div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#_cancel').addEventListener('click', () => modal.remove());
            modal.querySelector('#_save').addEventListener('click', () => {
                const setsCount = parseInt(modal.querySelector('#_sets_count').value||'0',10)||1;
                const pattern = modal.querySelector('#_rep_pattern').value.split(',').map(s=>parseInt(s.trim()||'0',10)||0).filter(n=>n>0);
                const sets = pattern.length ? pattern.slice(0, setsCount) : Array.from({length:setsCount}).map(()=>ex.sets[0]?.target_reps||12);
                state.days[dayName].exercises[index].sets = sets.map((r,i)=>({target_reps: r, set_order: i}));
                modal.remove();
                render();
            });
        }

        function addExerciseToDay(name, opts={}){
            const pattern = (state.lastPreset || opts.repPattern || '12,10,8,6').split(',').map(s=>parseInt(s.trim()||'0',10)).filter(n=>n>0);
            const count = opts.sets || pattern.length || 3;
            const finalSets = pattern.length ? pattern.slice(0,count) : Array.from({length:count}).map(()=>12);
            state.days[selectedDay].exercises.push({exercise_name: name, sets: finalSets.map((r,i)=>({target_reps:r,set_order:i}))});
            render();
        }

        function renderChips(){
            exerciseChips.innerHTML = "";
            EXERCISES.forEach((name)=>{
                const c = document.createElement('button');
                c.type='button';
                c.className='exercise-chip';
                c.textContent=name;
                c.addEventListener('click', ()=> addExerciseToDay(name));
                exerciseChips.appendChild(c);
            });
        }
        exerciseSearch.addEventListener('keydown',(e)=>{
            if(e.key==='Enter'){
                e.preventDefault();
                const val = exerciseSearch.value.trim();
                if(!val) return;
                addExerciseToDay(val);
                exerciseSearch.value='';
            }
        });

        document.getElementById('rep-presets').addEventListener('click',(e)=>{
            if(e.target.tagName==='BUTTON'){
                const preset = e.target.textContent.trim();
                const pattern = REP_PRESETS[preset] || '12,10,8,6';
                state.lastPreset = pattern;
                ui.toast(`${preset} pattern applied`);
            }
        });

        document.getElementById('open-templates').addEventListener('click',()=>{
            templatesSheet.classList.remove('hidden');
            templatesSheet.setAttribute('aria-hidden','false');
        });
        templatesSheet.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',()=>{templatesSheet.classList.add('hidden');templatesSheet.setAttribute('aria-hidden','true');}));
        templatesSheet.querySelectorAll('[data-template]').forEach(btn=>btn.addEventListener('click',()=>{
            const name = btn.getAttribute('data-template');
            applyTemplate(name);
            templatesSheet.classList.add('hidden');
            templatesSheet.setAttribute('aria-hidden','true');
        }));

        function applyTemplate(name){
            const presets = {
                'push-pull-legs': {
                    Monday: {category:'Chest', exercises:['Bench Press','Incline Press','Cable Fly']},
                    Wednesday: {category:'Back', exercises:['Barbell Row','Lat Pulldown','Deadlift']},
                    Friday: {category:'Legs', exercises:['Squat','Leg Press','Calf Raise']}
                },
                'arnold-split': {
                    Monday:{category:'Chest/Back', exercises:['Bench Press','Barbell Row']},
                    Tuesday:{category:'Shoulders/Arms', exercises:['Overhead Press','Bicep Curl']}
                },
                'bro-split': {
                    Monday:{category:'Chest', exercises:['Bench Press','Pec Deck']},
                    Tuesday:{category:'Back', exercises:['Deadlift','Pullup']}
                },
                'upper-lower': {
                    Monday:{category:'Upper', exercises:['Bench Press','Barbell Row']},
                    Thursday:{category:'Lower', exercises:['Squat','Deadlift']}
                }
            };
            const template = presets[name];
            if(!template) return;
            DAYS.forEach(d=>{state.days[d].category=''; state.days[d].exercises=[]});
            Object.entries(template).forEach(([day,info])=>{
                state.days[day].category = info.category;
                info.exercises.forEach(ex=> state.days[day].exercises.push({exercise_name:ex, sets:[{target_reps:12,set_order:0},{target_reps:10,set_order:1},{target_reps:8,set_order:2}]}));
            });
            ui.toast('Template applied', 'success');
            render();
        }

        form.addEventListener('submit', async (e)=>{
            e.preventDefault();
            const payload = buildPayload();
            if(!payload.days.length){ ui.toast('Add at least one day with exercises','error'); return; }
            if(activeEditWorkoutId){ await api.updateWorkout(activeEditWorkoutId,payload); ui.toast('Workout plan updated','success'); }
            else { await api.createWorkout(payload); ui.toast('Workout plan saved','success'); }
            activeEditWorkoutId = null; form.reset(); DAYS.forEach(d=>{state.days[d].category=''; state.days[d].exercises=[]}); render(); await renderSavedWorkouts();
        });

        function buildPayload(){
            const days = Object.values(state.days)
                .filter(d=>d.exercises && d.exercises.length)
                .map(d=>({ day_name:d.day_name, category:d.category||'General', exercises:d.exercises.map(ex=>({ exercise_name:ex.exercise_name, sets: ex.sets.map((s,i)=>({ target_reps: s.target_reps })) })) }));
            return { name: form.elements.name.value || 'New Plan', notes: form.elements.notes.value || '', days };
        }

        async function renderSavedWorkouts(){
            const { workouts } = await api.getWorkouts();
            savedWorkouts.innerHTML = '';
            if(!workouts.length){ savedWorkouts.innerHTML = `<div class="rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-500">No workout plans yet. Create your first split above.</div>`; return; }
            workouts.forEach((workout)=>{
                const item = document.createElement('div');
                item.className='rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4';
                item.innerHTML = `
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">${workout.name}</h3>
                            <p class="mt-1 text-sm text-slate-500">${workout.days.length} days configured</p>
                        </div>
                        <div class="flex gap-2">
                            <button type="button" class="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700" data-action="edit">Edit</button>
                            <button type="button" class="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600" data-action="delete">Delete</button>
                        </div>
                    </div>
                `;
                item.querySelector('[data-action="edit"]').addEventListener('click',()=> populateWorkoutEditor(workout));
                item.querySelector('[data-action="delete"]').addEventListener('click',async ()=>{ await api.deleteWorkout(workout.id); ui.toast('Workout removed'); renderSavedWorkouts(); });
                savedWorkouts.appendChild(item);
            });
        }

        function populateWorkoutEditor(workout){
            activeEditWorkoutId = workout.id; form.reset();
            DAYS.forEach(d=>{state.days[d].category=''; state.days[d].exercises=[]});
            workout.days.forEach(d=>{
                if(state.days[d.day_name]){
                    state.days[d.day_name].category = d.category || '';
                    state.days[d.day_name].exercises = d.exercises.map(ex=>({ exercise_name: ex.exercise_name || ex.name, sets: ex.sets.map(s=>({ target_reps: s.target_reps })) }));
                }
            });
            form.elements.name.value = workout.name; form.elements.notes.value = workout.notes || '';
            ui.toast(`Editing ${workout.name}`);
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        render();
        renderChips();
        await renderSavedWorkouts();
    }

    async function initLiveWorkout() {
        const empty = document.getElementById("live-empty");
        const blocked = document.getElementById("live-blocked");
        const panel = document.getElementById("live-panel");
        const form = document.getElementById("set-complete-form");
        const persisted = ui.readSessionState();
        let sessionId = persisted?.sessionId;

        function showEmpty() {
            empty.classList.remove("hidden");
            blocked.classList.add("hidden");
            panel.classList.add("hidden");
        }

        function showBlocked(message) {
            empty.classList.add("hidden");
            blocked.classList.remove("hidden");
            panel.classList.add("hidden");
            document.getElementById("live-blocked-message").textContent = message;
            ui.clearSessionState();
        }

        if (!sessionId) {
            try {
                const current = await api.getCurrentSession();
                sessionId = current.session?.id || current.session?.session?.id;
            } catch (error) {
                if (error.message === "This workout is locked") {
                    showBlocked(error.message);
                    return;
                }
                throw error;
            }
        }

        if (!sessionId) {
            showEmpty();
            return;
        }

        empty.classList.add("hidden");
        blocked.classList.add("hidden");
        panel.classList.remove("hidden");

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = ui.serializeForm(form);
            const details = await api.completeSet(sessionId, payload);
            ui.persistSessionState({ sessionId });
            renderSession(details);
            const latest = details.latest_result;
            if (latest?.is_pr_weight || latest?.is_pr_reps) {
                const messages = [];
                if (latest.is_pr_weight) messages.push("highest weight");
                if (latest.is_pr_reps) messages.push("most reps");
                document.getElementById("pr-banner").classList.remove("hidden");
                document.getElementById("pr-banner-text").textContent = `${latest.exercise_name}: new ${messages.join(" + ")}`;
            }
            form.reset();
            if (details.session.status === "completed") {
                ui.clearSessionState();
                ui.toast("Workout complete", "success");
            }
        });

        try {
            const details = await api.getSession(sessionId);
            renderSession(details);
        } catch (error) {
            if (error.message === "This workout is locked") {
                showBlocked(error.message);
                return;
            }
            throw error;
        }
    }

    async function initProgress() {
        const data = await api.getProgress();
        window.LiftLogCharts.renderLine(
            "strength-chart",
            data.strength_progress.map((item) => item.logged_on),
            data.strength_progress.map((item) => item.max_weight),
            "Strength",
            "#06b6d4"
        );
        window.LiftLogCharts.renderLine(
            "weight-chart",
            data.body_weight.map((item) => item.logged_on),
            data.body_weight.map((item) => item.weight),
            "Body weight",
            "#22c55e"
        );
        window.LiftLogCharts.renderBar(
            "consistency-chart",
            data.weekly_consistency.map((item) => `W${item.week_number}`),
            data.weekly_consistency.map((item) => item.sessions),
            "#0f172a"
        );

        const list = document.getElementById("exercise-history-list");
        list.innerHTML = "";
        Object.entries(data.exercise_history)
            .slice(0, 5)
            .forEach(([exercise, entries]) => {
                const latest = entries[0];
                const card = document.createElement("div");
                card.className = "rounded-[1.4rem] bg-slate-50 p-4";
                card.innerHTML = `
                    <div class="flex items-center justify-between gap-4">
                        <div>
                            <p class="text-base font-bold text-slate-900">${exercise}</p>
                            <p class="mt-1 text-sm text-slate-500">${entries.length} logged sessions</p>
                        </div>
                        <div class="text-right">
                            <p class="text-lg font-extrabold text-slate-900">${latest.max_weight || 0} kg</p>
                            <p class="text-xs text-slate-500">${latest.logged_on || ""}</p>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });
    }

    async function initProfile() {
        const form = document.getElementById("profile-form");
        const historyList = document.getElementById("history-list");
        const prList = document.getElementById("pr-list");
        const clearDataButton = document.getElementById("clear-data-button");
        const resetModal = document.getElementById("reset-data-modal");
        const confirmResetButton = document.getElementById("confirm-reset-data-button");

        const [{ profile }, history] = await Promise.all([api.getProfile(), api.getHistory()]);
        if (profile) ui.setFormValues(form, profile);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            await api.saveProfile(normalizeProfile(ui.serializeForm(form)));
            ui.toast("Profile updated", "success");
        });

        function closeResetModal() {
            resetModal.classList.add("hidden");
            resetModal.setAttribute("aria-hidden", "true");
        }

        function openResetModal() {
            resetModal.classList.remove("hidden");
            resetModal.setAttribute("aria-hidden", "false");
        }

        clearDataButton.addEventListener("click", openResetModal);
        resetModal.querySelectorAll("[data-close-modal]").forEach((element) => {
            element.addEventListener("click", closeResetModal);
        });
        confirmResetButton.addEventListener("click", async () => {
            confirmResetButton.disabled = true;
            try {
                const result = await api.resetData();
                closeResetModal();
                ui.clearSessionState();
                form.reset();
                if (result.profile) {
                    ui.setFormValues(form, result.profile);
                }
                historyList.innerHTML = `<div class="rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-500">No completed workouts yet. Finish a session to unlock history.</div>`;
                prList.innerHTML = `<div class="rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-500">No PRs yet. Lift consistently and they will appear here.</div>`;
                ui.toast("All data cleared", "success");
            } finally {
                confirmResetButton.disabled = false;
            }
        });

        historyList.innerHTML = "";
        if (!history.sessions.length) {
            historyList.innerHTML = `<div class="rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-500">No completed workouts yet. Finish a session to unlock history.</div>`;
        }
        history.sessions.forEach((session) => {
            const totalVolume = session.sets.reduce((sum, set) => sum + (set.weight_used || 0) * (set.actual_reps || 0), 0);
            const item = document.createElement("div");
            item.className = "rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4";
            item.innerHTML = `
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${session.day_name} • ${session.category}</p>
                        <h3 class="mt-2 text-lg font-bold text-slate-900">${session.workout_name}</h3>
                        <p class="mt-1 text-sm text-slate-500">${ui.formatDateTime(session.completed_at)}</p>
                    </div>
                    <div class="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                        <p class="text-xs text-slate-500">Volume</p>
                        <p class="text-lg font-extrabold text-slate-900">${Math.round(totalVolume)} kg</p>
                    </div>
                </div>
                <div class="mt-4 space-y-2">
                    ${session.sets
                        .slice(0, 4)
                        .map(
                            (set) => `
                        <div class="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm">
                            <span class="font-semibold text-slate-800">${set.exercise_name} · Set ${set.set_number}</span>
                            <span class="text-slate-500">${set.weight_used || 0} kg × ${set.actual_reps || set.target_reps}</span>
                        </div>
                    `
                        )
                        .join("")}
                </div>
            `;
            historyList.appendChild(item);
        });

        prList.innerHTML = "";
        if (!history.prs.length) {
            prList.innerHTML = `<div class="rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-500">No PRs yet. Lift consistently and they will appear here.</div>`;
        }
        history.prs.forEach((pr) => {
            const row = document.createElement("div");
            row.className = "flex items-center justify-between rounded-[1.4rem] bg-slate-50 px-4 py-4";
            row.innerHTML = `
                <div>
                    <p class="font-bold text-slate-900">${pr.exercise_name}</p>
                    <p class="mt-1 text-sm text-slate-500">Most reps: ${pr.most_reps || 0}</p>
                </div>
                <p class="text-xl font-extrabold text-slate-900">${pr.highest_weight || 0} kg</p>
            `;
            prList.appendChild(row);
        });
    }

    function renderSession(details) {
        const current = details.current_set;
        const badge = document.getElementById("live-status-badge");
        const progressBar = document.getElementById("live-progress-bar");
        const progressText = document.getElementById("live-progress-text");
        const panel = document.getElementById("set-panel");

        document.getElementById("live-workout-name").textContent = `${details.session.day_name} • ${details.session.category}`;
        progressBar.style.width = `${details.progress}%`;
        progressText.textContent = `${details.progress}% done`;

        const applyContent = () => {
            if (!current) {
                badge.textContent = "Completed";
                document.getElementById("exercise-name").textContent = "Workout complete";
                document.getElementById("set-label").textContent = "Done";
                document.getElementById("target-reps").textContent = "0";
                document.getElementById("set-complete-form").classList.add("hidden");
                return;
            }

            badge.textContent = "In session";
            document.getElementById("exercise-name").textContent = current.exercise_name;
            document.getElementById("set-label").textContent = String((current.set_order || 0) + 1);
            document.getElementById("target-reps").textContent = current.target_reps;
            document.getElementById("set-complete-form").classList.remove("hidden");
            document.querySelector('#set-complete-form input[name="actual_reps"]').value = current.target_reps;
        };

        // Animate a short transition between sets for a smooth UX
        if (panel) {
            // animate out
            panel.classList.add("set-panel-switching");
            // after the out animation, update content and animate in
            setTimeout(() => {
                applyContent();
                // next frame remove switching class so CSS transition animates entry
                requestAnimationFrame(() => panel.classList.remove("set-panel-switching"));
            }, 220);
        } else {
            applyContent();
        }
    }

    function addDayCard(container, values = {}) {
        const wrapper = document.createElement("section");
        wrapper.className = "builder-card space-y-4";
        wrapper.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-bold text-slate-900">Workout day</h3>
                <button type="button" class="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600" data-remove-day>Remove</button>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <label class="field">
                    <span>Day</span>
                    <select name="day_name">
                        ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                            .map(
                                (day) => `
                            <option value="${day}" ${values.day_name === day ? "selected" : ""}>${day}</option>
                        `
                            )
                            .join("")}
                    </select>
                </label>
                <label class="field">
                    <span>Category</span>
                    <input name="category" type="text" value="${values.category || ""}" placeholder="Chest">
                </label>
            </div>
            <div class="space-y-3" data-exercises></div>
            <button type="button" class="secondary-button w-full" data-add-exercise>Add exercise</button>
        `;
        container.appendChild(wrapper);

        const exercisesSlot = wrapper.querySelector("[data-exercises]");
        const addExerciseButton = wrapper.querySelector("[data-add-exercise]");
        addExerciseButton.addEventListener("click", () => addExerciseCard(exercisesSlot));
        wrapper.querySelector("[data-remove-day]").addEventListener("click", () => wrapper.remove());

        if (values.exercises?.length) {
            values.exercises.forEach((exercise) => addExerciseCard(exercisesSlot, exercise));
        } else {
            addExerciseCard(exercisesSlot);
        }
    }

    function addExerciseCard(container, values = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = "builder-subcard space-y-4";
        wrapper.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <p class="text-base font-bold text-slate-900">Exercise</p>
                <button type="button" class="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600" data-remove-exercise>Remove</button>
            </div>
            <label class="field">
                <span>Name</span>
                <input name="exercise_name" type="text" value="${values.name || ""}" placeholder="Bench Press">
            </label>
            <div class="space-y-3" data-sets></div>
            <button type="button" class="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700" data-add-set>Add set</button>
        `;
        container.appendChild(wrapper);

        const setsSlot = wrapper.querySelector("[data-sets]");
        wrapper.querySelector("[data-add-set]").addEventListener("click", () => addSetRow(setsSlot));
        wrapper.querySelector("[data-remove-exercise]").addEventListener("click", () => wrapper.remove());

        if (values.sets?.length) {
            values.sets.forEach((setItem) => addSetRow(setsSlot, setItem.target_reps));
        } else {
            addSetRow(setsSlot, 12);
            addSetRow(setsSlot, 10);
        }
    }

    function addSetRow(container, reps = "") {
        const row = document.createElement("div");
        row.className = "flex items-center gap-3";
        row.innerHTML = `
            <label class="field flex-1">
                <span>Target reps</span>
                <input name="target_reps" type="number" value="${reps}" min="1" placeholder="12">
            </label>
            <button type="button" class="mt-6 rounded-2xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700" data-remove-set>Remove</button>
        `;
        row.querySelector("[data-remove-set]").addEventListener("click", () => row.remove());
        container.appendChild(row);
    }

    function collectWorkoutForm(form) {
        const days = Array.from(document.querySelectorAll("#days-builder > section"))
            .map((dayCard) => ({
                day_name: dayCard.querySelector('[name="day_name"]').value,
                category: dayCard.querySelector('[name="category"]').value,
                exercises: Array.from(dayCard.querySelectorAll("[data-exercises] > div"))
                    .map((exerciseCard) => ({
                        name: exerciseCard.querySelector('[name="exercise_name"]').value,
                        sets: Array.from(exerciseCard.querySelectorAll('[name="target_reps"]'))
                            .map((input) => ({ target_reps: Number(input.value || 0) }))
                            .filter((setItem) => setItem.target_reps > 0),
                    }))
                    .filter((exercise) => exercise.name && exercise.sets.length),
            }))
            .filter((day) => day.category && day.exercises.length);

        return {
            name: form.elements.name.value,
            notes: form.elements.notes.value,
            days,
        };
    }

    function normalizeProfile(values) {
        return {
            name: values.name,
            age: values.age ? Number(values.age) : null,
            height: values.height ? Number(values.height) : null,
            weight: values.weight ? Number(values.weight) : null,
            goal: values.goal,
        };
    }

    function dayStatusText(day) {
        if (day.status === "AVAILABLE") return "Available today";
        if (day.status === "COMPLETED") return "Completed today";
        return "Locked until its scheduled day";
    }

    function lockIconMarkup() {
        return `
            <svg viewBox="0 0 20 20" aria-hidden="true" class="h-3.5 w-3.5">
                <path fill="currentColor" d="M6 8V6a4 4 0 1 1 8 0v2h1a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1h1Zm2 0h4V6a2 2 0 1 0-4 0v2Z"/>
            </svg>
        `;
    }
})();
