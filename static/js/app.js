'use strict';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const App = (() => {
  const ICONS = {
    clipboard: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 4h6a1 1 0 0 1 1 1v2H8V5a1 1 0 0 1 1-1z"/>
        <path d="M8 6h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>`,
    rest: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 10v4m12-4v4"/>
        <path d="M8 8v8m8-8v8"/>
        <path d="M4 11h2m12 0h2"/>
      </svg>`,
    checkCircle: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5"/>
        <path d="m8.5 12.5 2.6 2.6L15.8 10"/>
      </svg>`,
    circle: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5"/>
      </svg>`,
    medalGold: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="10.5" r="5.5"/>
        <path d="M9.2 4.5 7 2m7.8 2.5L17 2M12 8.1v4"/>
      </svg>`,
    medalSilver: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="10.5" r="5.5"/>
        <path d="M9.2 4.5 7 2m7.8 2.5L17 2M10.2 8.2h3.4l-2.8 3.8h2.4"/>
      </svg>`,
    medalBronze: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="10.5" r="5.5"/>
        <path d="M9.2 4.5 7 2m7.8 2.5L17 2M10.1 8.3h3a1.3 1.3 0 0 1 .2 2.6l-1.2.2 1.3.2a1.4 1.4 0 0 1-.4 2.8h-3"/>
      </svg>`,
    close: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18"/>
      </svg>`
  };
  let state = {
    plans: [],
    stats: {},
    profile: {},
    currentPlan: null,
    currentSession: null,
    sessionStartTime: null,
    timerInterval: null,
    workoutLogs: {},
  };

  async function init() {
    await Promise.all([loadProfile(), loadPlans(), loadStats()]);
    renderHome();
    hideSplash();
    checkUpdate();
  }

  function checkUpdate() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('New version available! Refresh to update.', 'success');
            }
          };
        };
      });
    }
  }

  function hideSplash() {
    setTimeout(() => {
      document.getElementById('splash').style.opacity = '0';
      document.getElementById('splash').style.transition = 'opacity 0.4s';
      setTimeout(() => {
        document.getElementById('splash').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
      }, 400);
    }, 1200);
  }

  function goTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    if (page === 'home') renderHome();
    if (page === 'plans') renderPlans();
    if (page === 'stats') renderStats();
    if (page === 'profile') renderProfile();
  }

  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    return res.json();
  }

  async function loadProfile() {
    state.profile = await api('/api/profile');
  }

  async function loadPlans() {
    state.plans = await api('/api/plans');
  }

  async function loadStats() {
    state.stats = await api('/api/stats');
  }

  function renderHome() {
    const now = new Date();
    const hour = now.getHours();
    const greetMap = [[5, 'morning'], [12, 'afternoon'], [17, 'evening'], [21, 'night']];
    let greeting = 'night';
    for (const [h, g] of greetMap) {
      if (hour >= h) greeting = g;
    }
    document.getElementById('greeting-time').textContent = greeting;
    const name = state.profile.name ? state.profile.name.split(' ')[0] : 'Athlete';
    document.getElementById('greeting-name').textContent = name;

    document.getElementById('home-streak').textContent = `${state.stats.streak || 0}d`;
    document.getElementById('home-sessions').textContent = state.stats.total_sessions || 0;
    const weekDates = state.stats.week_dates || [];
    document.getElementById('home-week').textContent = `${weekDates.length}/7`;

    renderWeekGrid(weekDates);
    renderTodayCard();

    const todayIdx = (now.getDay() + 6) % 7;
    document.getElementById('today-label').textContent = DAY_NAMES[todayIdx];
  }

  function renderWeekGrid(completedDates) {
    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - todayIdx);
    weekStart.setHours(0, 0, 0, 0);

    const container = document.getElementById('week-grid');
    container.innerHTML = '';

    const planDays = new Set();
    for (const plan of state.plans) {
      for (const d of plan.weekdays) planDays.add(Number(d));
    }

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isToday = i === todayIdx;
      const isCompleted = completedDates.includes(dateStr);
      const hasPlan = planDays.has(i);

      const el = document.createElement('div');
      el.className = 'week-day';
      if (hasPlan) el.classList.add('has-workout');
      if (isCompleted) el.classList.add('completed');
      if (isToday) el.classList.add('today');
      el.innerHTML = `
        <span class="wd-name">${DAYS[i]}</span>
        <span class="wd-dot">${isCompleted ? '&#10003;' : ''}</span>
      `;
      container.appendChild(el);
    }
  }

  function renderTodayCard() {
    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7;
    const container = document.getElementById('today-workout');
    const todayPlans = state.plans.filter(p => p.weekdays.map(Number).includes(todayIdx));

    if (!todayPlans.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon" aria-hidden="true">${ICONS.rest}</span>
          <p>Rest day - no workout planned</p>
          <button class="btn-sm" onclick="App.goTo('plans')">Create Plan</button>
        </div>`;
      return;
    }

    const plan = todayPlans[0];
    const exCount = plan.exercises.length;
    container.innerHTML = `
      <div class="workout-preview">
        <div class="workout-preview-name">${escHtml(plan.name)}</div>
        <div class="workout-preview-meta">${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
        ${plan.notes ? `<p style="font-size:13px;color:var(--muted);margin-bottom:12px;">${escHtml(plan.notes)}</p>` : ''}
        <div class="workout-preview-exercises">
          ${plan.exercises.slice(0, 4).map(ex => `
            <div class="wp-exercise">
              <span class="wp-exercise-name">${escHtml(ex.name)}</span>
              <span class="wp-exercise-meta">${ex.sets}&times;${ex.reps}${ex.weight ? ' &middot; ' + ex.weight + 'kg' : ''}</span>
            </div>`).join('')}
          ${exCount > 4 ? `<div style="font-size:12px;color:var(--muted);text-align:center;">+${exCount - 4} more</div>` : ''}
        </div>
        <button class="btn-start-workout" onclick="App.startWorkout(${plan.id})">
          Start Workout &rarr;
        </button>
      </div>`;
  }

  function renderPlans() {
    const container = document.getElementById('plans-list');
    if (!state.plans.length) {
      container.innerHTML = `
        <div class="empty-plans">
          <span class="empty-state-icon" aria-hidden="true">${ICONS.clipboard}</span>
          <p>No plans yet. Create your first workout plan!</p>
        </div>`;
      return;
    }

    container.innerHTML = state.plans.map(plan => {
      const dayNames = plan.weekdays.map(Number).sort().map(d => DAYS[d]);
      return `
        <div class="plan-card">
          <div class="plan-card-top">
            <div class="plan-card-name">${escHtml(plan.name)}</div>
            <div class="plan-card-actions">
              <button class="btn-card-action" onclick="App.editPlan(${plan.id})" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-card-action danger" onclick="App.deletePlan(${plan.id})" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          </div>
          <div class="plan-card-days">${dayNames.map(d => `<span class="day-tag">${d}</span>`).join('')}</div>
          <div class="plan-card-exercises">${plan.exercises.length} exercise${plan.exercises.length !== 1 ? 's' : ''}: ${plan.exercises.slice(0, 3).map(e => e.name).join(', ')}${plan.exercises.length > 3 ? '...' : ''}</div>
          ${plan.notes ? `<div class="plan-card-notes">"${escHtml(plan.notes)}"</div>` : ''}
        </div>`;
    }).join('');
  }

  function openPlanForm(planId = null) {
    state.currentPlan = planId ? state.plans.find(p => p.id === planId) : null;
    document.getElementById('plan-modal-title').textContent = planId ? 'Edit Plan' : 'New Plan';
    document.getElementById('plan-name').value = state.currentPlan?.name || '';
    document.getElementById('plan-notes').value = state.currentPlan?.notes || '';

    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.classList.toggle(
        'selected',
        state.currentPlan?.weekdays?.map(Number).includes(Number(btn.dataset.day)) || false
      );
    });

    const exList = document.getElementById('exercise-list');
    exList.innerHTML = '';
    const exercises = state.currentPlan?.exercises || [];
    if (exercises.length) {
      exercises.forEach(ex => addExerciseRow(ex));
    } else {
      addExerciseRow();
    }
    document.getElementById('modal-plan').classList.remove('hidden');
  }

  function closePlanForm() {
    document.getElementById('modal-plan').classList.add('hidden');
    state.currentPlan = null;
  }

  function editPlan(id) {
    openPlanForm(id);
  }

  function addExerciseRow(ex = null) {
    const row = document.createElement('div');
    row.className = 'exercise-row';
    row.innerHTML = `
      <div class="ex-row-top">
        <input type="text" placeholder="Exercise name" class="ex-name" value="${ex ? escHtml(ex.name) : ''}">
        <button type="button" class="btn-remove-ex" aria-label="Remove exercise" onclick="this.closest('.exercise-row').remove()">${ICONS.close}</button>
      </div>
      <div class="ex-row-bottom">
        <div>
          <label>Sets</label>
          <input type="number" class="ex-sets" min="1" max="20" value="${ex?.sets || 3}">
        </div>
        <div>
          <label>Reps</label>
          <input type="number" class="ex-reps" min="1" max="100" value="${ex?.reps || 10}">
        </div>
        <div>
          <label>Weight (kg)</label>
          <input type="number" class="ex-weight" min="0" step="0.5" value="${ex?.weight || ''}">
        </div>
      </div>`;
    document.getElementById('exercise-list').appendChild(row);
  }

  async function savePlan() {
    const name = document.getElementById('plan-name').value.trim();
    if (!name) {
      showToast('Plan name required', 'error');
      return;
    }
    const weekdays = [...document.querySelectorAll('.day-btn.selected')].map(b => Number(b.dataset.day));
    const exercises = [...document.querySelectorAll('.exercise-row')].map(row => ({
      name: row.querySelector('.ex-name').value.trim(),
      sets: parseInt(row.querySelector('.ex-sets').value) || 3,
      reps: parseInt(row.querySelector('.ex-reps').value) || 10,
      weight: parseFloat(row.querySelector('.ex-weight').value) || 0
    })).filter(e => e.name);
    if (!exercises.length) {
      showToast('Add at least one exercise', 'error');
      return;
    }

    const payload = {
      name,
      notes: document.getElementById('plan-notes').value.trim(),
      weekdays,
      exercises
    };
    if (state.currentPlan) {
      await api(`/api/plans/${state.currentPlan.id}`, 'PUT', payload);
    } else {
      await api('/api/plans', 'POST', payload);
    }
    await loadPlans();
    closePlanForm();
    renderPlans();
    renderHome();
    showToast(state.currentPlan ? 'Plan updated!' : 'Plan created!', 'success');
  }

  async function deletePlan(id) {
    if (!confirm('Delete this plan?')) return;
    await api(`/api/plans/${id}`, 'DELETE');
    await loadPlans();
    renderPlans();
    renderHome();
    showToast('Plan deleted');
  }

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
  });

  async function startWorkout(planId) {
    const plan = state.plans.find(p => p.id === planId);
    if (!plan) return;
    const res = await api('/api/sessions', 'POST', { plan_id: planId });
    state.currentSession = { ...res, plan };
    state.workoutLogs = {};
    state.sessionStartTime = Date.now();
    renderWorkoutModal(plan, res.id);
    document.getElementById('modal-workout').classList.remove('hidden');
    startTimer();
  }

  function renderWorkoutModal(plan, sessionId) {
    document.getElementById('workout-modal-title').textContent = plan.name;
    const body = document.getElementById('workout-body');
    body.innerHTML = plan.exercises.map(ex => {
      const sets = Array.from({ length: ex.sets }, (_, i) => i + 1);
      return `
        <div class="workout-exercise-card" id="wec-${ex.id}">
          <div class="wec-header">
            <span class="wec-name">${escHtml(ex.name)}</span>
            <span class="wec-badge" id="wec-badge-${ex.id}">0/${ex.sets}</span>
          </div>
          ${sets.map(s => `
            <div class="set-row" id="set-row-${ex.id}-${s}">
              <div class="set-num">${s}</div>
              <div class="set-input-wrap">
                <label>Reps</label>
                <input type="number" id="reps-${ex.id}-${s}" value="${ex.reps}" min="0" max="999"
                  onchange="App.updateSetLog(${sessionId}, ${ex.id}, ${s})">
              </div>
              <div class="set-input-wrap">
                <label>Weight kg</label>
                <input type="number" id="weight-${ex.id}-${s}" value="${ex.weight || ''}" min="0" step="0.5"
                  onchange="App.updateSetLog(${sessionId}, ${ex.id}, ${s})">
              </div>
              <button class="btn-check" id="check-${ex.id}-${s}"
                onclick="App.toggleSet(${sessionId}, ${ex.id}, ${s}, ${ex.sets})">
                ${ICONS.circle}
              </button>
            </div>`).join('')}
        </div>`;
    }).join('');
  }

  function updateSetLog(sessionId, exId, setNum) {
    if (!state.workoutLogs[exId]) state.workoutLogs[exId] = {};
    const reps = parseInt(document.getElementById(`reps-${exId}-${setNum}`).value) || 0;
    const weight = parseFloat(document.getElementById(`weight-${exId}-${setNum}`).value) || 0;
    if (!state.workoutLogs[exId][setNum]) state.workoutLogs[exId][setNum] = {};
    state.workoutLogs[exId][setNum].reps = reps;
    state.workoutLogs[exId][setNum].weight = weight;
  }

  async function toggleSet(sessionId, exId, setNum, totalSets) {
    updateSetLog(sessionId, exId, setNum);
    const btn = document.getElementById(`check-${exId}-${setNum}`);
    const row = document.getElementById(`set-row-${exId}-${setNum}`);
    const isChecked = btn.classList.toggle('checked');
    row.classList.toggle('set-done', isChecked);
    btn.innerHTML = isChecked ? ICONS.checkCircle : ICONS.circle;

    const reps = parseInt(document.getElementById(`reps-${exId}-${setNum}`).value) || 0;
    const weight = parseFloat(document.getElementById(`weight-${exId}-${setNum}`).value) || 0;
    if (!state.workoutLogs[exId]) state.workoutLogs[exId] = {};
    if (!state.workoutLogs[exId][setNum]) state.workoutLogs[exId][setNum] = {};
    state.workoutLogs[exId][setNum] = { reps, weight, completed: isChecked ? 1 : 0 };

    await api('/api/set_logs', 'POST', {
      session_id: sessionId,
      exercise_id: exId,
      set_num: setNum,
      reps,
      weight,
      completed: isChecked ? 1 : 0
    });

    const done = Object.values(state.workoutLogs[exId] || {}).filter(s => s.completed).length;
    const badge = document.getElementById(`wec-badge-${exId}`);
    badge.textContent = `${done}/${totalSets}`;
    badge.classList.toggle('done', done >= totalSets);
    if (done >= totalSets) {
      document.getElementById(`wec-${exId}`).classList.add('done');
    } else {
      document.getElementById(`wec-${exId}`).classList.remove('done');
    }
  }

  function startTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000);
      const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const s = (elapsed % 60).toString().padStart(2, '0');
      const el = document.getElementById('workout-timer');
      if (el) el.textContent = `${m}:${s}`;
    }, 1000);
  }

  async function finishWorkout() {
    if (!state.currentSession) return;
    const duration = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    await api(`/api/sessions/${state.currentSession.id}`, 'PUT', { completed: 1, duration });
    clearInterval(state.timerInterval);
    document.getElementById('modal-workout').classList.add('hidden');
    await loadStats();
    renderHome();
    state.currentSession = null;
    state.workoutLogs = {};
    showToast('Workout complete!', 'success');
  }

  function renderStats() {
    document.getElementById('stat-total').textContent = state.stats.total_sessions || 0;
    document.getElementById('stat-streak').textContent = `${state.stats.streak || 0}d`;
    renderChart();
    renderPRs();
  }

  function renderChart() {
    const canvas = document.getElementById('activity-chart');
    const ctx = canvas.getContext('2d');
    const history = state.stats.history || [];
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth || 340;
    const h = 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...history.map(d => d.count), 1);
    const pad = { l: 24, r: 16, t: 16, b: 32 };
    const bw = history.length ? (w - pad.l - pad.r) / history.length : 0;

    history.forEach((d, i) => {
      const barH = ((d.count / max) * (h - pad.t - pad.b)) || 4;
      const x = pad.l + i * bw + bw * 0.15;
      const bWidth = bw * 0.7;
      const y = h - pad.b - barH;

      const grad = ctx.createLinearGradient(0, y, 0, h - pad.b);
      grad.addColorStop(0, d.count > 0 ? '#2CB8D0' : 'rgba(168,172,184,0.12)');
      grad.addColorStop(1, d.count > 0 ? 'rgba(29,147,186,0.58)' : 'rgba(168,172,184,0.04)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, bWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = 'rgba(168,172,184,0.72)';
      ctx.font = '9px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.week.split(' ')[0], x + bWidth / 2, h - pad.b + 14);
    });
  }

  function renderPRs() {
    const container = document.getElementById('prs-list');
    const prs = state.stats.prs || [];
    if (!prs.length) {
      container.innerHTML = '<div class="no-prs">Complete workouts to see your PRs</div>';
      return;
    }
    container.innerHTML = prs.map((pr, i) => `
      <div class="pr-item">
        <span class="pr-medal ${['gold','silver','bronze'][i] || 'gold'}">${[ICONS.medalGold, ICONS.medalSilver, ICONS.medalBronze][i] || ICONS.medalGold}</span>
        <span class="pr-name">${escHtml(pr.name)}</span>
        <div class="pr-vals">
          ${pr.pr_weight ? `<div><div class="pr-val">${pr.pr_weight}kg</div><div class="pr-sub">Weight</div></div>` : ''}
          ${pr.pr_reps ? `<div><div class="pr-val">${pr.pr_reps}</div><div class="pr-sub">Reps</div></div>` : ''}
        </div>
      </div>`).join('');
  }

  function renderProfile() {
    const p = state.profile;
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-age').value = p.age || '';
    document.getElementById('p-weight').value = p.weight || '';
    document.getElementById('p-height').value = p.height || '';
    document.getElementById('p-goal').value = p.goal || '';
    document.getElementById('profile-display-name').textContent = p.name || 'Set up your profile';
    document.getElementById('profile-display-goal').textContent = p.goal || '-';
  }

  async function saveProfile(e) {
    e.preventDefault();
    const data = {
      name: document.getElementById('p-name').value.trim(),
      age: parseInt(document.getElementById('p-age').value) || null,
      weight: parseFloat(document.getElementById('p-weight').value) || null,
      height: parseFloat(document.getElementById('p-height').value) || null,
      goal: document.getElementById('p-goal').value,
    };
    await api('/api/profile', 'POST', data);
    await loadProfile();
    renderProfile();
    renderHome();
    showToast('Profile saved!', 'success');
  }

  async function resetData() {
    if (!confirm('This will delete ALL your data. Are you sure?')) return;
    if (!confirm('This cannot be undone. Confirm?')) return;
    await api('/api/reset', 'POST');
    state.plans = [];
    state.stats = {};
    state.profile = {};
    renderHome();
    renderPlans();
    renderProfile();
    renderStats();
    showToast('All data cleared');
  }

  async function exportData() {
    const data = await api('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liftlog-export.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!', 'success');
  }

  let toastTimeout;
  function showToast(msg, type = '') {
    clearTimeout(toastTimeout);
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    toastTimeout = setTimeout(() => t.classList.add('hidden'), 2800);
  }

  function initOffline() {
    const update = () => {
      const existing = document.querySelector('.offline-banner');
      if (!navigator.onLine) {
        if (!existing) {
          const b = document.createElement('div');
          b.className = 'offline-banner';
          b.textContent = 'OFFLINE MODE';
          document.getElementById('app').prepend(b);
        }
      } else {
        existing?.remove();
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const hr = document.getElementById('header-right');
    hr.innerHTML = `<button onclick="App.installPWA()" style="font-size:12px;color:var(--primary);font-weight:700;background:rgba(44,184,208,0.12);padding:7px 12px;border-radius:999px;border:1px solid var(--border)">Install App</button>`;
  });

  async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('header-right').innerHTML = '';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    initOffline();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }

  return {
    goTo,
    openPlanForm,
    closePlanForm,
    editPlan,
    addExerciseRow,
    savePlan,
    deletePlan,
    startWorkout,
    finishWorkout,
    toggleSet,
    updateSetLog,
    saveProfile,
    resetData,
    exportData,
    installPWA
  };
})();
