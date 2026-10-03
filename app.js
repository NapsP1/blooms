(() => {
  'use strict';

  // ---------- Helpers ----------
  const STORE_KEY = 'bloom:v1';
  const TAB_KEY = 'bloom:tab';
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7)); // weeks start Monday
  const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const DROP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c-.3 0-.6.2-.8.4C9 6 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.6 15 6 12.8 2.9c-.2-.2-.5-.4-.8-.4z"/></svg>';

  const HABIT_EMOJI = ['✨', '🧘‍♀️', '📖', '🧴', '💊', '🥗', '😴', '🏃‍♀️', '📝', '🙏', '📵', '🌿', '💜', '🦷'];
  const WORKOUT_TYPES = [
    { name: 'Walk', emoji: '🚶‍♀️' },
    { name: 'Run', emoji: '🏃‍♀️' },
    { name: 'Strength', emoji: '🏋️‍♀️' },
    { name: 'Yoga', emoji: '🧘‍♀️' },
    { name: 'Pilates', emoji: '🤸‍♀️' },
    { name: 'Cycling', emoji: '🚴‍♀️' },
    { name: 'Dance', emoji: '💃' },
    { name: 'Other', emoji: '✨' },
  ];
  const workoutEmoji = (type) => (WORKOUT_TYPES.find((t) => t.name === type) || WORKOUT_TYPES[7]).emoji;

  // ---------- Data ----------
  function defaults() {
    return {
      habits: [
        { id: uid(), name: 'Morning stretch', emoji: '🧘‍♀️' },
        { id: uid(), name: 'Read 10 pages', emoji: '📖' },
        { id: uid(), name: 'Skincare routine', emoji: '🧴' },
        { id: uid(), name: 'Take vitamins', emoji: '💊' },
      ],
      habitLog: {},   // { 'YYYY-MM-DD': [habitId, ...] }
      water: {},      // { 'YYYY-MM-DD': glasses }
      waterGoal: 8,
      goals: [],      // { id, text, period: 'week'|'month', key, done }
      workouts: [],   // { id, date, type, minutes, note, created }
      budgets: [],    // { id, name, emoji, limit, period: 'week'|'month' }
      txns: [],       // { id, type: 'expense'|'income', amount, budgetId, note, date, created }
      savings: [],    // { id, name, emoji, target, deadline, deposits: [{ id, amount, date }] }
      favAff: [],     // saved affirmation texts (with {name} placeholders)
      bg: { type: 'floral', color: 'blush', veil: 0.45 }, // background: 'floral' | 'solid' | 'photo'
      theme: 'auto',  // 'auto' follows the phone, or 'light' / 'dark'
      medals: {},     // { 'habit-0': 'YYYY-MM-DD', ... } medal id -> date earned (kept forever)
      routines: { morning: [], night: [] }, // steps: { id, name, emoji, tiny }
      routineLog: {}, // { 'YYYY-MM-DD': { morning: { steps: { stepId: 'full'|'tiny' }, complete } } }
      dismissedTips: [], // habit-stacking ideas she tapped "Not for me" on
      // name: undefined until she answers the "what should we call you" prompt ('' = skipped)
      // affSeed: random number that gives each person her own affirmation order
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* storage unavailable: start fresh */ }
    return defaults();
  }

  // Writes to this device only (used when applying progress downloaded from the cloud).
  function writeLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // Saves on this device, and queues an online save when she's signed in.
  function save() {
    writeLocal();
    if (cloudOn() && session) {
      syncMeta.dirty = true;
      storeSyncMeta();
      schedulePush();
    }
  }

  // Cloud account state (see "Cloud accounts" below). Declared early because save() uses it.
  const CLOUD = window.BLOOM_CLOUD || {};
  const AUTH_KEY = 'bloom:auth';
  const SYNC_KEY = 'bloom:sync';
  let session = null;   // { access_token, refresh_token, expires_at, user: { id, email, meta } }
  let syncMeta = { dirty: false, syncedAt: null };
  let pushTimer = null;
  try { session = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { /* ignore */ }
  try { syncMeta = Object.assign(syncMeta, JSON.parse(localStorage.getItem(SYNC_KEY))); } catch (e) { /* ignore */ }

  let state = load();
  if (!state.affSeed) { state.affSeed = Math.floor(Math.random() * 2147483646) + 1; save(); }
  const ui = {
    tab: 'today', edit: {}, goalPeriod: 'week', weekOffset: 0, wType: 'Walk',
    moneyPeriod: 'week', txType: 'expense', openDeposit: null, history: {},
    showFavs: false, editName: false, showProfile: false, prevTab: 'today', showFeedback: false,
  };
  try { ui.tab = localStorage.getItem(TAB_KEY) || 'today'; } catch (e) { /* ignore */ }

  function streak(id) {
    let d = new Date();
    if (!(state.habitLog[dkey(d)] || []).includes(id)) d = addDays(d, -1);
    let n = 0;
    while ((state.habitLog[dkey(d)] || []).includes(id)) { n++; d = addDays(d, -1); }
    return n;
  }

  const doneCount = (k) => {
    const log = new Set(state.habitLog[k] || []);
    return state.habits.filter((h) => log.has(h.id)).length;
  };

  const editBtn = (section) =>
    `<button class="link" data-click="edit" data-id="${section}">${ui.edit[section] ? 'Done' : 'Edit'}</button>`;

  // ---------- Affirmations ----------
  const AFF_THEMES = { self: 'Self-love', body: 'Health', money: 'Money', goals: 'Goals' };
  const AFFIRMATIONS = Object.entries(window.BLOOM_AFFIRMATIONS || {})
    .flatMap(([theme, list]) => list.map((text) => ({ theme, text })));

  // Small seeded random generator so each person's shuffle is stable from day to day.
  function seededRandom(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let affOrder = null;
  function affirmationFor(now) {
    if (!AFFIRMATIONS.length) return null;
    if (!affOrder) {
      const rnd = seededRandom(state.affSeed);
      affOrder = range(AFFIRMATIONS.length);
      for (let i = affOrder.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [affOrder[i], affOrder[j]] = [affOrder[j], affOrder[i]];
      }
    }
    const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
    return AFFIRMATIONS[affOrder[day % affOrder.length]];
  }

  function personalize(text) {
    const name = (state.name || '').trim();
    if (name) return text.split('{name}').join(name);
    return text.replace(/^\{name\}, (\w)/, (m, c) => c.toUpperCase()).replace(/,? \{name\}/g, '');
  }

  function affirmationCard(now) {
    if (state.name === undefined || ui.editName) {
      return `
        <section class="card aff">
          <p class="aff-label">${state.name === undefined ? 'Welcome 🌸' : 'Your name'}</p>
          <h2 class="aff-ask">What should we call you?</h2>
          <p class="small muted">We'll use your first name in some of your daily affirmations.</p>
          <form class="add" data-submit="save-name">
            <input name="first" placeholder="First name" maxlength="30" value="${esc(state.name || '')}" autocomplete="given-name" aria-label="First name">
            <button class="btn">Save</button>
          </form>
          <button class="link" data-click="skip-name">${state.name === undefined ? 'Skip for now' : 'Cancel'}</button>
        </section>`;
    }
    const aff = affirmationFor(now);
    if (!aff) return '';
    const fav = state.favAff.includes(aff.text);
    const favs = state.favAff.map((t, i) => `<div class="fav">
        <p>${esc(personalize(t))}</p>
        <button class="heart on" data-click="unfav" data-id="${i}" aria-label="Remove from favorites">♥</button>
      </div>`).join('');
    return `
      <section class="card aff">
        <div class="aff-top">
          <p class="aff-label">Today's affirmation · ${AFF_THEMES[aff.theme]}</p>
          <button class="heart ${fav ? 'on' : ''}" data-click="fav-aff" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Save to favorites'}">${fav ? '♥' : '♡'}</button>
        </div>
        <p class="aff-text">${esc(personalize(aff.text))}</p>
        <div class="aff-foot">
          <button class="link" data-click="toggle-favs">${ui.showFavs ? 'Hide favorites' : `♥ Favorites (${state.favAff.length})`}</button>
          <button class="link" data-click="edit-name">${state.name ? 'Change name' : 'Add your name'}</button>
        </div>
        ${ui.showFavs ? `<div class="favs">${favs || '<p class="empty">Tap ♡ on an affirmation to save it here.</p>'}</div>` : ''}
      </section>`;
  }

  // ---------- Today ----------
  function viewToday(now) {
    const k = dkey(now);
    const done = new Set(state.habitLog[k] || []);
    const total = state.habits.length;
    const n = doneCount(k);
    const pct = total ? Math.round((n / total) * 100) : 0;
    const msg = total === 0 ? 'Add a habit below to get started.'
      : n === total ? 'Every habit done today. Amazing! 🌸'
      : n === 0 ? 'A fresh day. Start with one small win.'
      : `${total - n} to go. You've got this.`;
    const editing = ui.edit.habits;

    const rows = state.habits.map((h) => {
      if (editing) {
        return `<div class="item"><span class="emoji">${esc(h.emoji)}</span><span class="hname">${esc(h.name)}</span>
          <button class="del" data-click="del-habit" data-id="${h.id}" aria-label="Delete ${esc(h.name)}">×</button></div>`;
      }
      const isDone = done.has(h.id);
      const s = streak(h.id);
      return `<button class="item ${isDone ? 'done' : ''}" data-click="toggle-habit" data-id="${h.id}" aria-pressed="${isDone}">
        <span class="check">${CHECK}</span><span class="emoji">${esc(h.emoji)}</span>
        <span class="hname">${esc(h.name)}</span>${s > 0 ? `<span class="streak">🔥 ${s}</span>` : ''}</button>`;
    }).join('');

    return `
      ${affirmationCard(now)}

      ${routineTodayCard(now)}

      <section class="card hero">
        <p class="hero-num"><strong>${n}</strong> of ${total} habits done</p>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <p class="small muted">${msg}</p>
      </section>

      <section class="card">
        <div class="card-h"><h2>Daily habits</h2>${total ? editBtn('habits') : ''}</div>
        <div class="list">${rows || '<p class="empty">No habits yet. Add your first one below.</p>'}</div>
        <form class="add" data-submit="add-habit">
          <select name="emoji" aria-label="Habit icon">${HABIT_EMOJI.map((e) => `<option>${e}</option>`).join('')}</select>
          <input name="habit" placeholder="New habit…" maxlength="60" autocomplete="off" aria-label="New habit name">
          <button class="btn">Add</button>
        </form>
      </section>

      ${waterCard(k)}`;
  }

  function waterCard(k) {
    const glasses = state.water[k] || 0;
    const goal = state.waterGoal;
    const shown = Math.min(Math.max(goal, glasses), 24);
    return `
      <section class="card">
        <div class="card-h"><h2>Water</h2><span class="pill">${glasses} / ${goal} glasses</span></div>
        <div class="drops" aria-hidden="true">${range(shown).map((i) => `<span class="drop ${i < glasses ? 'on' : ''}">${DROP}</span>`).join('')}</div>
        <div class="water-row">
          <button class="round" data-click="water" data-id="-1" aria-label="Remove a glass" ${glasses ? '' : 'disabled'}>−</button>
          <button class="btn water" data-click="water" data-id="1">+ Add a glass</button>
        </div>
        ${glasses >= goal ? '<p class="note">Goal reached. Nicely hydrated 💧</p>' : ''}
        <div class="goal-adj">Daily goal
          <button class="mini" data-click="wgoal" data-id="-1" aria-label="Lower daily water goal">−</button>
          <b>${goal}</b>
          <button class="mini" data-click="wgoal" data-id="1" aria-label="Raise daily water goal">+</button>
        </div>
      </section>`;
  }

  // ---------- Goals ----------
  const goalKey = (period, d) => (period === 'week' ? dkey(startOfWeek(d)) : monthKey(d));
  const prevGoalKey = (period, d) =>
    period === 'week' ? dkey(addDays(startOfWeek(d), -7)) : monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));

  function carryOver(period, now) {
    const current = state.goals.filter((g) => g.period === period && g.key === goalKey(period, now)).map((g) => g.text);
    return state.goals.filter((g) => g.period === period && g.key === prevGoalKey(period, now) && !g.done && !current.includes(g.text));
  }

  function viewGoals(now) {
    const p = ui.goalPeriod;
    const key = goalKey(p, now);
    const list = state.goals.filter((g) => g.period === p && g.key === key);
    const n = list.filter((g) => g.done).length;
    const pct = list.length ? Math.round((n / list.length) * 100) : 0;
    const editing = ui.edit.goals;
    const label = p === 'week'
      ? `${fmt(startOfWeek(now), { month: 'short', day: 'numeric' })} – ${fmt(addDays(startOfWeek(now), 6), { month: 'short', day: 'numeric' })}`
      : fmt(now, { month: 'long', year: 'numeric' });
    const leftover = carryOver(p, now);
    const word = p === 'week' ? 'week' : 'month';

    const rows = list.map((g) => editing
      ? `<div class="item goal"><span class="hname">${esc(g.text)}</span>
          <button class="del" data-click="del-goal" data-id="${g.id}" aria-label="Delete goal">×</button></div>`
      : `<button class="item goal ${g.done ? 'done' : ''}" data-click="toggle-goal" data-id="${g.id}" aria-pressed="${g.done}">
          <span class="check">${CHECK}</span><span class="hname">${esc(g.text)}</span></button>`
    ).join('');

    return `
      <div class="seg" role="group" aria-label="Goal period">
        <button data-click="period" data-id="week" aria-pressed="${p === 'week'}">This week</button>
        <button data-click="period" data-id="month" aria-pressed="${p === 'month'}">This month</button>
      </div>

      ${leftover.length ? `<button class="btn soft" data-click="carry">Bring over ${leftover.length} unfinished goal${leftover.length > 1 ? 's' : ''} from last ${word}</button>` : ''}

      <section class="card">
        <div class="card-h">
          <div><h2>${p === 'week' ? 'Weekly' : 'Monthly'} goals</h2><p class="small muted">${label}</p></div>
          ${list.length ? editBtn('goals') : ''}
        </div>
        ${list.length ? `<div class="progress-line"><div class="bar mocha"><span style="width:${pct}%"></span></div><span class="small muted">${n}/${list.length}</span></div>` : ''}
        <div class="list">${rows || `<p class="empty">No goals for this ${word} yet. What do you want to make happen?</p>`}</div>
        <form class="add" data-submit="add-goal">
          <input name="goal" placeholder="${p === 'week' ? 'e.g. Meal prep on Sunday' : 'e.g. Run my first 5K'}" maxlength="80" autocomplete="off" aria-label="New goal">
          <button class="btn mocha">Add</button>
        </form>
      </section>`;
  }

  // ---------- Workouts ----------
  function viewWorkouts(now) {
    const ws = startOfWeek(now);
    const weekKeys = new Set(range(7).map((i) => dkey(addDays(ws, i))));
    const thisWeek = state.workouts.filter((w) => weekKeys.has(w.date));
    const minutes = thisWeek.reduce((s, w) => s + w.minutes, 0);
    const activeDays = new Set(thisWeek.map((w) => w.date)).size;
    const editing = ui.edit.workouts;

    const recent = [...state.workouts]
      .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)
      .slice(0, 40);
    let lastDate = '';
    const history = recent.map((w) => {
      const header = w.date !== lastDate ? `<div class="day-h">${dayLabel(w.date, now)}</div>` : '';
      lastDate = w.date;
      return `${header}<div class="wk">
        <span class="wk-ico">${workoutEmoji(w.type)}</span>
        <div class="wk-body"><b>${esc(w.type)}</b>${w.note ? `<span class="small muted">${esc(w.note)}</span>` : ''}</div>
        <span class="wk-min">${w.minutes} min</span>
        ${editing ? `<button class="del" data-click="del-workout" data-id="${w.id}" aria-label="Delete workout">×</button>` : ''}
      </div>`;
    }).join('');

    return `
      <section class="card">
        <div class="card-h"><h2>This week</h2></div>
        <div class="stats">
          <div class="stat"><b>${minutes}</b><span>minutes</span></div>
          <div class="stat"><b>${thisWeek.length}</b><span>workouts</span></div>
          <div class="stat"><b>${activeDays}</b><span>active days</span></div>
        </div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Log a workout</h2></div>
        <form data-submit="log-workout">
          <div class="chips" role="group" aria-label="Workout type">
            ${WORKOUT_TYPES.map((t) => `<button type="button" class="chip" data-click="wtype" data-id="${t.name}" aria-pressed="${ui.wType === t.name}">${t.emoji} ${t.name}</button>`).join('')}
          </div>
          <div class="form-row">
            <label class="fld"><span>Minutes</span><input name="minutes" type="number" inputmode="numeric" min="1" max="600" placeholder="30" required></label>
            <label class="fld"><span>Date</span><input name="date" type="date" value="${dkey(now)}" max="${dkey(now)}" required></label>
          </div>
          <label class="fld"><span>Note (optional)</span><input name="note" maxlength="80" placeholder="e.g. Leg day, felt strong" autocomplete="off"></label>
          <button class="btn block mocha">Log workout</button>
        </form>
      </section>

      <section class="card">
        <div class="card-h"><h2>History</h2>${recent.length ? editBtn('workouts') : ''}</div>
        ${history || '<p class="empty">Your workouts will show up here.</p>'}
      </section>`;
  }

  function dayLabel(k, now) {
    if (k === dkey(now)) return 'Today';
    if (k === dkey(addDays(now, -1))) return 'Yesterday';
    return fmt(parseKey(k), { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ---------- Week overview ----------
  function viewWeek(now) {
    const start = addDays(startOfWeek(now), ui.weekOffset * 7);
    const days = range(7).map((i) => addDays(start, i));
    const keys = days.map(dkey);
    const todayK = dkey(now);
    const elapsed = keys.filter((k) => k <= todayK);
    const label = ui.weekOffset === 0 ? 'This week'
      : `${fmt(days[0], { month: 'short', day: 'numeric' })} – ${fmt(days[6], { month: 'short', day: 'numeric' })}`;

    const possible = state.habits.length * elapsed.length;
    const habitPct = possible ? Math.round((elapsed.reduce((s, k) => s + doneCount(k), 0) / possible) * 100) : 0;
    const waterAvg = elapsed.length ? (elapsed.reduce((s, k) => s + (state.water[k] || 0), 0) / elapsed.length) : 0;
    const minsFor = (k) => state.workouts.filter((w) => w.date === k).reduce((s, w) => s + w.minutes, 0);
    const totalMins = keys.reduce((s, k) => s + minsFor(k), 0);

    const head = `<span></span>${days.map((d, i) => `<span class="hd ${keys[i] === todayK ? 'today' : ''}">${fmt(d, { weekday: 'narrow' })}</span>`).join('')}`;
    const grid = state.habits.map((h) => `
      <span class="gname">${esc(h.emoji)} ${esc(h.name)}</span>
      ${keys.map((k) => `<span class="dot ${(state.habitLog[k] || []).includes(h.id) ? 'on' : ''} ${k > todayK ? 'future' : ''}"></span>`).join('')}`
    ).join('') + Object.keys(ROUTINES).filter((r) => state.routines[r].length).map((r) => `
      <span class="gname">${ROUTINES[r].icon} ${ROUTINES[r].label} routine</span>
      ${keys.map((k) => `<span class="dot ${routineGet(r, k).complete ? 'on' : ''} ${k > todayK ? 'future' : ''}"></span>`).join('')}`
    ).join('');

    const dayRows = days.map((d, i) => {
      const k = keys[i];
      const total = state.habits.length;
      const pct = total ? Math.round((doneCount(k) / total) * 100) : 0;
      const mins = minsFor(k);
      return `<div class="day ${k > todayK ? 'future' : ''} ${k === todayK ? 'is-today' : ''}">
        <b>${fmt(d, { weekday: 'short' })} ${d.getDate()}</b>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <span>💧 ${state.water[k] || 0}</span>
        <span>${mins ? `${mins}m` : '–'}</span>
      </div>`;
    }).join('');

    return `
      <button class="back" data-click="back">‹ Back</button>

      ${ui.weekOffset === 0 ? medalsSummary() : ''}

      <div class="wnav">
        <button class="arrow" data-click="wnav" data-id="-1" aria-label="Previous week">‹</button>
        <b>${label}</b>
        <button class="arrow" data-click="wnav" data-id="1" aria-label="Next week" ${ui.weekOffset >= 0 ? 'disabled' : ''}>›</button>
      </div>

      <section class="card">
        <div class="stats pink">
          <div class="stat"><b>${habitPct}%</b><span>habits done</span></div>
          <div class="stat"><b>${waterAvg.toFixed(1)}</b><span>glasses / day</span></div>
          <div class="stat"><b>${totalMins}</b><span>workout min</span></div>
        </div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Habit tracker</h2></div>
        ${grid ? `<div class="grid">${head}${grid}</div>` : '<p class="empty">Add habits on the Today tab, or routines on the Seeds tab, to see them here.</p>'}
      </section>

      <section class="card">
        <div class="card-h"><h2>Day by day</h2><span class="small muted">habits · water · workout</span></div>
        ${dayRows}
      </section>`;
  }

  // ---------- Money ----------
  // Currency follows the phone's region (e.g. en-US -> USD, en-GB -> GBP), falling back to USD.
  const EURO = 'AT BE CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES HR'.split(' ');
  const REGION_CURRENCY = {
    US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', IN: 'INR', JP: 'JPY', MX: 'MXN', BR: 'BRL',
    ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', PH: 'PHP', SG: 'SGD', JM: 'JMD', HT: 'HTG', DO: 'DOP',
    TT: 'TTD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', KR: 'KRW', CN: 'CNY', AE: 'AED',
    SA: 'SAR', PR: 'USD', CO: 'COP', AR: 'ARS', CL: 'CLP', PE: 'PEN',
  };
  EURO.forEach((r) => { REGION_CURRENCY[r] = 'EUR'; });
  const moneyFmt = (() => {
    try {
      const region = new Intl.Locale(navigator.language || 'en-US').maximize().region;
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: REGION_CURRENCY[region] || 'USD' });
    } catch (e) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
  })();
  const money = (n) => moneyFmt.format(n);
  const cents = (n) => Math.round(n * 100) / 100;
  const total = (list) => cents(list.reduce((s, x) => s + x.amount, 0));

  const BUDGET_EMOJI = ['🛒', '☕', '🍽️', '🏠', '💡', '🚗', '💅', '👗', '🎁', '📱', '🐾', '🎉', '💊', '📚', '✨'];
  const SAVE_EMOJI = ['🌸', '✈️', '🚗', '🏠', '🎓', '💍', '🛟', '💻', '👜', '🎁', '🌴', '✨'];

  function periodRange(p, now) {
    if (p === 'week') { const s = startOfWeek(now); return [dkey(s), dkey(addDays(s, 6))]; }
    return [dkey(new Date(now.getFullYear(), now.getMonth(), 1)), dkey(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  }

  function periodLabel(p, now) {
    if (p === 'week') {
      const s = startOfWeek(now);
      return `${fmt(s, { month: 'short', day: 'numeric' })} – ${fmt(addDays(s, 6), { month: 'short', day: 'numeric' })}`;
    }
    return fmt(now, { month: 'long', year: 'numeric' });
  }

  const savedSoFar = (g) => total(g.deposits);

  function paceText(g, saved, now) {
    const left = cents(g.target - saved);
    if (left <= 0) return `${money(saved)} saved`;
    if (!g.deadline) return `${money(left)} to go`;
    const due = parseKey(g.deadline);
    const days = Math.round((due - parseKey(dkey(now))) / 864e5);
    const by = fmt(due, { month: 'short', day: 'numeric', year: due.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    if (days < 0) return `${money(left)} to go · target date (${by}) has passed`;
    if (days < 7) return `${money(left)} to go by ${by}`;
    return `Save ${money(left / (days / 7))}/week to reach it by ${by}`;
  }

  function viewMoney(now) {
    const p = ui.moneyPeriod;
    const word = p === 'week' ? 'week' : 'month';
    const [from, to] = periodRange(p, now);
    const txns = state.txns.filter((t) => t.date >= from && t.date <= to);
    const income = total(txns.filter((t) => t.type === 'income'));
    const spent = total(txns.filter((t) => t.type === 'expense'));
    const budgets = state.budgets.filter((b) => b.period === p);
    const spentIn = (b) => total(txns.filter((t) => t.type === 'expense' && t.budgetId === b.id));
    const budgetLimit = cents(budgets.reduce((s, b) => s + b.limit, 0));
    const budgetSpent = cents(budgets.reduce((s, b) => s + spentIn(b), 0));
    const editB = ui.edit.budgets;
    const editT = ui.edit.txns;
    const editS = ui.edit.savings;

    const budgetRows = budgets.map((b) => {
      const used = spentIn(b);
      const over = used > b.limit;
      const pct = b.limit ? Math.min(100, Math.round((used / b.limit) * 100)) : 0;
      return `<div class="budget">
        <div class="budget-top"><span class="emoji">${esc(b.emoji)}</span><span class="hname">${esc(b.name)}</span>
          <span class="amt">${money(used)} <span class="muted">of ${money(b.limit)}</span></span>
          ${editB ? `<button class="del" data-click="del-budget" data-id="${b.id}" aria-label="Delete ${esc(b.name)} budget">×</button>` : ''}</div>
        <div class="bar ${over ? 'over' : ''}"><span style="width:${pct}%"></span></div>
        <p class="small ${over ? 'warn' : 'muted'}">${over ? `${money(used - b.limit)} over budget` : `${money(b.limit - used)} left`}</p>
      </div>`;
    }).join('');

    const budgetName = (id) => state.budgets.find((b) => b.id === id);
    const opt = (b) => `<option value="${b.id}">${esc(b.emoji)} ${esc(b.name)}</option>`;
    const others = state.budgets.filter((b) => b.period !== p);
    const options = `${budgets.length ? `<optgroup label="${p === 'week' ? 'Weekly' : 'Monthly'} budgets">${budgets.map(opt).join('')}</optgroup>` : ''}
      ${others.length ? `<optgroup label="${p === 'week' ? 'Monthly' : 'Weekly'} budgets">${others.map(opt).join('')}</optgroup>` : ''}
      <option value="">No category</option>`;

    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
    let lastDate = '';
    const activity = sorted.map((t) => {
      const header = t.date !== lastDate ? `<div class="day-h">${dayLabel(t.date, now)}</div>` : '';
      lastDate = t.date;
      const b = budgetName(t.budgetId);
      const isIn = t.type === 'income';
      const icon = isIn ? '💰' : b ? b.emoji : '🧾';
      const title = t.note || (isIn ? 'Income' : b ? b.name : 'Spending');
      const sub = isIn ? (t.note ? 'Income' : '') : (t.note && b ? b.name : '');
      return `${header}<div class="wk">
        <span class="wk-ico">${esc(icon)}</span>
        <div class="wk-body"><b>${esc(title)}</b>${sub ? `<span class="small muted">${esc(sub)}</span>` : ''}</div>
        <span class="tx-amt ${isIn ? 'in' : ''}">${isIn ? '+' : '−'}${money(t.amount)}</span>
        ${editT ? `<button class="del" data-click="del-txn" data-id="${t.id}" aria-label="Delete entry">×</button>` : ''}
      </div>`;
    }).join('');

    const goals = state.savings.map((g) => {
      const saved = savedSoFar(g);
      const reached = saved >= g.target;
      const pct = Math.min(100, Math.round((saved / g.target) * 100));
      const deps = [...g.deposits].sort((a, b) => b.date.localeCompare(a.date));
      return `<div class="budget save ${reached ? 'reached' : ''}">
        <div class="budget-top"><span class="emoji">${esc(g.emoji)}</span><span class="hname">${esc(g.name)}</span>
          <span class="amt">${money(saved)} <span class="muted">of ${money(g.target)}</span></span>
          ${editS ? `<button class="del" data-click="del-saving" data-id="${g.id}" aria-label="Delete ${esc(g.name)} goal">×</button>` : ''}</div>
        <div class="bar mocha"><span style="width:${pct}%"></span></div>
        <p class="small muted">${paceText(g, saved, now)}</p>
        ${reached ? '<p class="cheer">🎉 Goal reached! So proud of you.</p>' : ''}
        ${editS ? '' : `<div class="save-actions">
          <button class="chip strong" data-click="open-deposit" data-id="${g.id}">${ui.openDeposit === g.id ? 'Cancel' : '+ Add money'}</button>
          ${deps.length ? `<button class="link" data-click="toggle-history" data-id="${g.id}">${ui.history[g.id] ? 'Hide history' : `History (${deps.length})`}</button>` : ''}
        </div>`}
        ${ui.openDeposit === g.id && !editS ? `<form class="add" data-submit="add-deposit" data-id="${g.id}">
          <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="Amount" required aria-label="Amount to add">
          <button class="btn mocha">Add</button></form>` : ''}
        ${ui.history[g.id] && deps.length ? `<div class="deps">${deps.map((d) => `<div class="dep">
          <span class="muted">${dayLabel(d.date, now)}</span><b>+${money(d.amount)}</b>
          <button class="del" data-click="del-deposit" data-id="${g.id}:${d.id}" aria-label="Remove deposit">×</button></div>`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    return `
      <div class="seg" role="group" aria-label="Budget period">
        <button data-click="mperiod" data-id="week" aria-pressed="${p === 'week'}">This week</button>
        <button data-click="mperiod" data-id="month" aria-pressed="${p === 'month'}">This month</button>
      </div>

      <section class="card">
        <div class="card-h"><div><h2>${p === 'week' ? 'Weekly' : 'Monthly'} overview</h2><p class="small muted">${periodLabel(p, now)}</p></div></div>
        <div class="stats pink">
          <div class="stat"><b>${money(income)}</b><span>earned</span></div>
          <div class="stat"><b>${money(spent)}</b><span>spent</span></div>
          <div class="stat"><b>${money(income - spent)}</b><span>left</span></div>
        </div>
        ${budgets.length ? `<p class="small muted stats-note">${money(budgetSpent)} of ${money(budgetLimit)} budgeted this ${word}</p>` : ''}
      </section>

      <section class="card">
        <div class="card-h"><h2>${p === 'week' ? 'Weekly' : 'Monthly'} budgets</h2>${budgets.length ? editBtn('budgets') : ''}</div>
        <div class="list">${budgetRows || `<p class="empty">No ${p === 'week' ? 'weekly' : 'monthly'} budgets yet. Add a category and a spending limit below.</p>`}</div>
        <form data-submit="add-budget">
          <div class="add">
            <select name="emoji" aria-label="Category icon">${BUDGET_EMOJI.map((e) => `<option>${e}</option>`).join('')}</select>
            <input name="bname" placeholder="${p === 'week' ? 'e.g. Groceries' : 'e.g. Rent & bills'}" maxlength="40" autocomplete="off" required aria-label="Category name">
          </div>
          <div class="add tight">
            <input name="limit" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="Limit per ${word}" required aria-label="Spending limit">
            <button class="btn">Add</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-h"><h2>Add money in or out</h2></div>
        <form data-submit="add-txn" data-type="${ui.txType}">
          <div class="seg" role="group" aria-label="Entry type">
            <button type="button" data-click="txtype" data-id="expense" aria-pressed="${ui.txType === 'expense'}">💸 Spent</button>
            <button type="button" data-click="txtype" data-id="income" aria-pressed="${ui.txType === 'income'}">💰 Earned</button>
          </div>
          <div class="form-row">
            <label class="fld"><span>Amount</span><input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required></label>
            <label class="fld"><span>Date</span><input name="date" type="date" value="${dkey(now)}" max="${dkey(now)}" required></label>
          </div>
          <label class="fld mb exp-only"><span>Category</span><select name="budget">${options}</select></label>
          <label class="fld"><span>Note (optional)</span><input name="note" maxlength="60" placeholder="e.g. Target run, paycheck" autocomplete="off"></label>
          <button class="btn block">Save</button>
        </form>
      </section>

      <section class="card">
        <div class="card-h"><h2>This ${word}'s activity</h2>${sorted.length ? editBtn('txns') : ''}</div>
        ${activity || `<p class="empty">Nothing logged this ${word} yet.</p>`}
      </section>

      <section class="card">
        <div class="card-h"><h2>Savings goals</h2>${state.savings.length ? editBtn('savings') : ''}</div>
        <div class="list">${goals || '<p class="empty">Saving for something? A trip, a new bag, an emergency fund? Add it below.</p>'}</div>
        <form data-submit="add-saving">
          <div class="add">
            <select name="emoji" aria-label="Goal icon">${SAVE_EMOJI.map((e) => `<option>${e}</option>`).join('')}</select>
            <input name="sname" placeholder="e.g. Summer trip" maxlength="40" autocomplete="off" required aria-label="Savings goal name">
          </div>
          <div class="form-row add tight">
            <label class="fld"><span>Target amount</span><input name="target" type="number" inputmode="decimal" step="0.01" min="1" placeholder="1000" required></label>
            <label class="fld"><span>By (optional)</span><input name="deadline" type="date" min="${dkey(now)}"></label>
          </div>
          <button class="btn block mocha">Add savings goal</button>
        </form>
      </section>`;
  }

  // Bloom's own "Are you sure?" box (works everywhere, unlike the browser's confirm()).
  function ask(message, okLabel = 'Delete') {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'dialog-backdrop';
      wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-msg">
          <p id="dlg-msg">${esc(message)}</p>
          <div class="dialog-actions">
            <button class="chip" data-dlg="no">Cancel</button>
            <button class="btn" data-dlg="yes">${esc(okLabel)}</button>
          </div>
        </div>`;
      const done = (answer) => {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        resolve(answer);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-dlg]');
        if (b) done(b.dataset.dlg === 'yes');
        else if (e.target === wrap) done(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-dlg="no"]').focus();
    });
  }

  function toast(msg) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // ---------- Cloud accounts (Supabase) ----------
  // Progress (everything except money) is saved online per account and synced between devices.
  const LOCAL_ONLY = ['budgets', 'txns', 'savings']; // money never leaves the device
  function cloudOn() { return !!(CLOUD.url && CLOUD.anonKey); } // a declaration, so save() can use it during startup
  const siteUrl = () => location.origin + location.pathname;

  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
      else localStorage.removeItem(AUTH_KEY);
    } catch (e) { /* ignore */ }
  }
  function storeSyncMeta() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncMeta)); } catch (e) { /* ignore */ } }

  // Turns the service's messages into plain, friendly ones.
  function friendlyError(err) {
    const m = String((err && err.message) || '');
    if (err && err.offline) return "Couldn't reach the internet. Check your connection and try again.";
    if (/invalid login credentials/i.test(m)) return "That email and password don't match. Check them and try again.";
    if (/already registered|already been registered/i.test(m)) return 'There’s already an account with that email. Try signing in instead.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Tap the link we sent you, then sign in.';
    if (/password/i.test(m) && /6|characters|short|weak/i.test(m)) return 'Passwords need at least 6 characters.';
    if (/rate limit|too many|429/i.test(m) || (err && err.status === 429)) return 'Too many tries. Please wait a few minutes and try again.';
    if (err && err.code === '23505') return 'That username is already taken. Please choose another one.';
    if (/valid email|email address/i.test(m)) return 'Please enter a valid email address.';
    return m ? `Something went wrong: ${m}` : 'Something went wrong. Please try again.';
  }

  async function api(path, { method = 'GET', body, auth = false, headers = {} } = {}) {
    const h = Object.assign({ apikey: CLOUD.anonKey, 'Content-Type': 'application/json' }, headers);
    if (auth) {
      await freshSession();
      if (!session) { const e = new Error('Signed out'); e.signedOut = true; throw e; }
      h.Authorization = `Bearer ${session.access_token}`;
    } else if (CLOUD.anonKey.startsWith('eyJ')) {
      h.Authorization = `Bearer ${CLOUD.anonKey}`; // classic "anon" keys also go here; newer "publishable" keys don't
    }
    let res;
    try {
      res = await fetch(CLOUD.url.replace(/\/$/, '') + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      const err = new Error('offline');
      err.offline = true;
      throw err;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const err = new Error((json && (json.msg || json.message || json.error_description || json.error)) || `Error ${res.status}`);
      err.status = res.status;
      err.code = json && (json.code || json.error_code);
      throw err;
    }
    return json;
  }

  function storeAuth(json) {
    const u = json.user || {};
    saveSession({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (Number(json.expires_in) || 3600) * 1000,
      user: { id: u.id, email: u.email, meta: u.user_metadata || {} },
    });
  }

  async function freshSession() {
    if (!session || Date.now() < session.expires_at - 60000) return;
    try {
      storeAuth(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }));
    } catch (e) {
      if (!e.offline) saveSession(null); // the login expired; she'll need to sign in again
      throw e;
    }
  }

  async function cloudFetch() {
    const rows = await api(`/rest/v1/bloom_data?user_id=eq.${session.user.id}&select=username,data,updated_at`, { auth: true });
    return (rows && rows[0]) || null;
  }

  function syncedPart() {
    const d = {};
    Object.keys(state).forEach((k) => { if (!LOCAL_ONLY.includes(k)) d[k] = state[k]; });
    return d;
  }

  async function cloudPush() {
    const updatedAt = new Date().toISOString();
    await api('/rest/v1/bloom_data?on_conflict=user_id', {
      method: 'POST',
      auth: true,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: session.user.id, username: state.username, data: syncedPart(), updated_at: updatedAt },
    });
    syncMeta = { dirty: false, syncedAt: updatedAt };
    storeSyncMeta();
  }

  // Replaces this device's progress with the online copy, keeping money (which only lives here).
  function applyRemote(row) {
    const keep = {};
    LOCAL_ONLY.forEach((k) => { keep[k] = state[k]; });
    state = Object.assign(defaults(), row.data || {}, keep);
    state.username = row.username;
    if (!state.affSeed) state.affSeed = Math.floor(Math.random() * 2147483646) + 1;
    affOrder = null;
    writeLocal();
    syncMeta = { dirty: false, syncedAt: row.updated_at };
    storeSyncMeta();
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 2500);
  }

  async function pushNow() {
    clearTimeout(pushTimer);
    if (!cloudOn() || !session || !state.username) return;
    ui.sync = 'saving';
    updateSyncLabel();
    try {
      await cloudPush();
      ui.sync = 'saved';
    } catch (e) {
      ui.sync = e.offline ? 'offline' : e.signedOut ? 'signedout' : 'error';
    }
    updateSyncLabel();
  }

  // On open (and when she comes back to the app): download newer progress, or upload unsaved changes.
  async function cloudSync() {
    if (!cloudOn() || !session || !state.username) return;
    try {
      const row = await cloudFetch();
      if (!row || syncMeta.dirty) await pushNow();
      else if (row.updated_at !== syncMeta.syncedAt) {
        applyRemote(row);
        render();
        ui.sync = 'saved';
      } else ui.sync = 'saved';
    } catch (e) {
      ui.sync = e.offline ? 'offline' : e.signedOut ? 'signedout' : 'error';
    }
    updateSyncLabel();
  }

  // After any sign-in: load her online progress, or create it from this device's progress.
  async function afterSignIn() {
    const row = await cloudFetch();
    if (row) {
      if (state.username && !(await ask('This device already has progress. Replace it with your online progress? Money on this device stays as it is.', 'Use online progress'))) {
        saveSession(null);
        toast('Not signed in. This device keeps its own progress.');
        render();
        return false;
      }
      applyRemote(row);
    } else {
      const meta = session.user.meta || {};
      if (!state.username) {
        state.username = meta.username || (session.user.email || 'bloomer').split('@')[0].replace(/[^A-Za-z0-9._]/g, '').slice(0, 20) || 'bloomer';
        state.name = meta.first_name || '';
      }
      writeLocal();
      await cloudPush();
    }
    ui.sync = 'saved';
    ui.welcomeMode = null;
    ui.cloudPanel = null;
    render();
    return true;
  }

  // Handles the links in Supabase emails (confirm email, reset password).
  async function handleAuthRedirect() {
    if (!cloudOn() || !location.hash || location.hash.length < 2) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const clearHash = () => history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error_description')) {
      clearHash();
      toast(`That link didn't work: ${p.get('error_description')}. Try again from the sign-in page.`);
      return;
    }
    const token = p.get('access_token');
    if (!token) return;
    clearHash();
    try {
      const res = await fetch(`${CLOUD.url.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: CLOUD.anonKey, Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('bad link');
      const user = await res.json();
      storeAuth({ access_token: token, refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in'), user });
      if (p.get('type') === 'recovery') {
        ui.recovery = true;
        render();
      } else if (await afterSignIn()) {
        toast('Email confirmed. Welcome to Bloom 🌸');
      }
    } catch (e) {
      toast("That link didn't work. Try signing in instead.");
    }
  }

  const ago = (iso) => {
    if (!iso) return '';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  };
  function syncText() {
    switch (ui.sync) {
      case 'saving': return 'Saving…';
      case 'offline': return 'You’re offline. Changes will save when you’re back online.';
      case 'error': return 'Couldn’t save just now. Bloom will try again soon.';
      case 'signedout': return 'Your sign-in expired. Sign out and sign back in to keep saving online.';
      default: return syncMeta.dirty ? 'Saving soon…' : `Saved online${syncMeta.syncedAt ? ` · ${ago(syncMeta.syncedAt)}` : ''}`;
    }
  }
  function updateSyncLabel() {
    const el = $('#sync-status');
    if (el) el.textContent = syncText();
  }

  // Disables a form's button while something is loading, and shows errors under the form.
  async function busy(form, label, fn) {
    const btn = form.querySelector('button.btn');
    const err = form.querySelector('.form-error');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    if (err) err.textContent = '';
    try {
      await fn();
    } catch (e) {
      if (err) err.textContent = friendlyError(e);
    } finally {
      if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = old; }
    }
  }
  const formError = (form, msg) => { const el = form.querySelector('.form-error'); if (el) el.textContent = msg; };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---------- Welcome & profile ----------
  const USERNAME_RE = /^[A-Za-z0-9._]{3,20}$/;

  function welcomeForm() {
    const mode = cloudOn() ? (ui.welcomeMode || 'signup') : 'local';
    const err = '<p class="form-error" role="alert"></p>';
    const tabs = `<div class="seg" role="group" aria-label="Account">
        <button data-click="wmode" data-id="signup" aria-pressed="${mode === 'signup'}">Create account</button>
        <button data-click="wmode" data-id="signin" aria-pressed="${mode === 'signin'}">Sign in</button>
      </div>`;
    const usernameField = `<label class="fld mb"><span>Create a username</span>
        <span class="at-field"><input name="username" placeholder="e.g. mayablooms" maxlength="21" autocomplete="username" autocapitalize="none" spellcheck="false" required></span>
      </label>`;
    const firstField = `<label class="fld mb"><span>First name (optional)</span>
        <input name="first" placeholder="Used in your daily affirmations" maxlength="30" autocomplete="given-name"></label>`;
    const emailField = `<label class="fld mb"><span>Email</span>
        <input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></label>`;
    const passField = (auto) => `<label class="fld"><span>Password</span>
        <input name="password" type="password" minlength="6" autocomplete="${auto}" required placeholder="At least 6 characters"></label>`;

    if (mode === 'confirm') {
      return `<h2 class="w-form-title">Check your email 💌</h2>
        <p class="small">We sent a confirmation link to <b>${esc(ui.pendingEmail || 'your email')}</b>. Tap it to finish creating your account. It opens Bloom and signs you in.</p>
        <button class="btn block" data-click="wmode" data-id="signin">I’ve confirmed. Sign in</button>`;
    }
    if (mode === 'forgot') {
      return `<h2 class="w-form-title">Reset your password</h2>
        <form data-submit="forgot" novalidate>${emailField}${err}<button class="btn block">Send reset link</button></form>
        <button class="link w-alt" data-click="wmode" data-id="signin">Back to sign in</button>`;
    }
    if (mode === 'signin') {
      return `${tabs}
        <form data-submit="sign-in" novalidate>${emailField}${passField('current-password')}${err}<button class="btn block">Sign in</button></form>
        <button class="link w-alt" data-click="wmode" data-id="forgot">Forgot password?</button>`;
    }
    if (mode === 'signup') {
      return `${tabs}
        <form data-submit="sign-up" novalidate>${usernameField}${firstField}${emailField}${passField('new-password')}${err}
          <button class="btn block">Start blooming 🌸</button></form>
        <p class="small muted w-note">Your progress saves online so you can use Bloom on any device. Money info stays private on your phone.</p>
        <button class="link w-alt" data-click="wmode" data-id="local">Continue without an account</button>`;
    }
    return `<h2 class="w-form-title">Start your journey</h2>
      <form data-submit="create-profile" novalidate>${usernameField}${firstField.replace(' mb', '')}${err}
        <button class="btn block">Start blooming 🌸</button></form>
      <p class="small muted w-note">Your username and progress are saved privately on this device.${cloudOn() ? ' You can create an account later in Settings.' : ''}</p>
      ${cloudOn() ? '<button class="link w-alt" data-click="wmode" data-id="signup">Create an account instead</button>' : ''}`;
  }

  function viewNewPassword() {
    return `
      <div class="welcome-wrap">
        <img class="welcome-logo" src="icons/icon.svg" alt="">
        <section class="card">
          <h2 class="w-form-title">Choose a new password</h2>
          <form data-submit="new-password" novalidate>
            <label class="fld"><span>New password</span>
              <input name="password" type="password" minlength="6" autocomplete="new-password" required placeholder="At least 6 characters"></label>
            <p class="form-error" role="alert"></p>
            <button class="btn block">Save new password</button>
          </form>
        </section>
      </div>`;
  }

  function viewWelcome() {
    if (ui.recovery) return viewNewPassword();
    return `
      <div class="welcome-wrap">
        <img class="welcome-logo" src="icons/icon.svg" alt="">
        <p class="welcome-path" aria-hidden="true">🌱 · 🌿 · 🌸</p>
        <h1 class="w-title">Every bloom begins as a seed.</h1>
        <p class="w-text">
          Flowers don't rush. They grow roots in quiet soil, drink in the rain, and turn
          toward the light a little more each day, until one morning they open into
          something beautiful. You're on that same journey. Every habit you keep, every
          goal you chase, and every dollar you save is a seed you're planting in yourself.
          Some days bring sunshine and some bring rain, and both help you grow.
          Welcome to Bloom, where you blossom into the fullest, most radiant version
          of you, one petal at a time.
        </p>
        <section class="card">${welcomeForm()}</section>
      </div>`;
  }

  // ---------- Settings & backgrounds ----------
  const PHOTO_KEY = 'bloom:bg-photo';
  const SWATCHES = [
    { id: 'blush', name: 'Blush', color: '#f9e1e5' },
    { id: 'rose', name: 'Rose', color: '#f2c9d2' },
    { id: 'petal', name: 'Petal', color: '#fdeef1' },
    { id: 'peach', name: 'Peach', color: '#fbdfd3' },
    { id: 'cream', name: 'Cream', color: '#fbf3e8' },
    { id: 'latte', name: 'Latte', color: '#ecdccd' },
    { id: 'mocha', name: 'Mocha', color: '#dcc4b1' },
    { id: 'cocoa', name: 'Cocoa', color: '#c8a690' },
  ];
  let bgPhoto = null;
  try { bgPhoto = localStorage.getItem(PHOTO_KEY); } catch (e) { /* ignore */ }
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

  const isDark = () => state.theme === 'dark' || (state.theme !== 'light' && darkMQ.matches);

  // Light / dark / automatic. The CSS already has a palette for data-theme="light" and "dark".
  function applyTheme() {
    const root = document.documentElement;
    const theme = state.theme || 'auto';
    if (theme === 'auto') {
      if (root.dataset.bloomTheme) { root.removeAttribute('data-theme'); delete root.dataset.bloomTheme; }
    } else {
      root.setAttribute('data-theme', theme);
      root.dataset.bloomTheme = theme;
    }
    // Keep the phone's status bar color in step with the chosen look.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (m.dataset.media === undefined) { m.dataset.media = m.getAttribute('media') || ''; m.dataset.color = m.content; }
      if (theme === 'auto') {
        if (m.dataset.media) m.setAttribute('media', m.dataset.media);
        m.content = m.dataset.color;
      } else {
        m.removeAttribute('media');
        m.content = theme === 'dark' ? '#231a17' : '#fbf2ee';
      }
    });
  }

  // Paints the chosen background behind everything. Dark mode adds a chocolate layer.
  function applyBackground() {
    const root = document.documentElement;
    const bg = state.bg || { type: 'floral' };
    const dark = isDark();
    const layer = (rgb, a) => `linear-gradient(rgba(${rgb}, ${a}), rgba(${rgb}, ${a}))`;
    let value = null;
    if (bg.type === 'solid') {
      const s = SWATCHES.find((x) => x.id === bg.color) || SWATCHES[0];
      value = `${dark ? layer('35, 26, 23', 0.85) + ', ' : ''}linear-gradient(${s.color}, ${s.color})`;
    } else if (bg.type === 'photo' && bgPhoto) {
      const veil = typeof bg.veil === 'number' ? bg.veil : 0.45;
      value = dark
        ? `${layer('35, 26, 23', Math.max(0.72, veil))}, url("${bgPhoto}")`
        : `${layer('251, 242, 238', veil)}, url("${bgPhoto}")`;
    }
    if (value) root.style.setProperty('--pattern', value);
    else root.style.removeProperty('--pattern');
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', applyBackground);

  async function usePhoto(file) {
    if (!file) return;
    try {
      // Shrink big phone photos so they load fast and fit in on-device storage.
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL('image/jpeg', 0.82);
      localStorage.setItem(PHOTO_KEY, data);
      bgPhoto = data;
      state.bg = Object.assign({}, state.bg, { type: 'photo' });
      commit();
      toast('Background updated 🌸');
    } catch (e) {
      toast("Couldn't use that photo. Try a different one.");
    }
  }

  function viewSettings() {
    const bg = state.bg;
    const veilPct = Math.round((typeof bg.veil === 'number' ? bg.veil : 0.45) * 100);
    const theme = state.theme || 'auto';
    return `
      <button class="back" data-click="back">‹ Back</button>

      <section class="card">
        <div class="card-h"><h2>Appearance</h2></div>
        <div class="seg theme-seg" role="group" aria-label="Appearance">
          <button data-click="theme" data-id="auto" aria-pressed="${theme === 'auto'}"><span aria-hidden="true">📱</span>Automatic</button>
          <button data-click="theme" data-id="light" aria-pressed="${theme === 'light'}"><span aria-hidden="true">☀️</span>Light</button>
          <button data-click="theme" data-id="dark" aria-pressed="${theme === 'dark'}"><span aria-hidden="true">🌙</span>Dark</button>
        </div>
        <p class="small muted theme-note">${theme === 'auto'
          ? `Following your phone's setting (${darkMQ.matches ? 'dark' : 'light'} right now).`
          : `Bloom will always look ${theme}, whatever your phone is set to.`}</p>
      </section>

      <section class="card">
        <div class="card-h"><h2>Background</h2></div>
        <div class="bg-tiles">
          <button class="bg-tile" data-click="bg-floral" aria-pressed="${bg.type === 'floral'}">
            <span class="bg-prev" style="background-image:url('icons/background.svg')"></span>Bloom florals
          </button>
          <button class="bg-tile" data-click="${bgPhoto ? 'bg-photo' : 'pick-photo'}" aria-pressed="${bg.type === 'photo' && !!bgPhoto}">
            <span class="bg-prev" ${bgPhoto ? `style="background-image:url('${bgPhoto}')"` : ''}>${bgPhoto ? '' : '＋'}</span>${bgPhoto ? 'Your photo' : 'Upload a photo'}
          </button>
        </div>

        <p class="sub-h">Solid colors</p>
        <div class="swatches">
          ${SWATCHES.map((s) => `<button class="swatch" data-click="bg-color" data-id="${s.id}" aria-pressed="${bg.type === 'solid' && bg.color === s.id}">
            <span style="background:${s.color}"></span>${s.name}</button>`).join('')}
        </div>

        ${bgPhoto ? `<div class="photo-ctrl">
          <p class="sub-h">Your photo</p>
          ${bg.type === 'photo' ? `<label class="range-row"><span class="small muted">Soften</span>
            <input type="range" id="veil" min="0" max="80" step="5" value="${veilPct}" aria-label="Soften photo">
            <b class="small" id="veil-val">${veilPct}%</b></label>
            <p class="small muted">Slide right to fade the photo so text is easier to read.</p>` : ''}
          <div class="photo-actions">
            <button class="chip" data-click="pick-photo">Change photo</button>
            <button class="chip danger" data-click="remove-photo">Remove photo</button>
          </div>
        </div>` : '<p class="small muted photo-hint">Tip: choose "Upload a photo" to use a picture from your phone.</p>'}
        <input type="file" id="bg-file" accept="image/*" hidden>
      </section>

      ${accountCard()}
      ${backupCard()}
      ${profileCard(true)}`;
  }

  function accountCard() {
    if (!cloudOn()) return '';
    if (session) {
      return `
        <section class="card">
          <div class="card-h"><h2>☁️ Online account</h2></div>
          <p class="small acct-line">Signed in as <b>${esc(session.user.email || '')}</b></p>
          <p class="small muted acct-line" id="sync-status" role="status">${syncText()}</p>
          <div class="photo-actions"><button class="chip strong" data-click="sync-now">Save now</button></div>
          <p class="small muted acct-note">Your habits, goals, workouts, routines, medals and settings are saved online. Money (budgets, spending and savings) stays only on this device.</p>
        </section>`;
    }
    const signin = ui.cloudPanel === 'signin';
    return `
      <section class="card">
        <div class="card-h"><h2>☁️ Save your progress online</h2></div>
        <p class="small muted acct-note">Right now your progress lives only on this device. With an account, it's saved online, so you can get it back on a new phone or use Bloom on more than one device. Money stays only on this device.</p>
        ${signin ? `
          <form data-submit="cloud-signin" novalidate>
            <label class="fld mb"><span>Email</span><input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" required></label>
            <label class="fld"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
            <p class="form-error" role="alert"></p>
            <button class="btn block">Sign in</button>
          </form>
          <button class="link w-alt" data-click="cloud-panel" data-id="signup">I need to create an account</button>` : `
          <form data-submit="cloud-signup" novalidate>
            <label class="fld mb"><span>Username</span>
              <span class="at-field"><input name="username" value="${esc(state.username)}" maxlength="21" autocapitalize="none" spellcheck="false" required></span></label>
            <label class="fld mb"><span>Email</span><input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" required></label>
            <label class="fld"><span>Password</span><input name="password" type="password" minlength="6" autocomplete="new-password" placeholder="At least 6 characters" required></label>
            <p class="form-error" role="alert"></p>
            <button class="btn block">Create account &amp; save my progress</button>
          </form>
          <button class="link w-alt" data-click="cloud-panel" data-id="signin">I already have an account</button>`}
      </section>`;
  }

  function backupCard() {
    return `
      <section class="card">
        <div class="card-h"><h2>💾 Backup file</h2></div>
        <p class="small muted acct-note">Save a copy of everything, including money, as a file on your device. You can restore it here on any phone or computer.</p>
        <div class="photo-actions">
          <button class="chip strong" data-click="backup-download">Download backup</button>
          <button class="chip" data-click="backup-restore">Restore from backup</button>
        </div>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </section>`;
  }

  // Opens the tester's email app with a short feedback template.
  const FEEDBACK_EMAIL = 'napoleon.pierre1@gmail.com';
  function feedbackLink() {
    const body = [
      'What I tried:', '', '',
      'What I loved:', '', '',
      'What was confusing or broken:', '', '',
      '---',
      `Username: @${state.username || ''}`,
      `Device: ${navigator.userAgent}`,
    ].join('\n');
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Bloom feedback')}&body=${encodeURIComponent(body)}`;
  }

  function profileCard(inSettings) {
    return `
      <section class="card profile">
        <div class="profile-top">
          <span class="avatar big" aria-hidden="true">${esc(state.username[0].toUpperCase())}</span>
          <div><b>@${esc(state.username)}</b><p class="small muted">${state.name ? esc(state.name) : 'No first name yet'}</p></div>
        </div>
        <div class="profile-actions">
          ${inSettings ? '' : `<button class="chip" data-click="open-week">📅 My week</button>
            <button class="chip" data-click="open-medals">🏅 Medals</button>
            <button class="chip" data-click="open-settings">⚙️ Settings</button>`}
          <button class="chip" data-click="edit-name">${state.name ? 'Change first name' : 'Add first name'}</button>
          <button class="chip" data-click="feedback" aria-expanded="${ui.showFeedback}">💌 Send feedback</button>
          <button class="chip danger" data-click="sign-out">Sign out</button>
        </div>
        ${ui.showFeedback ? `<div class="feedback">
          <p class="small">Email your thoughts, ideas or anything that broke to:</p>
          <div class="copy-row">
            <span class="email" id="fb-email">${FEEDBACK_EMAIL}</span>
            <button class="chip strong" data-click="copy-email">Copy</button>
          </div>
          <a class="link" href="${esc(feedbackLink())}">Open my email app</a>
        </div>` : ''}
        <p class="small muted">${session
          ? '☁️ Your progress is saved online. Money stays only on this device.'
          : `Your data is saved only on this device. Signing out erases it.${cloudOn() ? ' Create an account in Settings to save it online.' : ''}`}</p>
      </section>`;
  }

  // ---------- Seeds: morning & night routines ----------
  const ROUTINES = { morning: { label: 'Morning', icon: '☀️' }, night: { label: 'Night', icon: '🌙' } };
  const STEP_EMOJI = ['✨', '💧', '🦷', '🧴', '💊', '🚿', '👗', '👟', '🛏️', '🧘‍♀️', '🍳', '☕', '📝', '☀️', '📵', '📖', '🧺', '🎒', '🙏', '🍵', '😴', '🎧', '🐾'];

  // [emoji, name, tiny version]
  const TEMPLATES = {
    morning: [
      {
        name: 'Easy start', blurb: 'Gentle and quick. Good for low-energy mornings.',
        steps: [
          ['💧', 'Drink a glass of water', 'Take a few sips'],
          ['🦷', 'Brush teeth', 'Rinse with mouthwash'],
          ['💊', 'Take my vitamins or meds', ''],
          ['🧴', 'Wash face and skincare', 'Splash water on my face'],
          ['👗', 'Get dressed', 'Change into one fresh item'],
          ['📝', 'Write my top 3 for today', 'Write just one thing'],
        ],
      },
      {
        name: 'Move & glow', blurb: 'Movement and sunlight to wake your brain up.',
        steps: [
          ['🛏️', 'Make the bed', 'Pull up the covers'],
          ['💧', 'Drink a glass of water', 'Take a few sips'],
          ['☀️', 'Open the curtains and get some sunlight', 'Open one curtain'],
          ['🧘‍♀️', 'Stretch', 'One big stretch'],
          ['🚿', 'Shower', 'Wash face and freshen up'],
          ['🍳', 'Eat breakfast', 'Grab something with protein'],
        ],
      },
    ],
    night: [
      {
        name: 'Wind down', blurb: 'A calm, screen-free bedtime.',
        steps: [
          ['📵', 'Put my phone on the charger across the room', 'Put it face down'],
          ['🧴', 'Wash face and skincare', 'Use a face wipe'],
          ['🦷', 'Brush teeth', 'Rinse with mouthwash'],
          ['👗', "Set out tomorrow's clothes", 'Pick just the top'],
          ['📖', 'Read in bed', 'Read one page'],
          ['😴', 'Lights out', ''],
        ],
      },
      {
        name: 'Reset & rest', blurb: 'Set tomorrow-you up for an easier morning.',
        steps: [
          ['🧺', '10-minute tidy', 'Clear one surface'],
          ['🎒', 'Put my bag and keys by the door', 'Keys by the door'],
          ['📝', "Write tomorrow's top 3", 'Write one thing'],
          ['🍵', 'Make a caffeine-free tea', ''],
          ['🚿', 'Shower or bath', 'Wash my face'],
          ['🙏', 'Think of 3 good things from today', 'Just one good thing'],
        ],
      },
    ],
  };

  // Habit-stacking ideas. "anchor" words are looked for in her step names; the new habit goes right after
  // that step. anchor: null means it goes first, before the routine starts. "skip" words mean she already has it.
  const STACKS = [
    { id: 'm-water-wake', when: 'morning', anchor: null, lead: 'Right after I get out of bed', add: ['💧', 'Drink a glass of water', 'Take a few sips'], skip: ['water', 'drink'], why: 'Keep a full bottle on your nightstand so it is the first thing you see.' },
    { id: 'm-meds-teeth', when: 'morning', anchor: ['brush', 'teeth'], add: ['💊', 'Take my vitamins or meds', ''], skip: ['vitamin', 'med', 'pill', 'supplement'], why: 'Keep them right next to your toothbrush. Seeing them is half the battle.' },
    { id: 'm-water-coffee', when: 'morning', anchor: ['coffee'], add: ['💧', 'Drink a glass of water while the coffee brews', 'Take a few sips'], skip: ['water'], why: 'Waiting time becomes a quick win instead of a moment to get distracted.' },
    { id: 'm-top3-coffee', when: 'morning', anchor: ['coffee', 'tea', 'breakfast'], add: ['📝', 'Write my top 3 for today', 'Write just one thing'], skip: ['top 3', 'plan', 'list', 'journal'], why: 'Picking your top 3 early gives your day a clear starting point.' },
    { id: 'm-sun-bed', when: 'morning', anchor: ['bed'], add: ['☀️', 'Open the curtains and get some sunlight', 'Open one curtain'], skip: ['sun', 'curtain', 'outside'], why: 'Morning light helps set your body clock, which can make waking up easier.' },
    { id: 'm-stretch-water', when: 'morning', anchor: ['water', 'drink'], add: ['🧘‍♀️', 'Stretch for 2 minutes', 'One big stretch'], skip: ['stretch', 'yoga'], why: 'Short movement wakes your brain up, and 2 minutes is easy to start.' },
    { id: 'm-spf-skincare', when: 'morning', anchor: ['skincare', 'face', 'moistur'], add: ['🧴', 'Put on sunscreen', ''], skip: ['spf', 'sunscreen'], why: 'Stacked onto skincare you already do, it becomes one smooth motion.' },
    { id: 'm-moist-shower', when: 'morning', anchor: ['shower'], add: ['🧴', 'Moisturize right after', ''], skip: ['skincare', 'moistur', 'lotion'], why: 'Do it while you are still in the bathroom, so you don’t have to remember to come back.' },
    { id: 'm-shoes-dressed', when: 'morning', anchor: ['dress', 'clothes', 'outfit'], add: ['👟', 'Put my shoes on', ''], skip: ['shoe'], why: 'Shoes on tells your brain you’re ready to go and makes leaving easier.' },
    { id: 'n-phone-first', when: 'night', anchor: null, lead: 'When I start winding down', add: ['📵', 'Put my phone on the charger across the room', 'Put it face down'], skip: ['phone'], why: 'Scrolling is the biggest bedtime thief. Out of reach means out of mind.' },
    { id: 'n-read-phone', when: 'night', anchor: ['phone'], add: ['📖', 'Read in bed', 'Read one page'], skip: ['read', 'book'], why: 'Swap scrolling for something calm right when the phone goes down.' },
    { id: 'n-face-teeth', when: 'night', anchor: ['brush', 'teeth'], add: ['🧴', 'Wash my face', 'Use a face wipe'], skip: ['face', 'skincare'], why: 'Same sink, same moment, so one flows straight into the other.' },
    { id: 'n-clothes-teeth', when: 'night', anchor: ['brush', 'teeth', 'skincare'], add: ['👗', "Set out tomorrow's clothes", 'Pick just the top'], skip: ['clothes', 'outfit'], why: 'Fewer decisions in the morning makes mornings much easier.' },
    { id: 'n-bag-clothes', when: 'night', anchor: ['clothes', 'outfit'], add: ['🎒', 'Put my bag and keys by the door', 'Keys by the door'], skip: ['bag', 'keys'], why: 'A “launch pad” by the door means no frantic searching tomorrow.' },
    { id: 'n-tidy-dinner', when: 'night', anchor: ['dinner', 'eat', 'dishes'], add: ['🧺', '10-minute tidy', 'Clear one surface'], skip: ['tidy', 'clean'], why: 'A small, clear finish line makes a chore much easier to start.' },
    { id: 'n-top3-tidy', when: 'night', anchor: ['tidy', 'clean', 'bag'], add: ['📝', "Write tomorrow's top 3", 'Write one thing'], skip: ['top 3', 'plan', 'list'], why: 'Getting tomorrow out of your head helps your brain switch off.' },
    { id: 'n-bottle-teeth', when: 'night', anchor: ['brush', 'teeth'], add: ['💧', 'Fill a water bottle for my nightstand', ''], skip: ['bottle', 'nightstand'], why: 'Tomorrow morning’s first habit is ready and waiting.' },
    { id: 'n-good-bed', when: 'night', anchor: ['pajama', 'pyjama', 'read', 'lights'], add: ['🙏', 'Think of 3 good things from today', 'Just one good thing'], skip: ['gratitude', 'good thing', 'journal'], why: 'Ending on something good is a gentle way to quiet a busy mind.' },
  ];

  const currentRoutine = (now) => ui.routine || (now.getHours() >= 4 && now.getHours() < 15 ? 'morning' : 'night');
  // A night routine finished after midnight (before 4am) still counts for the night before.
  const routineDay = (r, now) => dkey(r === 'night' && now.getHours() < 4 ? addDays(now, -1) : now);
  const routineGet = (r, k) => (state.routineLog[k] || {})[r] || { steps: {}, complete: false };
  const makeStep = ([emoji, name, tiny]) => ({ id: uid(), emoji, name, tiny: tiny || '' });

  // Records a step as done ('full' or 'tiny') or not done (null). Returns true if that finished the routine.
  function markStep(r, stepId, how) {
    const k = routineDay(r, new Date());
    const day = state.routineLog[k] || (state.routineLog[k] = {});
    const entry = day[r] || (day[r] = { steps: {}, complete: false });
    if (how) entry.steps[stepId] = how;
    else delete entry.steps[stepId];
    const was = entry.complete;
    entry.complete = state.routines[r].length > 0 && state.routines[r].every((s) => entry.steps[s.id]);
    return !was && entry.complete;
  }

  function routineStreak(r, now) {
    const days = Object.keys(state.routineLog)
      .filter((k) => state.routineLog[k][r] && state.routineLog[k][r].complete)
      .map(dayNum);
    return streakInfo(days, 1, dayNum(routineDay(r, now)));
  }

  function stackIdeas(r) {
    const steps = state.routines[r];
    const all = steps.map((s) => s.name.toLowerCase()).join(' | ');
    const has = (words) => words.some((w) => all.includes(w));
    const ideas = [];
    STACKS.forEach((st) => {
      if (st.when !== r || state.dismissedTips.includes(st.id) || has(st.skip)) return;
      if (st.anchor === null) { ideas.push({ st, anchor: null }); return; }
      const anchor = steps.find((s) => st.anchor.some((w) => s.name.toLowerCase().includes(w)));
      if (anchor) ideas.push({ st, anchor });
    });
    // Ideas that build on what she already does come first.
    return ideas.sort((a, b) => (a.anchor ? 0 : 1) - (b.anchor ? 0 : 1)).slice(0, 3);
  }

  function routineTips(r) {
    const steps = state.routines[r];
    const tips = [];
    if (steps.length > 7) tips.push(`Your routine has ${steps.length} steps. Routines with 3–6 steps are much easier to start. Try moving a few to another time of day.`);
    if (steps.length >= 2 && !steps.some((s) => s.tiny)) tips.push('Give your hardest step a tiny version. On low-energy days, the tiny version still counts as done.');
    if (steps.length >= 3) tips.push('Make step one the easiest thing on your list. A small first win builds momentum for the rest.');
    return tips.slice(0, 2);
  }

  function routineTodayCard(now) {
    const r = currentRoutine(now);
    const steps = state.routines[r];
    if (!steps.length) return '';
    const e = routineGet(r, routineDay(r, now));
    const n = steps.filter((s) => e.steps[s.id]).length;
    const meta = ROUTINES[r];
    return `
      <section class="card">
        <div class="card-h">
          <div><h2>${meta.icon} ${meta.label} routine</h2>
            <p class="small muted">${e.complete ? 'Done for today 🌸' : `${n} of ${steps.length} steps`}</p></div>
          ${e.complete ? '' : `<button class="btn" data-click="focus-start" data-id="${r}">▶ ${n ? 'Continue' : 'Start'}</button>`}
        </div>
        <div class="bar"><span style="width:${Math.round((n / steps.length) * 100)}%"></span></div>
      </section>`;
  }

  function viewSeeds(now) {
    const r = currentRoutine(now);
    const meta = ROUTINES[r];
    const steps = state.routines[r];
    const entry = routineGet(r, routineDay(r, now));
    const n = steps.filter((s) => entry.steps[s.id]).length;
    const streak = routineStreak(r, now).current;
    const editing = ui.edit.routine;
    const word = r === 'morning' ? 'morning' : 'night';

    const rows = steps.map((s, i) => {
      const how = entry.steps[s.id];
      const body = `<span class="emoji">${esc(s.emoji)}</span>
        <div class="step-body"><b>${esc(s.name)}</b>${s.tiny ? `<span class="small muted">${how === 'tiny' ? 'Did the tiny version ✓' : `Tiny: ${esc(s.tiny)}`}</span>` : ''}</div>`;
      if (editing) {
        return `<div class="item step">${body}
          <button class="mini" data-click="step-move" data-id="${s.id}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(s.name)} up">↑</button>
          <button class="mini" data-click="step-move" data-id="${s.id}:1" ${i === steps.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(s.name)} down">↓</button>
          <button class="del" data-click="del-step" data-id="${s.id}" aria-label="Delete ${esc(s.name)}">×</button></div>`;
      }
      return `<div class="item step ${how ? 'done' : ''}">
        <button class="check" data-click="step-toggle" data-id="${s.id}" aria-pressed="${!!how}" aria-label="Mark ${esc(s.name)} done">${CHECK}</button>
        ${body}
        ${s.tiny && !how ? `<button class="chip tiny-btn" data-click="step-tiny" data-id="${s.id}">Tiny ✓</button>` : ''}
      </div>`;
    }).join('');

    const templates = TEMPLATES[r].map((t, i) => `
      <div class="tpl">
        <div><b>${t.name}</b><p class="small muted">${t.blurb}</p></div>
        <p class="tpl-steps" aria-hidden="true">${t.steps.map((s) => s[0]).join(' ')}</p>
        <button class="chip strong" data-click="use-template" data-id="${i}">Use this routine</button>
      </div>`).join('');

    const ideas = stackIdeas(r).map(({ st, anchor }) => {
      const lead = anchor ? `After I <b>${esc(anchor.name.charAt(0).toLowerCase() + anchor.name.slice(1))}</b>` : st.lead;
      return `<div class="stack">
        <p class="stack-line">${lead}, I will <b>${esc(st.add[1].charAt(0).toLowerCase() + st.add[1].slice(1))}</b>.</p>
        <p class="small muted">${st.why}</p>
        <div class="stack-actions">
          <button class="chip strong" data-click="add-stack" data-id="${st.id}">+ Add to my routine</button>
          <button class="link" data-click="dismiss-tip" data-id="${st.id}">Not for me</button>
        </div>
      </div>`;
    }).join('');
    const tips = routineTips(r).map((t) => `<p class="tip"><span aria-hidden="true">💡</span><span>${esc(t)}</span></p>`).join('');

    return `
      <div class="seg" role="group" aria-label="Routine">
        <button data-click="routine" data-id="morning" aria-pressed="${r === 'morning'}">☀️ Morning</button>
        <button data-click="routine" data-id="night" aria-pressed="${r === 'night'}">🌙 Night</button>
      </div>

      ${steps.length ? `
        <section class="card hero">
          <p class="hero-num"><strong>${n}</strong> of ${steps.length} steps done</p>
          <div class="bar"><span style="width:${Math.round((n / steps.length) * 100)}%"></span></div>
          <p class="small muted">${entry.complete ? `${meta.label} routine done. Well done! 🌸`
            : streak ? `🔥 ${plural(streak, word)} in a row. Keep it growing!` : 'One step at a time. You’ve got this.'}</p>
          ${entry.complete ? '' : `<button class="btn block" data-click="focus-start" data-id="${r}">▶ ${n ? 'Continue' : 'Start'} focus mode</button>`}
        </section>` : `
        <section class="card">
          <div class="card-h"><div><h2>Plant your ${word} routine 🌱</h2>
            <p class="small muted">A routine is a short list of steps you do in the same order every ${word}. Start with a template, or add your own steps below.</p></div></div>
          <div class="tpls">${templates}</div>
        </section>`}

      <section class="card">
        <div class="card-h"><h2>${meta.icon} ${meta.label} steps</h2>${steps.length ? editBtn('routine') : ''}</div>
        <div class="list">${rows || `<p class="empty">No steps yet.</p>`}</div>
        <form data-submit="add-step">
          <div class="add">
            <select name="emoji" aria-label="Step icon">${STEP_EMOJI.map((e) => `<option>${e}</option>`).join('')}</select>
            <input name="sname" placeholder="${r === 'morning' ? 'e.g. Drink a glass of water' : 'e.g. Phone on the charger'}" maxlength="60" autocomplete="off" required aria-label="Step name">
          </div>
          <div class="add tight">
            <input name="tiny" placeholder="Tiny version for hard days (optional)" maxlength="60" autocomplete="off" aria-label="Tiny version for hard days (optional)">
          </div>
          <button class="btn block">Add step</button>
        </form>
        ${steps.length ? `<button class="link tpl-link" data-click="toggle-templates">${ui.showTemplates ? 'Hide templates' : 'Browse templates'}</button>
          ${ui.showTemplates ? `<div class="tpls">${templates}</div>` : ''}` : ''}
      </section>

      <section class="card">
        <div class="card-h"><h2>🌱 Habit-stacking ideas</h2></div>
        <p class="small muted stack-intro">Habit stacking links a new habit to one you already do: <b>“After I ___, I will ___.”</b> Your existing step becomes the reminder, so you don't have to remember it.</p>
        <div class="list">${ideas || `<p class="empty">${steps.length ? 'No new ideas right now. Your routine is looking great!' : 'Add a few steps and ideas will appear here.'}</p>`}</div>
        ${tips}
      </section>`;
  }

  // ----- Focus mode: one step at a time -----
  let focus = null; // { r, idx, celebrated }

  function nextUndone(r, from) {
    const steps = state.routines[r];
    const e = routineGet(r, routineDay(r, new Date()));
    let i = from;
    while (i < steps.length && e.steps[steps[i].id]) i++;
    return i;
  }

  function openFocus(r) {
    if (!state.routines[r].length) return;
    const first = nextUndone(r, 0);
    focus = { r, idx: first < state.routines[r].length ? first : 0, celebrated: false };
    renderFocus();
    const btn = $('#focus [data-click="focus-done"]');
    if (btn) btn.focus();
  }

  function closeFocus() { focus = null; renderFocus(); }

  function renderFocus() {
    let el = $('#focus');
    if (!focus) {
      if (el) el.remove();
      document.body.classList.remove('focusing');
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'focus';
      el.className = 'focus';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Focus mode');
      document.body.appendChild(el);
    }
    document.body.classList.add('focusing');
    const steps = state.routines[focus.r];
    const meta = ROUTINES[focus.r];
    const e = routineGet(focus.r, routineDay(focus.r, new Date()));
    const top = (label) => `<div class="focus-top"><span class="aff-label">${meta.icon} ${label}</span>
      <button class="focus-x" data-click="focus-close" aria-label="Close focus mode">×</button></div>`;

    if (focus.idx >= steps.length) {
      const done = steps.filter((s) => e.steps[s.id]).length;
      const streak = routineStreak(focus.r, new Date()).current;
      el.innerHTML = `${top(`${meta.label} routine`)}
        <div class="focus-main">
          <div class="focus-emoji">${e.complete ? '🌸' : '🌱'}</div>
          <h2 class="focus-name">${e.complete ? `${meta.label} routine complete!` : 'You showed up, and that counts.'}</h2>
          <p class="focus-tiny">${e.complete
            ? (streak > 1 ? `That’s ${streak} ${focus.r === 'morning' ? 'mornings' : 'nights'} in a row. 🔥` : 'Every routine you finish helps it grow.')
            : `You finished ${done} of ${steps.length} steps. Skipped steps are still on your list if you want to come back.`}</p>
        </div>
        <div class="focus-actions"><button class="btn block" data-click="focus-close">Close</button></div>`;
      if (e.complete && !focus.celebrated) { focus.celebrated = true; petals(); }
      return;
    }

    const s = steps[focus.idx];
    el.innerHTML = `${top(`${meta.label} routine · Step ${focus.idx + 1} of ${steps.length}`)}
      <div class="focus-dots" aria-hidden="true">${steps.map((x, i) => `<span class="${e.steps[x.id] ? 'past' : i === focus.idx ? 'now' : ''}"></span>`).join('')}</div>
      <div class="focus-main">
        <div class="focus-emoji" aria-hidden="true">${esc(s.emoji)}</div>
        <h2 class="focus-name">${esc(s.name)}</h2>
        ${s.tiny ? `<p class="focus-tiny">Hard day? Tiny version: <b>${esc(s.tiny)}</b></p>` : ''}
      </div>
      <div class="focus-actions">
        <button class="btn block" data-click="focus-done">Done ✓</button>
        ${s.tiny ? '<button class="chip block-chip" data-click="focus-tiny">I did the tiny version</button>' : ''}
        <button class="link" data-click="focus-skip">Skip for now</button>
      </div>`;
  }

  function focusAdvance(how) {
    const s = state.routines[focus.r][focus.idx];
    if (how) {
      markStep(focus.r, s.id, how);
      save();
      render();
    }
    focus.idx = nextUndone(focus.r, focus.idx + 1);
    renderFocus();
    if (how) checkMedals();
  }

  // ---------- Medals ----------
  const TIERS = [
    { name: 'Seed', emoji: '🌱' },
    { name: 'Sprout', emoji: '🌿' },
    { name: 'Bud', emoji: '🌷' },
    { name: 'Bloom', emoji: '🌸' },
    { name: 'Bouquet', emoji: '💐' },
  ];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const MEDAL_FAMILIES = [
    {
      id: 'habit', title: 'Habit streak', icon: '✅', streak: true, steps: [3, 7, 14, 30, 100], short: 'days',
      now: (v) => `${plural(v, 'day')} in a row now`,
      desc: (n) => `keep any habit going ${n} days in a row`,
      done: (n) => `You kept a habit going ${n} days in a row.`,
    },
    {
      id: 'water', title: 'Hydration streak', icon: '💧', streak: true, steps: [3, 7, 14, 30, 100], short: 'days',
      now: (v) => `${plural(v, 'day')} in a row now`,
      desc: (n) => `reach your water goal ${n} days in a row`,
      done: (n) => `You reached your water goal ${n} days in a row. 💧`,
    },
    {
      id: 'workout', title: 'Workout streak', icon: '💪', streak: true, steps: [2, 4, 8, 12, 26], short: 'wks',
      now: (v) => `${plural(v, 'week')} in a row now`,
      desc: (n) => `work out at least once a week for ${n} weeks in a row`,
      done: (n) => `You worked out every week for ${n} weeks in a row. 💪`,
    },
    {
      id: 'morning', title: 'Morning routine', icon: '☀️', streak: true, steps: [3, 7, 14, 30, 100], short: 'days',
      now: (v) => `${plural(v, 'morning')} in a row now`,
      desc: (n) => `finish your morning routine ${n} days in a row`,
      done: (n) => `You finished your morning routine ${n} days in a row. ☀️`,
    },
    {
      id: 'night', title: 'Night routine', icon: '🌙', streak: true, steps: [3, 7, 14, 30, 100], short: 'days',
      now: (v) => `${plural(v, 'night')} in a row now`,
      desc: (n) => `finish your night routine ${n} nights in a row`,
      done: (n) => `You finished your night routine ${n} nights in a row. 🌙`,
    },
    {
      id: 'goals', title: 'Goal getter', icon: '🎯', streak: false, steps: [3, 10, 25, 50, 100], short: 'goals',
      now: (v) => `${v} completed`,
      desc: (n) => `complete ${n} weekly or monthly goals`,
      done: (n) => `You've completed ${n} goals.`,
    },
    {
      id: 'budget', title: 'Budget boss', icon: '👛', streak: true, steps: [2, 4, 8, 12, 26], short: 'wks',
      now: (v) => `${plural(v, 'week')} on budget in a row`,
      desc: (n) => `stay within all your weekly budgets for ${n} weeks in a row`,
      done: (n) => `You stayed within your weekly budgets ${n} weeks in a row.`,
    },
    {
      id: 'savings', title: 'Savings star', icon: '🌟', streak: false, steps: [1, 2, 3, 5, 10], short: 'goals',
      now: (v) => `${v} reached`,
      desc: (n) => `reach ${plural(n, 'savings goal')}`,
      done: (n) => `You've reached ${plural(n, 'savings goal')}. 🎉`,
    },
  ];
  const MEDAL_TOTAL = MEDAL_FAMILIES.length * TIERS.length;
  const medalId = (f, i) => `${f.id}-${i}`;
  const earnedCount = () => MEDAL_FAMILIES.reduce((s, f) => s + f.steps.filter((n, i) => state.medals[medalId(f, i)]).length, 0);

  const dayNum = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };

  // Longest run ever, and the run still going now (counting from this period or the one before).
  function streakInfo(nums, step, nowNum) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let prev = null;
    for (const n of sorted) {
      run = prev !== null && n - prev === step ? run + 1 : 1;
      best = Math.max(best, run);
      prev = n;
    }
    const set = new Set(sorted);
    let current = 0;
    let t = set.has(nowNum) ? nowNum : nowNum - step;
    while (set.has(t)) { current++; t -= step; }
    return { best, current };
  }

  function medalStats(now) {
    const todayNum = dayNum(dkey(now));
    const weekNum = (k) => dayNum(dkey(startOfWeek(parseKey(k))));
    const thisWeek = weekNum(dkey(now));

    let habit = { best: 0, current: 0 };
    state.habits.forEach((h) => {
      const days = Object.keys(state.habitLog).filter((k) => state.habitLog[k].includes(h.id)).map(dayNum);
      const s = streakInfo(days, 1, todayNum);
      habit = { best: Math.max(habit.best, s.best), current: Math.max(habit.current, s.current) };
    });

    const waterDays = Object.keys(state.water).filter((k) => state.water[k] >= state.waterGoal).map(dayNum);
    const workoutWeeks = state.workouts.map((w) => weekNum(w.date));

    // A finished week counts as "on budget" when she logged spending and stayed within every weekly budget.
    const weekly = state.budgets.filter((b) => b.period === 'week');
    const byWeek = {};
    state.txns.filter((t) => t.type === 'expense').forEach((t) => {
      const w = weekNum(t.date);
      if (w < thisWeek) (byWeek[w] = byWeek[w] || []).push(t);
    });
    const onBudgetWeeks = weekly.length ? Object.keys(byWeek).map(Number).filter((w) =>
      weekly.every((b) => total(byWeek[w].filter((t) => t.budgetId === b.id)) <= b.limit)) : [];

    const goalsDone = state.goals.filter((g) => g.done).length;
    const savingsReached = state.savings.filter((g) => savedSoFar(g) >= g.target).length;

    return {
      habit,
      water: streakInfo(waterDays, 1, todayNum),
      workout: streakInfo(workoutWeeks, 7, thisWeek),
      morning: routineStreak('morning', now),
      night: routineStreak('night', now),
      goals: { best: goalsDone, current: goalsDone },
      budget: streakInfo(onBudgetWeeks, 7, thisWeek),
      savings: { best: savingsReached, current: savingsReached },
    };
  }

  // Awards any medals she has newly reached and celebrates them.
  function checkMedals() {
    if (!state.username) return;
    const stats = medalStats(new Date());
    const fresh = [];
    MEDAL_FAMILIES.forEach((f) => f.steps.forEach((n, i) => {
      const id = medalId(f, i);
      if (!state.medals[id] && stats[f.id].best >= n) {
        state.medals[id] = dkey(new Date());
        fresh.push({ f, i });
      }
    }));
    if (!fresh.length) return;
    save();
    render();
    celebrate(fresh);
  }

  const medalBadge = (i, earned, extra = '') =>
    `<span class="medal t${i} ${earned ? '' : 'locked'} ${extra}" aria-hidden="true">${TIERS[i].emoji}</span>`;

  function celebrate(fresh) {
    fresh.sort((a, b) => b.i - a.i);
    const { f, i } = fresh[0];
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = `<div class="dialog medal-card" role="dialog" aria-modal="true" aria-labelledby="medal-title">
        ${medalBadge(i, true, 'big')}
        <p class="aff-label">New medal unlocked</p>
        <h2 id="medal-title">${f.title} · ${TIERS[i].name}</h2>
        <p>${f.done(f.steps[i])}</p>
        ${fresh.length > 1 ? `<p class="small muted">Plus ${plural(fresh.length - 1, 'more medal')}. See them all on your Medals page.</p>` : ''}
        <button class="btn block" data-close>Keep blooming 🌸</button>
      </div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-close]').focus();
    petals();
    if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
  }

  // Falling pink petals (skipped for people who turn off motion).
  function petals() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#f6c4d0', '#eeaabb', '#f9d9e0', '#e3c3b3', '#fbe3e8', '#d98aa1'];
    for (let n = 0; n < 36; n++) {
      const p = document.createElement('span');
      p.className = 'petal';
      const size = 8 + Math.random() * 10;
      p.style.cssText = `left:${Math.random() * 100}vw;width:${size}px;height:${size * 1.3}px;` +
        `background:${colors[n % colors.length]};animation-duration:${2.6 + Math.random() * 2}s;` +
        `animation-delay:${Math.random() * 0.8}s;--dx:${(Math.random() - 0.5) * 160}px;--rot:${Math.random() * 720 - 360}deg`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 5500);
    }
  }

  function medalsSummary() {
    const recent = Object.entries(state.medals)
      .map(([id, date]) => {
        const [fid, i] = id.split('-');
        const f = MEDAL_FAMILIES.find((x) => x.id === fid);
        return f ? { f, i: Number(i), date } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i)
      .slice(0, 5);
    return `
      <section class="card">
        <div class="card-h"><div><h2>🏅 Medals</h2><p class="small muted">${earnedCount()} of ${MEDAL_TOTAL} earned</p></div>
          <button class="link" data-click="open-medals">See all ›</button></div>
        ${recent.length ? `<div class="medal-row">${recent.map(({ f, i }) => `<div class="medal-cell">
            ${medalBadge(i, true)}<span>${f.icon} ${TIERS[i].name}</span></div>`).join('')}</div>`
          : '<p class="empty">Earn your first medal by keeping a habit going 3 days in a row. 🌱</p>'}
      </section>`;
  }

  function viewMedals(now) {
    const stats = medalStats(now);
    const earned = earnedCount();
    const families = MEDAL_FAMILIES.map((f) => {
      const val = f.streak ? stats[f.id].current : stats[f.id].best;
      const next = f.steps.findIndex((n, i) => !state.medals[medalId(f, i)]);
      const target = next >= 0 ? f.steps[next] : 0;
      const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 100;
      return `
        <section class="card">
          <div class="card-h"><h2>${f.icon} ${f.title}</h2><span class="small muted">${f.now(val)}</span></div>
          <div class="medal-row">
            ${f.steps.map((n, i) => {
              const got = !!state.medals[medalId(f, i)];
              return `<div class="medal-cell">${medalBadge(i, got)}<span>${got ? TIERS[i].name : `${n} ${f.short}`}</span></div>`;
            }).join('')}
          </div>
          ${next < 0 ? '<p class="cheer">Every medal earned. Amazing! 💐</p>' : `
            <div class="progress-line medal-progress"><div class="bar"><span style="width:${pct}%"></span></div><span class="small muted">${val}/${target}</span></div>
            <p class="small muted medal-next">Next: ${TIERS[next].emoji} ${TIERS[next].name}. ${f.desc(target).replace(/^./, (c) => c.toUpperCase())}.</p>`}
        </section>`;
    }).join('');
    return `
      <button class="back" data-click="back">‹ Back</button>
      <section class="card">
        <div class="card-h"><div><h2>Your medal garden</h2><p class="small muted">${earned} of ${MEDAL_TOTAL} earned</p></div></div>
        <div class="bar"><span style="width:${Math.round((earned / MEDAL_TOTAL) * 100)}%"></span></div>
        <p class="small muted tier-key">🌱 Seed → 🌿 Sprout → 🌷 Bud → 🌸 Bloom → 💐 Bouquet</p>
      </section>
      ${families}`;
  }

  // ---------- Rendering ----------
  const VIEWS = {
    today: viewToday, goals: viewGoals, workouts: viewWorkouts, money: viewMoney, seeds: viewSeeds,
    week: viewWeek, settings: viewSettings, medals: viewMedals,
  };
  const TITLES = {
    today: 'Today', goals: 'Goals', workouts: 'Workouts', money: 'Money', seeds: 'Seeds',
    week: 'My week', settings: 'Settings', medals: 'Medals',
  };
  // Pages opened from the profile menu (they have a Back link instead of a tab).
  const isSubPage = () => ['settings', 'medals', 'week'].includes(ui.tab);
  function openPage(page) {
    if (!isSubPage()) ui.prevTab = ui.tab;
    ui.tab = page;
    ui.showProfile = false;
    render();
    window.scrollTo(0, 0);
  }
  if (!VIEWS[ui.tab]) ui.tab = 'today';

  function render() {
    const now = new Date();
    const welcome = !state.username;
    applyTheme();
    applyBackground();
    document.body.classList.toggle('welcome', welcome);
    if (welcome) { $('#view').innerHTML = viewWelcome(); return; }
    $('#today-label').textContent = fmt(now, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#page-title').textContent = TITLES[ui.tab];
    const btn = $('#profile-btn');
    btn.textContent = state.username[0].toUpperCase();
    btn.setAttribute('aria-expanded', String(ui.showProfile));
    $('#view').innerHTML = (ui.showProfile && !isSubPage() ? profileCard(false) : '') + VIEWS[ui.tab](now);
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.tab === ui.tab) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }

  function commit() { save(); render(); checkMedals(); }

  // ---------- Actions ----------
  const clicks = {
    'toggle-habit'(id) {
      const k = dkey(new Date());
      const log = state.habitLog[k] || (state.habitLog[k] = []);
      const i = log.indexOf(id);
      if (i >= 0) log.splice(i, 1);
      else { log.push(id); if (navigator.vibrate) navigator.vibrate(10); }
      commit();
    },
    async 'del-habit'(id) {
      const h = state.habits.find((x) => x.id === id);
      if (!h || !(await ask(`Delete "${h.name}"? Its check-ins will be removed too.`))) return;
      state.habits = state.habits.filter((x) => x.id !== id);
      for (const k in state.habitLog) state.habitLog[k] = state.habitLog[k].filter((x) => x !== id);
      if (!state.habits.length) ui.edit.habits = false;
      commit();
    },
    edit(section) { ui.edit[section] = !ui.edit[section]; render(); },
    water(delta) {
      const k = dkey(new Date());
      state.water[k] = Math.max(0, (state.water[k] || 0) + Number(delta));
      commit();
    },
    wgoal(delta) { state.waterGoal = Math.min(20, Math.max(1, state.waterGoal + Number(delta))); commit(); },
    period(p) { ui.goalPeriod = p; ui.edit.goals = false; render(); },
    'toggle-goal'(id) {
      const g = state.goals.find((x) => x.id === id);
      if (g) { g.done = !g.done; commit(); }
    },
    async 'del-goal'(id) {
      if (!(await ask('Delete this goal?'))) return;
      state.goals = state.goals.filter((x) => x.id !== id);
      if (!state.goals.some((g) => g.period === ui.goalPeriod && g.key === goalKey(ui.goalPeriod, new Date()))) ui.edit.goals = false;
      commit();
    },
    carry() {
      const now = new Date();
      const key = goalKey(ui.goalPeriod, now);
      carryOver(ui.goalPeriod, now).forEach((g) => state.goals.push({ id: uid(), text: g.text, period: g.period, key, done: false }));
      commit();
    },
    wtype(type) {
      ui.wType = type;
      document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === type)));
    },
    async 'del-workout'(id) {
      if (!(await ask('Delete this workout?'))) return;
      state.workouts = state.workouts.filter((w) => w.id !== id);
      if (!state.workouts.length) ui.edit.workouts = false;
      commit();
    },
    wnav(delta) { ui.weekOffset = Math.min(0, ui.weekOffset + Number(delta)); render(); },
    'fav-aff'() {
      const aff = affirmationFor(new Date());
      if (!aff) return;
      const i = state.favAff.indexOf(aff.text);
      if (i >= 0) state.favAff.splice(i, 1);
      else { state.favAff.push(aff.text); if (navigator.vibrate) navigator.vibrate(10); }
      commit();
    },
    'toggle-favs'() { ui.showFavs = !ui.showFavs; render(); },
    async unfav(i) {
      if (!(await ask('Remove this affirmation from your favorites?', 'Remove'))) return;
      state.favAff.splice(Number(i), 1);
      commit();
    },
    'edit-name'() {
      ui.editName = true;
      ui.showProfile = false;
      ui.tab = 'today';
      render();
      window.scrollTo(0, 0);
    },
    'open-medals'() { openPage('medals'); },

    // Accounts & backups
    wmode(mode) { ui.welcomeMode = mode; render(); },
    'cloud-panel'(panel) { ui.cloudPanel = panel; render(); },
    async 'sync-now'() { await pushNow(); toast(ui.sync === 'saved' ? 'Saved online ☁️' : syncText()); },
    'backup-download'() {
      const payload = { app: 'bloom', version: 1, exportedAt: new Date().toISOString(), state };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bloom-backup-${state.username || 'me'}-${dkey(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Backup saved to your downloads 💾');
    },
    'backup-restore'() { const input = $('#restore-file'); if (input) input.click(); },
    'open-week'() { ui.weekOffset = 0; openPage('week'); },

    // Seeds
    routine(r) { ui.routine = r; ui.edit.routine = false; ui.showTemplates = false; render(); },
    'step-toggle'(id) {
      const r = currentRoutine(new Date());
      const done = routineGet(r, routineDay(r, new Date())).steps[id];
      const finished = markStep(r, id, done ? null : 'full');
      if (!done && navigator.vibrate) navigator.vibrate(10);
      commit();
      if (finished) { toast(`${ROUTINES[r].label} routine complete! 🌸`); petals(); }
    },
    'step-tiny'(id) {
      const r = currentRoutine(new Date());
      const finished = markStep(r, id, 'tiny');
      commit();
      toast(finished ? `${ROUTINES[r].label} routine complete! 🌸` : 'Tiny version counts. Nice! 🌱');
      if (finished) petals();
    },
    'step-move'(ref) {
      const [id, dir] = ref.split(':');
      const list = state.routines[currentRoutine(new Date())];
      const i = list.findIndex((s) => s.id === id);
      const j = i + Number(dir);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      commit();
    },
    async 'del-step'(id) {
      const r = currentRoutine(new Date());
      const s = state.routines[r].find((x) => x.id === id);
      if (!s || !(await ask(`Remove "${s.name}" from your ${r} routine?`, 'Remove'))) return;
      state.routines[r] = state.routines[r].filter((x) => x.id !== id);
      if (!state.routines[r].length) ui.edit.routine = false;
      commit();
    },
    async 'use-template'(i) {
      const r = currentRoutine(new Date());
      const t = TEMPLATES[r][Number(i)];
      if (state.routines[r].length && !(await ask(`Replace your ${r} steps with “${t.name}”?`, 'Replace'))) return;
      state.routines[r] = t.steps.map(makeStep);
      ui.showTemplates = false;
      commit();
      toast(`“${t.name}” planted. Edit any step to make it yours. 🌱`);
      window.scrollTo(0, 0);
    },
    'toggle-templates'() { ui.showTemplates = !ui.showTemplates; render(); },
    'add-stack'(id) {
      const r = currentRoutine(new Date());
      const idea = stackIdeas(r).find((x) => x.st.id === id);
      if (!idea) return;
      const list = state.routines[r];
      const at = idea.anchor ? list.findIndex((s) => s.id === idea.anchor.id) + 1 : 0;
      list.splice(at, 0, makeStep(idea.st.add));
      commit();
      toast('Added to your routine ✨');
    },
    'dismiss-tip'(id) { state.dismissedTips.push(id); commit(); },
    'focus-start'(r) { openFocus(r || currentRoutine(new Date())); },
    'focus-done'() { focusAdvance('full'); },
    'focus-tiny'() { focusAdvance('tiny'); },
    'focus-skip'() { focusAdvance(null); },
    'focus-close'() { closeFocus(); },
    profile() {
      if (isSubPage()) return;
      ui.showProfile = !ui.showProfile;
      render();
      window.scrollTo(0, 0);
    },
    feedback() { ui.showFeedback = !ui.showFeedback; render(); },
    'copy-email'() {
      const select = () => {
        const range = document.createRange();
        range.selectNodeContents($('#fb-email'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      };
      try {
        navigator.clipboard.writeText(FEEDBACK_EMAIL)
          .then(() => toast('Email address copied'))
          .catch(() => { select(); toast('Selected. Copy it from your keyboard menu.'); });
      } catch (e) {
        select();
        toast('Selected. Copy it from your keyboard menu.');
      }
    },
    'open-settings'() { openPage('settings'); },
    back() { ui.tab = ui.prevTab || 'today'; render(); window.scrollTo(0, 0); },
    theme(t) { state.theme = t; commit(); },
    'bg-floral'() { state.bg = Object.assign({}, state.bg, { type: 'floral' }); commit(); },
    'bg-photo'() { state.bg = Object.assign({}, state.bg, { type: 'photo' }); commit(); },
    'bg-color'(id) { state.bg = Object.assign({}, state.bg, { type: 'solid', color: id }); commit(); },
    'pick-photo'() { const input = $('#bg-file'); if (input) input.click(); },
    async 'remove-photo'() {
      if (!(await ask('Remove your background photo?', 'Remove'))) return;
      try { localStorage.removeItem(PHOTO_KEY); } catch (e) { /* ignore */ }
      bgPhoto = null;
      if (state.bg.type === 'photo') state.bg = Object.assign({}, state.bg, { type: 'floral' });
      commit();
    },
    async 'sign-out'() {
      const message = session
        ? 'Sign out? Your progress is saved online, so you can sign back in any time. Money info is only stored on this device and will be erased from it.'
        : 'Sign out? This erases all your Bloom data on this device: habits, goals, workouts, money and favorites.';
      if (!(await ask(message, 'Sign out'))) return;
      if (session) {
        if (syncMeta.dirty) await pushNow(); // save any last changes first
        try { await api('/auth/v1/logout', { method: 'POST', auth: true }); } catch (e) { /* signing out locally anyway */ }
        saveSession(null);
      }
      clearTimeout(pushTimer);
      syncMeta = { dirty: false, syncedAt: null };
      try {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(TAB_KEY);
        localStorage.removeItem(PHOTO_KEY);
        localStorage.removeItem(SYNC_KEY);
      } catch (e) { /* ignore */ }
      ui.welcomeMode = null;
      ui.cloudPanel = null;
      bgPhoto = null;
      state = defaults();
      state.affSeed = Math.floor(Math.random() * 2147483646) + 1;
      affOrder = null;
      Object.assign(ui, {
        tab: 'today', edit: {}, showProfile: false, showFavs: false, editName: false, openDeposit: null, history: {},
        routine: null, showTemplates: false,
      });
      closeFocus();
      save();
      render();
      window.scrollTo(0, 0);
    },
    'skip-name'() {
      if (state.name === undefined) state.name = '';
      ui.editName = false;
      commit();
    },
    mperiod(p) { ui.moneyPeriod = p; ui.edit.budgets = false; ui.edit.txns = false; render(); },
    txtype(type) {
      ui.txType = type;
      const form = $('[data-submit="add-txn"]');
      form.dataset.type = type;
      form.querySelectorAll('[data-click="txtype"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === type)));
    },
    async 'del-budget'(id) {
      const b = state.budgets.find((x) => x.id === id);
      if (!b || !(await ask(`Delete the "${b.name}" budget? Spending you logged stays in your activity.`))) return;
      state.budgets = state.budgets.filter((x) => x.id !== id);
      if (!state.budgets.some((x) => x.period === ui.moneyPeriod)) ui.edit.budgets = false;
      commit();
    },
    async 'del-txn'(id) {
      if (!(await ask('Delete this entry?'))) return;
      state.txns = state.txns.filter((t) => t.id !== id);
      commit();
    },
    async 'del-saving'(id) {
      const g = state.savings.find((x) => x.id === id);
      if (!g || !(await ask(`Delete the "${g.name}" savings goal and its history?`))) return;
      state.savings = state.savings.filter((x) => x.id !== id);
      if (!state.savings.length) ui.edit.savings = false;
      commit();
    },
    'open-deposit'(id) {
      ui.openDeposit = ui.openDeposit === id ? null : id;
      render();
      const input = $('[data-submit="add-deposit"] input');
      if (input) input.focus();
    },
    'toggle-history'(id) { ui.history[id] = !ui.history[id]; render(); },
    async 'del-deposit'(ref) {
      const [gid, did] = ref.split(':');
      const g = state.savings.find((x) => x.id === gid);
      if (!g || !(await ask('Remove this deposit?', 'Remove'))) return;
      g.deposits = g.deposits.filter((d) => d.id !== did);
      commit();
    },
  };

  const submits = {
    'add-habit'(fd) {
      const name = String(fd.get('habit') || '').trim();
      if (!name) return;
      state.habits.push({ id: uid(), name, emoji: fd.get('emoji') || '✨' });
      commit();
    },
    'add-goal'(fd) {
      const text = String(fd.get('goal') || '').trim();
      if (!text) return;
      state.goals.push({ id: uid(), text, period: ui.goalPeriod, key: goalKey(ui.goalPeriod, new Date()), done: false });
      commit();
    },
    'log-workout'(fd) {
      const minutes = Math.round(Number(fd.get('minutes')));
      const date = String(fd.get('date') || '');
      if (!minutes || minutes < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      state.workouts.push({
        id: uid(), date, type: ui.wType, minutes,
        note: String(fd.get('note') || '').trim(), created: Date.now(),
      });
      commit();
    },
    async 'sign-up'(fd, form) {
      const username = String(fd.get('username') || '').trim().replace(/^@/, '');
      const first = String(fd.get('first') || '').trim().slice(0, 30);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!USERNAME_RE.test(username)) return formError(form, 'Usernames are 3–20 characters: letters, numbers, dots or underscores (no spaces).');
      if (!EMAIL_RE.test(email)) return formError(form, 'Please enter a valid email address.');
      if (password.length < 6) return formError(form, 'Passwords need at least 6 characters.');
      await busy(form, 'Creating your account…', async () => {
        if (!(await api('/rest/v1/rpc/username_available', { method: 'POST', body: { name: username } }))) {
          throw Object.assign(new Error('taken'), { code: '23505' });
        }
        const json = await api(`/auth/v1/signup?redirect_to=${encodeURIComponent(siteUrl())}`, {
          method: 'POST', body: { email, password, data: { username, first_name: first } },
        });
        if (json && json.access_token) {
          storeAuth(json);
          state.username = username;
          state.name = first;
          await afterSignIn();
          toast(`Welcome to Bloom, ${first || '@' + username} 🌸`);
        } else {
          ui.pendingEmail = email;
          ui.welcomeMode = 'confirm';
          render();
        }
      });
    },
    async 'sign-in'(fd, form) {
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!EMAIL_RE.test(email) || !password) return formError(form, 'Enter your email and password.');
      await busy(form, 'Signing in…', async () => {
        storeAuth(await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
        if (await afterSignIn()) toast(`Welcome back${state.name ? `, ${state.name}` : ''} 🌸`);
      });
    },
    async forgot(fd, form) {
      const email = String(fd.get('email') || '').trim();
      if (!EMAIL_RE.test(email)) return formError(form, 'Please enter a valid email address.');
      await busy(form, 'Sending…', async () => {
        await api(`/auth/v1/recover?redirect_to=${encodeURIComponent(siteUrl())}`, { method: 'POST', body: { email } });
        ui.welcomeMode = 'signin';
        render();
        toast('If there’s an account for that email, a reset link is on its way 💌');
      });
    },
    async 'new-password'(fd, form) {
      const password = String(fd.get('password') || '');
      if (password.length < 6) return formError(form, 'Passwords need at least 6 characters.');
      await busy(form, 'Saving…', async () => {
        await api('/auth/v1/user', { method: 'PUT', auth: true, body: { password } });
        ui.recovery = false;
        if (!state.username) await afterSignIn();
        else render();
        toast('Password updated 🌸');
      });
    },
    async 'cloud-signup'(fd, form) {
      const username = String(fd.get('username') || '').trim().replace(/^@/, '');
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!USERNAME_RE.test(username)) return formError(form, 'Usernames are 3–20 characters: letters, numbers, dots or underscores (no spaces).');
      if (!EMAIL_RE.test(email)) return formError(form, 'Please enter a valid email address.');
      if (password.length < 6) return formError(form, 'Passwords need at least 6 characters.');
      await busy(form, 'Creating your account…', async () => {
        if (!(await api('/rest/v1/rpc/username_available', { method: 'POST', body: { name: username } }))) {
          throw Object.assign(new Error('taken'), { code: '23505' });
        }
        state.username = username;
        writeLocal();
        const json = await api(`/auth/v1/signup?redirect_to=${encodeURIComponent(siteUrl())}`, {
          method: 'POST', body: { email, password, data: { username, first_name: state.name || '' } },
        });
        if (json && json.access_token) {
          storeAuth(json);
          await afterSignIn();
          toast('Your progress is now saved online ☁️');
        } else {
          ui.cloudPanel = 'signin';
          render();
          toast(`Check ${email} for a confirmation link, then sign in here 💌`);
        }
      });
    },
    async 'cloud-signin'(fd, form) {
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!EMAIL_RE.test(email) || !password) return formError(form, 'Enter your email and password.');
      await busy(form, 'Signing in…', async () => {
        storeAuth(await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
        if (await afterSignIn()) toast('Signed in. Your progress is saved online ☁️');
      });
    },
    'create-profile'(fd, form) {
      const username = String(fd.get('username') || '').trim().replace(/^@/, '');
      if (!USERNAME_RE.test(username)) {
        formError(form, 'Usernames are 3–20 characters: letters, numbers, dots or underscores (no spaces).');
        return;
      }
      const first = String(fd.get('first') || '').trim().slice(0, 30);
      state.username = username;
      state.name = first;
      ui.tab = 'today';
      try { localStorage.setItem(TAB_KEY, 'today'); } catch (e) { /* ignore */ }
      commit();
      window.scrollTo(0, 0);
      toast(`Welcome to Bloom, ${first || '@' + username} 🌸`);
    },
    'add-step'(fd) {
      const name = String(fd.get('sname') || '').trim();
      if (!name) return;
      state.routines[currentRoutine(new Date())].push({
        id: uid(), name, emoji: fd.get('emoji') || '✨', tiny: String(fd.get('tiny') || '').trim(),
      });
      commit();
    },
    'save-name'(fd) {
      state.name = String(fd.get('first') || '').trim().slice(0, 30);
      ui.editName = false;
      commit();
    },
    'add-budget'(fd) {
      const name = String(fd.get('bname') || '').trim();
      const limit = cents(Number(fd.get('limit')));
      if (!name || !(limit > 0)) return;
      state.budgets.push({ id: uid(), name, emoji: fd.get('emoji') || '✨', limit, period: ui.moneyPeriod });
      commit();
    },
    'add-txn'(fd) {
      const amount = cents(Number(fd.get('amount')));
      const date = String(fd.get('date') || '');
      if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const type = ui.txType;
      state.txns.push({
        id: uid(), type, amount, date, created: Date.now(),
        budgetId: type === 'expense' ? (fd.get('budget') || null) : null,
        note: String(fd.get('note') || '').trim(),
      });
      commit();
    },
    'add-saving'(fd) {
      const name = String(fd.get('sname') || '').trim();
      const target = cents(Number(fd.get('target')));
      if (!name || !(target > 0)) return;
      state.savings.push({ id: uid(), name, emoji: fd.get('emoji') || '🌸', target, deadline: String(fd.get('deadline') || ''), deposits: [] });
      commit();
    },
    'add-deposit'(fd, form) {
      const g = state.savings.find((x) => x.id === form.dataset.id);
      const amount = cents(Number(fd.get('amount')));
      if (!g || !(amount > 0)) return;
      const before = savedSoFar(g);
      g.deposits.push({ id: uid(), amount, date: dkey(new Date()) });
      ui.openDeposit = null;
      commit();
      if (before < g.target && savedSoFar(g) >= g.target) {
        toast(`🎉 You reached your ${g.name} goal!`);
        if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      }
    },
  };

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      ui.tab = tab.dataset.tab;
      try { localStorage.setItem(TAB_KEY, ui.tab); } catch (err) { /* ignore */ }
      render();
      window.scrollTo(0, 0);
      return;
    }
    const el = e.target.closest('[data-click]');
    if (el && !el.disabled && clicks[el.dataset.click]) clicks[el.dataset.click](el.dataset.id);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-submit]');
    if (!form) return;
    e.preventDefault();
    submits[form.dataset.submit](new FormData(form), form);
  });

  async function restoreBackup(file) {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      toast("That file isn't a Bloom backup.");
      return;
    }
    const s = data && (data.state || data);
    if (!s || typeof s !== 'object' || !(s.username || Array.isArray(s.habits))) {
      toast("That file isn't a Bloom backup.");
      return;
    }
    const when = data.exportedAt ? ` from ${new Date(data.exportedAt).toLocaleDateString()}` : '';
    if (!(await ask(`Replace everything on this device with this backup${when}?`, 'Restore'))) return;
    const keepName = session ? state.username : null; // stay on the signed-in account
    state = Object.assign(defaults(), s);
    if (keepName) state.username = keepName;
    if (!state.affSeed) state.affSeed = Math.floor(Math.random() * 2147483646) + 1;
    affOrder = null;
    commit();
    toast('Backup restored 🌸');
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'bg-file') usePhoto(e.target.files[0]);
    if (e.target.id === 'restore-file') { restoreBackup(e.target.files[0]); e.target.value = ''; }
    if (e.target.id === 'veil') save();
  });

  // Live preview while dragging the "Soften" slider.
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'veil') return;
    state.bg.veil = Number(e.target.value) / 100;
    $('#veil-val').textContent = `${e.target.value}%`;
    applyBackground();
  });

  // Escape closes focus mode (unless a pop-up is open on top of it).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focus && !$('.dialog-backdrop')) closeFocus();
  });

  // Refresh when coming back to the app (e.g. the next morning).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (syncMeta.dirty) pushNow(); return; } // save before the app goes to sleep
    render();
    cloudSync();
  });
  window.addEventListener('online', () => cloudSync());

  render();
  checkMedals(); // awards anything already earned (e.g. streaks built before medals existed)
  handleAuthRedirect().then(() => cloudSync());

  // ---------- Offline support ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
