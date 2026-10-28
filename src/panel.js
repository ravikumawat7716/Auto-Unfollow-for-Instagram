/*
 * The on-page panel on instagram.com, plus storage and downloads.
 * Runs in your normal Chrome, where you are already logged in.
 */
(function () {
  'use strict';
  if (window.top !== window || window.__iguLoaded) return;
  window.__iguLoaded = true;

  const IGU = globalThis.IGU;
  const KEY_STATE = 'igu_state';
  const KEY_SETTINGS = 'igu_settings';
  const KEY_UI = 'igu_ui';
  const KEY_SCAN = 'igu_scan_lock';
  const LIST_LIMIT = 400;

  let state = IGU.newState();
  let settings = IGU.settingsWithDefaults({});
  let scanning = false;
  let scanStop = false;
  let running = false; // this tab is running the unfollow run
  let elsewhere = false; // another tab is running it
  let statusText = 'Ready. Press "Scan lists" to start.';
  let notes = [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- storage ----------
  async function loadAll() {
    const got = await chrome.storage.local.get([KEY_STATE, KEY_SETTINGS]);
    state = IGU.migrate(Object.assign(IGU.newState(), got[KEY_STATE] || {}));
    settings = IGU.settingsWithDefaults(got[KEY_SETTINGS]);
  }
  const saveState = () => chrome.storage.local.set({ [KEY_STATE]: state });
  const saveSettings = () => chrome.storage.local.set({ [KEY_SETTINGS]: settings });

  // ---------- runner ----------
  const runner = IGU.createRunner({
    getState: () => state,
    getSettings: () => settings,
    saveState,
    reload: loadAll,
    onEvent: (type, d) => {
      if (type === 'status') {
        statusText = d.text;
        renderStatus();
      } else if (type === 'running') {
        running = true;
        renderAll();
      } else if (type === 'progress') {
        renderAll();
      } else if (type === 'stopped') {
        running = false;
        statusText = IGU.STOP_REASONS[d.reason] || 'Stopped.';
        renderAll();
        if (settings.autoExport && d.reason !== 'stopped' && d.reason !== 'interrupted') exportExcel();
      }
    }
  });

  // ---------- UI ----------
  const host = document.createElement('div');
  host.id = 'igu-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
<style>
  :host { all: initial; }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  svg { display: block; flex: none; }
  .wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; color: var(--label); font-size: 13px; line-height: 1.38; letter-spacing: -0.08px;
    --glass: rgba(242,242,247,.78); --card: #ffffff; --fill: rgba(118,118,128,.12); --fill2: rgba(118,118,128,.2);
    --label: #000000; --label2: rgba(60,60,67,.6); --label3: rgba(60,60,67,.3); --sep: rgba(60,60,67,.18); --hair: rgba(0,0,0,.08);
    --blue: #007aff; --red: #ff3b30; --green: #34c759; --orange: #ff9500; --shadow: 0 0 0 .5px rgba(0,0,0,.06), 0 22px 60px rgba(0,0,0,.2), 0 6px 16px rgba(0,0,0,.08); }
  @media (prefers-color-scheme: dark) {
    .wrap { --glass: rgba(28,28,30,.78); --card: rgba(58,58,60,.6); --fill: rgba(118,118,128,.24); --fill2: rgba(118,118,128,.36);
      --label: #ffffff; --label2: rgba(235,235,245,.6); --label3: rgba(235,235,245,.3); --sep: rgba(84,84,88,.6); --hair: rgba(255,255,255,.1);
      --blue: #0a84ff; --red: #ff453a; --green: #30d158; --orange: #ff9f0a; --shadow: 0 0 0 .5px rgba(255,255,255,.08), 0 22px 60px rgba(0,0,0,.55); }
  }
  .glass { background: var(--glass); -webkit-backdrop-filter: blur(40px) saturate(180%); backdrop-filter: blur(40px) saturate(180%); }

  /* collapsed capsule */
  .pill { display: flex; align-items: center; gap: 8px; padding: 8px 16px 8px 8px; border-radius: 999px; border: .5px solid var(--hair); box-shadow: var(--shadow);
    font-weight: 600; font-size: 13px; cursor: pointer; user-select: none; max-width: min(340px, calc(100vw - 40px)); transition: transform .2s cubic-bezier(.2,.8,.2,1); }
  .pill:hover { transform: scale(1.03); }
  .pill:active { transform: scale(.97); }
  .pill .logo { width: 28px; height: 28px; border-radius: 50%; background: var(--blue); color: #fff; display: grid; place-items: center; }
  .pill #pillText { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex: none; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }

  /* panel */
  .panel { width: 384px; max-width: calc(100vw - 40px); max-height: calc(100vh - 40px); max-height: calc(100dvh - 40px); overflow: auto; overscroll-behavior: contain;
    border-radius: 22px; border: .5px solid var(--hair); box-shadow: var(--shadow); animation: pop .32s cubic-bezier(.2,.9,.25,1.1); transform-origin: bottom right; scrollbar-width: thin; }
  @keyframes pop { from { opacity: 0; transform: scale(.92) translateY(8px); } }
  header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 10px; position: sticky; top: 0; z-index: 2; background: var(--glass);
    -webkit-backdrop-filter: blur(40px) saturate(180%); backdrop-filter: blur(40px) saturate(180%); }
  .head-text { flex: 1; min-width: 0; }
  .title { font-weight: 700; font-size: 20px; letter-spacing: -.45px; line-height: 1.15; }
  .acct { color: var(--label2); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: 1em; }

  button { font: inherit; color: inherit; border: none; background: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  button:disabled { opacity: .35; cursor: default; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible, .seg input:focus-visible + span { outline: 3px solid color-mix(in srgb, var(--blue) 45%, transparent); outline-offset: 1px; }
  .round { width: 30px; height: 30px; border-radius: 50%; background: var(--fill); color: var(--label2); display: grid; place-items: center; transition: background .15s; }
  .round:hover { background: var(--fill2); }

  .sec { padding: 0 16px 12px; }
  .card { background: var(--card); border-radius: 14px; }
  .status { padding: 11px 13px; font-weight: 500; white-space: pre-line; }
  .alert { border-radius: 12px; padding: 10px 12px; margin-top: 8px; white-space: pre-line; font-size: 12.5px; }
  .alert.warn { background: color-mix(in srgb, var(--orange) 16%, transparent); color: color-mix(in srgb, var(--orange) 70%, var(--label)); }
  .alert.err { background: color-mix(in srgb, var(--red) 14%, transparent); color: color-mix(in srgb, var(--red) 80%, var(--label)); }
  .alert.info { background: color-mix(in srgb, var(--blue) 12%, transparent); color: color-mix(in srgb, var(--blue) 75%, var(--label)); }

  /* stats */
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .stat { background: var(--card); border-radius: 12px; padding: 8px 9px; min-width: 0; }
  .stat .k { color: var(--label2); font-size: 10.5px; font-weight: 500; line-height: 1.2; min-height: 2.4em; }
  .stat .v { font-size: 18px; font-weight: 700; letter-spacing: -.4px; font-variant-numeric: tabular-nums; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat .v small { font-size: 11px; color: var(--label2); font-weight: 500; letter-spacing: 0; }
  .bar { height: 6px; background: var(--fill); border-radius: 6px; overflow: hidden; margin-top: 10px; }
  .bar > div { height: 100%; background: var(--green); width: 0; border-radius: 6px; transition: width .6s cubic-bezier(.2,.8,.2,1); }

  /* actions */
  .actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .actions button { background: var(--card); border-radius: 14px; padding: 11px 4px 9px; display: flex; flex-direction: column; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 600; color: var(--blue); transition: transform .12s, filter .15s; }
  .actions button:hover:not(:disabled) { filter: brightness(.96); }
  .actions button:active:not(:disabled) { transform: scale(.95); }
  .actions button.primary { background: var(--blue); color: #fff; }
  .actions button.danger { color: var(--red); }

  /* grouped sections */
  .label { color: var(--label2); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .3px; padding: 6px 4px 6px; }
  details { margin: 0 16px 12px; background: var(--card); border-radius: 14px; overflow: hidden; }
  summary { list-style: none; cursor: pointer; font-weight: 600; font-size: 14px; padding: 12px 14px; display: flex; align-items: center; gap: 6px; user-select: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: ''; margin-left: auto; width: 7px; height: 7px; border: solid var(--label3); border-width: 0 2px 2px 0; transform: rotate(-45deg); transition: transform .2s; }
  details[open] > summary::after { transform: rotate(45deg) translate(-2px, -2px); }
  #listCount { color: var(--label2); font-weight: 500; }

  .cell { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: .5px solid var(--sep); font-size: 13px; cursor: default; }
  .cell > span { flex: 1; min-width: 0; }
  .cell small { display: block; color: var(--label2); font-size: 11.5px; }
  .cell input[type=number] { width: 72px; text-align: right; }
  .cell.stack { flex-direction: column; align-items: stretch; gap: 6px; }
  input[type=number], input[type=text], textarea { font: inherit; color: var(--label); background: var(--fill); border: none; border-radius: 9px; padding: 7px 10px; width: 100%; outline: none; }
  input::placeholder, textarea::placeholder { color: var(--label3); }
  textarea { resize: vertical; min-height: 64px; }

  /* iOS switch */
  .switch { appearance: none; -webkit-appearance: none; width: 42px; height: 26px; border-radius: 999px; background: var(--fill2); position: relative; cursor: pointer; flex: none; margin: 0; transition: background .2s; }
  .switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,.2), 0 0 0 .5px rgba(0,0,0,.04); transition: transform .22s cubic-bezier(.3,.7,.3,1.2); }
  .switch:checked { background: var(--green); }
  .switch:checked::after { transform: translateX(16px); }

  /* segmented control */
  .listtools { display: grid; gap: 8px; padding: 0 14px 8px; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--fill); border-radius: 9px; padding: 2px; }
  .seg label { position: relative; }
  .seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .seg span { display: block; text-align: center; padding: 5px 4px; border-radius: 7px; font-size: 12.5px; font-weight: 500; transition: background .2s, box-shadow .2s; }
  .seg input:checked + span { background: var(--card); font-weight: 600; box-shadow: 0 3px 8px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.04); }
  @media (prefers-color-scheme: dark) { .seg input:checked + span { background: #636366; } }
  .hint { color: var(--label2); font-size: 11.5px; padding: 0 14px 8px; }

  /* account list */
  .list { max-height: 280px; overflow: auto; border-top: .5px solid var(--sep); overscroll-behavior: contain; }
  .row { display: grid; grid-template-columns: 24px 1fr auto; gap: 10px; align-items: center; padding: 8px 14px; position: relative; }
  .row + .row::before { content: ''; position: absolute; top: 0; left: 48px; right: 0; border-top: .5px solid var(--sep); }
  .row > div { min-width: 0; }
  .row a { color: var(--label); text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
  .row a:hover { color: var(--blue); }
  .row .n { color: var(--label2); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tick { color: var(--blue); display: inline-block; vertical-align: -2px; }
  .row input[type=checkbox] { appearance: none; -webkit-appearance: none; width: 22px; height: 22px; margin: 0; border-radius: 50%; border: 1.5px solid var(--label3); cursor: pointer; display: grid; place-items: center; transition: background .15s, border-color .15s; }
  .row input[type=checkbox]:checked { background: var(--blue); border-color: var(--blue); }
  .row input[type=checkbox]:checked::after { content: ''; width: 5px; height: 10px; border: solid #fff; border-width: 0 2px 2px 0; transform: translateY(-1px) rotate(45deg); }
  .row input[type=checkbox]:disabled { cursor: default; opacity: .45; }
  .chip { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: var(--fill); color: var(--label2); white-space: nowrap; }
  .chip.todo { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }
  .chip.done { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
  .chip.kept { color: var(--blue); background: color-mix(in srgb, var(--blue) 12%, transparent); }
  .empty { padding: 18px 14px; color: var(--label2); text-align: center; }

  /* activity */
  .log { padding: 4px 0; font-size: 12px; color: var(--label2); }
  .log div { padding: 6px 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .log div + div { border-top: .5px solid var(--sep); }
  .foot { padding: 4px 20px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 11.5px; color: var(--label2); }
  button.link { color: var(--red); font-size: 12.5px; font-weight: 500; padding: 4px 0; }

  /* phones and narrow windows: bottom sheet */
  @media (max-width: 560px) {
    .wrap { right: 12px; bottom: calc(68px + env(safe-area-inset-bottom)); }
    .wrap.open { left: 0; right: 0; bottom: 0; }
    .panel { width: 100%; max-width: none; max-height: 88vh; max-height: 88dvh; border-radius: 22px 22px 0 0; border-bottom: none; transform-origin: bottom center;
      padding-bottom: env(safe-area-inset-bottom); animation-name: sheet; }
    @keyframes sheet { from { transform: translateY(40%); opacity: 0; } }
    header::before { content: ''; position: absolute; top: 6px; left: 50%; width: 36px; height: 5px; margin-left: -18px; border-radius: 3px; background: var(--label3); }
    .list { max-height: 40vh; }
    .round { width: 34px; height: 34px; }
  }
  @media (max-width: 350px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .stat .k { min-height: 0; }
    .actions { gap: 6px; }
    .actions button { font-size: 11px; }
  }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
<div class="wrap" id="wrap">
  <div class="pill glass" id="pill" role="button" tabindex="0" title="Open Auto Unfollow for Instagram">
    <span class="logo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 11h6"/></svg></span>
    <span class="dot" id="pillDot" hidden></span><span id="pillText">Auto Unfollow</span>
  </div>
  <div class="panel glass" id="panel" hidden>
    <header>
      <div class="head-text">
        <div class="title">Auto Unfollow</div>
        <div class="acct" id="acct"></div>
      </div>
      <button class="round" id="min" title="Minimise" aria-label="Minimise"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
    </header>
    <div class="sec">
      <div class="status card" id="status"></div>
      <div id="alerts"></div>
    </div>
    <div class="sec"><div class="grid" id="stats"></div><div class="bar"><div id="barFill"></div></div></div>
    <div class="sec actions">
      <button id="scan"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg><span>Scan lists</span></button>
      <button id="start" class="primary"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/></svg><span>Start</span></button>
      <button id="stop" class="danger"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg><span>Stop</span></button>
      <button id="export"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span>Excel</span></button>
    </div>
    <details id="listDetails" open>
      <summary>Not following you back <span id="listCount"></span></summary>
      <div class="listtools">
        <input type="text" id="search" placeholder="Search username or name">
        <div class="seg" id="filter" role="radiogroup" aria-label="Filter">
          <label><input type="radio" name="filter" value="review" checked><span>To review</span></label>
          <label><input type="radio" name="filter" value="all"><span>All</span></label>
          <label><input type="radio" name="filter" value="done"><span>Done</span></label>
        </div>
      </div>
      <div class="hint">Tick anyone you still want to follow to keep them.</div>
      <div class="list" id="list"></div>
    </details>
    <details id="setDetails">
      <summary>Settings</summary>
      <label class="cell"><span>Wait between unfollows<small>seconds</small></span><input type="number" min="3" step="1" data-s="delaySec"></label>
      <label class="cell"><span>Unfollows before a break</span><input type="number" min="1" step="1" data-s="batchSize"></label>
      <label class="cell"><span>Shortest break<small>seconds</small></span><input type="number" min="10" step="5" data-s="breakMinSec"></label>
      <label class="cell"><span>Longest break<small>seconds</small></span><input type="number" min="10" step="5" data-s="breakMaxSec"></label>
      <label class="cell"><span>Max unfollows per day<small>Use 5 for a first test</small></span><input type="number" min="1" step="1" data-s="dailyCap"></label>
      <label class="cell"><span>Check each batch stuck<small>Reopens the last profile after each batch (safer)</small></span><input type="checkbox" class="switch" data-s="verifyBatch"></label>
      <label class="cell"><span>Scroll home feed during breaks</span><input type="checkbox" class="switch" data-s="browseFeed"></label>
      <label class="cell"><span>Keep verified accounts</span><input type="checkbox" class="switch" data-s="keepVerified"></label>
      <label class="cell"><span>Download Excel when a run stops</span><input type="checkbox" class="switch" data-s="autoExport"></label>
      <label class="cell stack"><span>Always keep these accounts<small>Usernames, one per line</small></span>
        <textarea rows="3" data-s="whitelist" placeholder="best_friend&#10;@my_cousin"></textarea></label>
    </details>
    <div class="sec">
      <div class="label">Recent activity</div>
      <div class="log card" id="log"></div>
    </div>
    <div class="foot"><span>Data stays in this browser only.</span><button class="link" id="reset">Reset All Data</button></div>
  </div>
</div>`;

  const $ = (id) => shadow.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const timeOnly = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const busy = () => scanning || running || elsewhere;
  const VERIFIED = '<svg class="tick" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified"><path d="M12 1.5l2.6 2 3.3-.3 1 3.1 2.8 1.8-1 3.1 1 3.1-2.8 1.8-1 3.1-3.3-.3-2.6 2-2.6-2-3.3.3-1-3.1L2.3 14.4l1-3.1-1-3.1 2.8-1.8 1-3.1 3.3.3z"/><path d="m8 12.2 2.7 2.7L16.2 9.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function setOpen(open) {
    $('panel').hidden = !open;
    $('pill').hidden = open;
    $('wrap').classList.toggle('open', open);
    chrome.storage.local.set({ [KEY_UI]: { open } });
  }

  function renderStatus() {
    const text = elsewhere && !running ? 'Running in another Instagram tab. You can watch it there, or press Stop.' : statusText;
    $('status').textContent = text;
    $('pillDot').hidden = !(running || scanning || elsewhere);
    $('pillText').textContent = running || scanning ? text.split('\n')[0] : 'Auto Unfollow';
  }

  function renderAlerts() {
    const box = $('alerts');
    box.innerHTML = '';
    if (busy() || !state.scannedAt) return;
    const pf = IGU.preflight(state, IGU.api.viewerId(), Date.now());
    if (pf.blockers.length) box.insertAdjacentHTML('beforeend', '<div class="alert err">' + esc(pf.blockers.join('\n')) + '</div>');
    if (pf.warnings.length) box.insertAdjacentHTML('beforeend', '<div class="alert warn">' + esc(pf.warnings.join('\n')) + '</div>');
    const info = pf.notes.concat(notes);
    if (info.length) box.insertAdjacentHTML('beforeend', '<div class="alert info">' + esc(info.join('\n')) + '</div>');
  }

  function renderStats(c) {
    const p = state.profile || {};
    const today = state.daily.date === IGU.localDate(Date.now()) ? state.daily.count : 0;
    const withProfile = (scanned, prof) => (prof != null && prof !== scanned ? scanned + ' <small>/ ' + prof + '</small>' : String(scanned));
    const items = [
      ['Following', state.scannedAt ? withProfile(c.following, p.following) : '-'],
      ['Followers', state.scannedAt ? withProfile(c.followers, p.followers) : '-'],
      ['Mutual', state.scannedAt ? c.mutual : '-'],
      ['Not following back', state.scannedAt ? c.notBack : '-'],
      ['Kept', c.kept],
      ['Unfollowed', c.unfollowed],
      ['Left to unfollow', state.scannedAt ? c.toUnfollow : '-'],
      ['Today', today + ' <small>/ ' + settings.dailyCap + '</small>']
    ];
    $('stats').innerHTML = items.map(([k, v]) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>').join('');
    const total = c.unfollowed + c.toUnfollow;
    $('barFill').style.width = total ? Math.round((c.unfollowed / total) * 100) + '%' : '0%';
  }

  function chipClass(status) {
    if (status === 'To unfollow') return 'todo';
    if (status === 'Unfollowed') return 'done';
    if (status.indexOf('Kept') === 0) return 'kept';
    return '';
  }

  function renderList(rows) {
    const list = $('list');
    const scroll = list.scrollTop;
    const q = $('search').value.trim().toLowerCase().replace(/^@/, '');
    const f = shadow.querySelector('input[name="filter"]:checked').value;
    const notBack = rows.filter((r) => !r.followsYou);
    $('listCount').textContent = state.scannedAt ? '(' + notBack.length + ')' : '';
    let shown = notBack.filter((r) => {
      const isDone = !(r.status === 'To unfollow' || r.status.indexOf('Kept') === 0);
      if (f === 'review' && isDone) return false;
      if (f === 'done' && !isDone) return false;
      if (q && r.username.toLowerCase().indexOf(q) < 0 && r.full_name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    const total = shown.length;
    shown = shown.slice(0, LIST_LIMIT);
    if (!state.scannedAt) {
      list.innerHTML = '<div class="empty">Press "Scan lists" to load your accounts.</div>';
      return;
    }
    if (!total) {
      list.innerHTML = '<div class="empty">Nothing here.</div>';
      return;
    }
    list.innerHTML =
      shown
        .map((r) => {
          const lockedKeep = r.status === 'Kept (keep list)' || r.status === 'Kept (verified)' || r.status === 'Kept (followed again)';
          const done = !(r.status === 'To unfollow' || r.status.indexOf('Kept') === 0);
          const checked = r.status.indexOf('Kept') === 0 ? 'checked' : '';
          const disabled = done || lockedKeep || scanning ? 'disabled' : '';
          return (
            '<div class="row"><input type="checkbox" title="Keep" data-id="' + esc(r.id) + '" ' + checked + ' ' + disabled + '>' +
            '<div><a href="https://www.instagram.com/' + esc(r.username) + '/" target="_blank" rel="noopener">@' + esc(r.username) + '</a>' +
            (r.is_verified ? VERIFIED : '') + '<div class="n">' + esc(r.full_name || ' ') + '</div></div>' +
            '<span class="chip ' + chipClass(r.status) + '">' + esc(r.status) + '</span></div>'
          );
        })
        .join('') + (total > LIST_LIMIT ? '<div class="empty">Showing ' + LIST_LIMIT + ' of ' + total + '. Use search to find others.</div>' : '');
    list.scrollTop = scroll;
  }

  function renderLog() {
    const last = state.log.slice(-6).reverse();
    $('log').innerHTML = last.length
      ? last.map((e) => '<div>' + esc(timeOnly(e.t) + '  ' + (e.username ? '@' + e.username + '  ' : '') + e.action + ': ' + e.result + (e.details ? ' (' + e.details + ')' : '')) + '</div>').join('')
      : '<div>No activity yet.</div>';
  }

  function renderSettings() {
    shadow.querySelectorAll('[data-s]').forEach((el) => {
      if (shadow.activeElement === el) return;
      const k = el.dataset.s;
      if (el.type === 'checkbox') el.checked = !!settings[k];
      else el.value = settings[k];
    });
  }

  function renderButtons() {
    $('scan').disabled = busy();
    $('start').disabled = busy() || !state.scannedAt;
    $('stop').disabled = !(running || scanning || elsewhere);
    $('reset').disabled = busy();
    $('scan').querySelector('span').textContent = state.scannedAt ? 'Rescan' : 'Scan lists';
  }

  function renderAll() {
    const a = IGU.analyze(state, settings);
    const v = state.viewer;
    $('acct').textContent = v ? (v.username ? '@' + v.username : 'id ' + v.id) : '';
    renderStatus();
    renderAlerts();
    renderStats(a.counts);
    renderButtons();
    renderList(a.rows);
    renderLog();
  }

  // ---------- actions ----------
  async function onScan() {
    if (busy()) return;
    if (!IGU.api.viewerId()) {
      statusText = 'Log in to Instagram first, then press Scan.';
      return renderAll();
    }
    const lock = (await chrome.storage.local.get(KEY_SCAN))[KEY_SCAN];
    if (lock && Date.now() - lock < 10 * 60 * 1000) {
      statusText = 'A scan is already running in another Instagram tab.';
      return renderAll();
    }
    await chrome.storage.local.set({ [KEY_SCAN]: Date.now() });
    scanning = true;
    scanStop = false;
    statusText = 'Reading your profile...';
    renderAll();
    await loadAll();
    try {
      const scan = await IGU.scan({
        api: IGU.api,
        sleep,
        isStopped: () => scanStop,
        getUsername: async () => (await IGU.api.myUsername(10000)) || (window.prompt('Type your Instagram username:') || '').trim().replace(/^@/, '') || null,
        onProgress: (p) => {
          if (p.phase === 'profile') statusText = 'Reading your profile...';
          else if (p.phase === 'retry') statusText = 'Instagram answered HTTP ' + p.status + ' while reading your ' + p.kind + '. Trying again in ' + p.wait + 's...';
          else statusText = 'Scanning ' + p.phase + ': ' + p.count + (p.total ? ' of ' + p.total : '');
          renderStatus();
        }
      });
      IGU.applyScan(state, scan);
      const c = IGU.analyze(state, settings).counts;
      IGU.addLog(state, { action: 'Scan', result: 'Done', details: c.following + ' following, ' + c.followers + ' followers, ' + c.notBack + ' not following back' });
      statusText = 'Scan done. ' + c.notBack + ' accounts do not follow you back. Tick anyone you want to keep, then press Start.';
    } catch (e) {
      if (e.kind === 'limited' || e.kind === 'auth') state.limitedAt = Date.now();
      statusText = e.kind === 'stopped' ? 'Scan stopped.' : 'Scan failed: ' + e.message;
      IGU.addLog(state, { action: 'Scan', result: e.kind === 'stopped' ? 'Stopped' : 'Failed', details: e.message });
    }
    await saveState();
    await chrome.storage.local.remove(KEY_SCAN);
    scanning = false;
    renderAll();
  }

  async function onStart() {
    if (busy()) return;
    await loadAll();
    const pf = IGU.preflight(state, IGU.api.viewerId(), Date.now());
    if (!pf.ok) {
      statusText = 'Cannot start yet. See the message below.';
      return renderAll();
    }
    if (pf.warnings.length && !window.confirm(pf.warnings.join('\n\n') + '\n\nStart anyway?')) return;
    statusText = 'Starting...';
    renderAll();
    runner.start();
  }

  async function onStop() {
    if (scanning) scanStop = true;
    if (running || elsewhere) {
      statusText = 'Stopping...';
      renderStatus();
      await runner.requestStop();
    }
  }

  function exportExcel() {
    try {
      const now = Date.now();
      const wb = IGU.buildWorkbook(XLSX, state, settings, now);
      const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = IGU.reportFileName(state, now);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 3000);
    } catch (e) {
      statusText = 'Could not build the Excel file: ' + e.message;
      renderStatus();
    }
  }

  async function onReset() {
    if (busy()) return;
    if (!window.confirm('Delete the saved scan, keep ticks and activity log from this browser? Your settings stay.')) return;
    state = IGU.newState();
    await saveState();
    statusText = 'Data cleared. Press "Scan lists" to start again.';
    renderAll();
  }

  function onSettingChange(e) {
    const el = e.target;
    const k = el.dataset && el.dataset.s;
    if (!k) return;
    if (el.type === 'checkbox') settings[k] = el.checked;
    else if (el.type === 'number') {
      const mins = { delaySec: 3, batchSize: 1, breakMinSec: 10, breakMaxSec: 10, dailyCap: 1 };
      let n = Math.round(Number(el.value));
      if (!Number.isFinite(n)) n = IGU.DEFAULT_SETTINGS[k];
      settings[k] = Math.max(mins[k] || 0, n);
      if (settings.breakMaxSec < settings.breakMinSec) settings.breakMaxSec = settings.breakMinSec;
      el.value = settings[k];
    } else settings[k] = el.value;
    saveSettings();
    renderAll();
  }

  async function onKeepToggle(e) {
    const el = e.target;
    if (!el.dataset || !el.dataset.id) return;
    if (el.checked) state.keep[el.dataset.id] = true;
    else delete state.keep[el.dataset.id];
    await saveState();
    renderAll();
  }

  async function refreshElsewhere() {
    if (running) return;
    const i = await runner.info();
    const before = elsewhere;
    elsewhere = i.active && !i.mine && i.fresh;
    if (i.active && !i.mine && !i.fresh) {
      await runner.closeStale();
      await loadAll();
      statusText = IGU.STOP_REASONS.interrupted;
      elsewhere = false;
      renderAll();
      return;
    }
    if (before !== elsewhere) {
      if (!elsewhere) {
        await loadAll();
        const last = state.lastStop;
        statusText = last ? IGU.STOP_REASONS[last.reason] || 'Stopped.' : statusText;
      }
      renderAll();
    }
  }

  /** Data saved by version 1 has no follower count. Fill it in so the scan can be checked. */
  async function fillMissingCounts() {
    if (!state.scannedAt || (state.profile && state.profile.followers != null)) return;
    let username = state.viewer && state.viewer.username;
    if (!username) username = await IGU.api.myUsername(8000);
    if (!username) return;
    const counts = await IGU.api.profileCounts(username);
    if (counts.followers == null) return;
    await loadAll();
    state.profile = counts;
    if (state.viewer && !state.viewer.username) state.viewer.username = username;
    await saveState();
    renderAll();
  }

  // ---------- wiring ----------
  $('pill').addEventListener('click', () => setOpen(true));
  $('pill').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  });
  $('min').addEventListener('click', () => setOpen(false));
  $('scan').addEventListener('click', onScan);
  $('start').addEventListener('click', onStart);
  $('stop').addEventListener('click', onStop);
  $('export').addEventListener('click', exportExcel);
  $('reset').addEventListener('click', onReset);
  $('search').addEventListener('input', () => renderList(IGU.analyze(state, settings).rows));
  $('filter').addEventListener('change', () => renderList(IGU.analyze(state, settings).rows));
  $('list').addEventListener('change', onKeepToggle);
  shadow.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('change', onSettingChange));

  // Stop Instagram's keyboard shortcuts from firing while typing in the panel.
  ['keydown', 'keyup', 'keypress'].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));

  window.addEventListener('beforeunload', (e) => {
    if (scanning) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    runner.onStorageChange(changes);
    const k = runner.keys;
    if (changes[k.KEY_RUN] || changes[k.KEY_BEAT]) refreshElsewhere();
    if (changes[KEY_SETTINGS] && changes[KEY_SETTINGS].newValue) {
      settings = IGU.settingsWithDefaults(changes[KEY_SETTINGS].newValue);
      renderSettings();
      renderAll();
    }
    if (changes[KEY_STATE] && !scanning && !running) {
      state = IGU.migrate(Object.assign(IGU.newState(), changes[KEY_STATE].newValue || {}));
      renderAll();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'igu_toggle') {
      setOpen($('panel').hidden);
      sendResponse({ ok: true });
    }
  });

  setInterval(refreshElsewhere, 20000);

  (async function init() {
    document.documentElement.appendChild(host);
    await loadAll();
    const ui = (await chrome.storage.local.get(KEY_UI))[KEY_UI];
    if (state.lastStop && state.lastStop.reason === 'daily_cap' && state.daily.date !== IGU.localDate(Date.now())) {
      statusText = 'New day. Press Start to carry on.';
    } else if (state.scannedAt) {
      statusText = 'Ready. Tick anyone you want to keep, then press Start.';
    }
    renderSettings();
    renderAll();
    setOpen(ui ? !!ui.open : true);
    const resumed = await runner.resume();
    if (!resumed) {
      await refreshElsewhere();
      fillMissingCounts();
    }
  })();
})();
