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
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; color: var(--fg); font-size: 13px; line-height: 1.35;
    --bg: #ffffff; --fg: #1c1e21; --muted: #65676b; --line: #e4e6eb; --soft: #f5f6f8; --accent: #0866ff; --danger: #d93025; --ok: #188038; --warn-bg: #fff4e5; --warn-fg: #8a4b00; --err-bg: #fdecea; --err-fg: #a50e0e; --info-bg: #eef3ff; --info-fg: #1d3a8a; }
  @media (prefers-color-scheme: dark) {
    .wrap { --bg: #1f2124; --fg: #e8eaed; --muted: #a0a4a8; --line: #3a3d41; --soft: #2a2d31; --accent: #4c8dff; --danger: #ff6b5f; --ok: #5bd17a; --warn-bg: #3a2c12; --warn-fg: #ffc46b; --err-bg: #3b1716; --err-fg: #ff9b94; --info-bg: #18233d; --info-fg: #a9c1ff; }
  }
  .pill { background: var(--accent); color: #fff; border-radius: 999px; padding: 9px 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); user-select: none; max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #7CFC9A; margin-right: 6px; vertical-align: 1px; }
  .panel { width: 370px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.28); }
  header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; position: sticky; top: 0; background: var(--bg); z-index: 1; }
  .title { font-weight: 700; font-size: 15px; }
  .acct { color: var(--muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { font: inherit; border: 1px solid var(--line); background: var(--soft); color: var(--fg); border-radius: 8px; padding: 7px 10px; cursor: pointer; }
  button:hover:not(:disabled) { filter: brightness(0.96); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  button.icon { padding: 2px 9px; font-weight: 700; }
  button.link { border: none; background: none; color: var(--muted); text-decoration: underline; padding: 0; }
  .sec { padding: 0 14px 10px; }
  .status { background: var(--soft); border-radius: 8px; padding: 8px 10px; font-weight: 500; white-space: pre-line; }
  .alert { border-radius: 8px; padding: 8px 10px; margin-top: 8px; white-space: pre-line; }
  .alert.warn { background: var(--warn-bg); color: var(--warn-fg); }
  .alert.err { background: var(--err-bg); color: var(--err-fg); }
  .alert.info { background: var(--info-bg); color: var(--info-fg); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .stat { border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
  .stat .k { color: var(--muted); font-size: 11px; }
  .stat .v { font-size: 16px; font-weight: 700; }
  .stat .v small { font-size: 11px; color: var(--muted); font-weight: 500; }
  .bar { height: 6px; background: var(--soft); border-radius: 6px; overflow: hidden; margin-top: 8px; }
  .bar > div { height: 100%; background: var(--ok); width: 0; transition: width .4s; }
  .actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  details { border-top: 1px solid var(--line); padding: 8px 14px; }
  summary { cursor: pointer; font-weight: 600; }
  .form { display: grid; gap: 8px; margin-top: 8px; }
  .form label { display: grid; gap: 3px; color: var(--muted); font-size: 12px; }
  .form label.chk { display: flex; align-items: flex-start; gap: 6px; color: var(--fg); font-size: 12.5px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: end; }
  input[type=number], input[type=text], textarea, select { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; width: 100%; }
  textarea { resize: vertical; }
  .listtools { display: grid; grid-template-columns: 1fr 130px; gap: 6px; margin: 8px 0 4px; }
  .hint { color: var(--muted); font-size: 11.5px; margin-bottom: 6px; }
  .list { max-height: 240px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
  .row { display: grid; grid-template-columns: 22px 1fr auto; gap: 6px; align-items: center; padding: 5px 8px; border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: none; }
  .row a { color: var(--fg); text-decoration: none; font-weight: 600; }
  .row a:hover { text-decoration: underline; }
  .row .n { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip { font-size: 10.5px; padding: 2px 6px; border-radius: 999px; background: var(--soft); color: var(--muted); white-space: nowrap; }
  .chip.todo { color: var(--danger); }
  .chip.done { color: var(--ok); }
  .chip.kept { color: var(--accent); }
  .empty { padding: 12px; color: var(--muted); text-align: center; }
  .logtitle { font-weight: 600; padding: 8px 14px 4px; border-top: 1px solid var(--line); }
  .log { padding: 0 14px 6px; color: var(--muted); font-size: 11.5px; }
  .log div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .foot { padding: 6px 14px 12px; display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); }
</style>
<div class="wrap">
  <div class="pill" id="pill" title="Open Auto Unfollow for Instagram"><span class="dot" id="pillDot" hidden></span><span id="pillText">Auto Unfollow</span></div>
  <div class="panel" id="panel" hidden>
    <header>
      <div class="title">Auto Unfollow</div>
      <div class="acct" id="acct"></div>
      <button class="icon" id="min" title="Minimise">&#8211;</button>
    </header>
    <div class="sec">
      <div class="status" id="status"></div>
      <div id="alerts"></div>
    </div>
    <div class="sec"><div class="grid" id="stats"></div><div class="bar"><div id="barFill"></div></div></div>
    <div class="sec actions">
      <button id="scan">Scan lists</button>
      <button id="start" class="primary">Start</button>
      <button id="stop">Stop</button>
      <button id="export">Excel</button>
    </div>
    <details id="setDetails">
      <summary>Settings</summary>
      <div class="form">
        <div class="two">
          <label>Wait between unfollows (sec)<input type="number" min="3" step="1" data-s="delaySec"></label>
          <label>Unfollows before a break<input type="number" min="1" step="1" data-s="batchSize"></label>
        </div>
        <div class="two">
          <label>Break min (sec)<input type="number" min="10" step="5" data-s="breakMinSec"></label>
          <label>Break max (sec)<input type="number" min="10" step="5" data-s="breakMaxSec"></label>
        </div>
        <label>Max unfollows per day (use 5 for a first test)<input type="number" min="1" step="1" data-s="dailyCap"></label>
        <label class="chk"><input type="checkbox" data-s="verifyBatch"> After each batch, reopen the last profile to check the unfollow stuck (safer)</label>
        <label class="chk"><input type="checkbox" data-s="browseFeed"> Scroll my home feed during breaks</label>
        <label class="chk"><input type="checkbox" data-s="keepVerified"> Keep verified accounts (blue tick)</label>
        <label class="chk"><input type="checkbox" data-s="autoExport"> Download the Excel report when a run stops</label>
        <label>Always keep these accounts (usernames, one per line)
          <textarea rows="3" data-s="whitelist" placeholder="best_friend&#10;@my_cousin"></textarea></label>
      </div>
    </details>
    <details id="listDetails" open>
      <summary>Not following you back <span id="listCount"></span></summary>
      <div class="listtools">
        <input type="text" id="search" placeholder="Search username or name">
        <select id="filter">
          <option value="review">To review</option>
          <option value="all">All</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div class="hint">Tick "keep" for anyone you still want to follow.</div>
      <div class="list" id="list"></div>
    </details>
    <div class="logtitle">Recent activity</div>
    <div class="log" id="log"></div>
    <div class="foot"><span>Data stays in this browser only.</span><button class="link" id="reset">Reset all data</button></div>
  </div>
</div>`;

  const $ = (id) => shadow.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const timeOnly = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const busy = () => scanning || running || elsewhere;

  function setOpen(open) {
    $('panel').hidden = !open;
    $('pill').hidden = open;
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
    const f = $('filter').value;
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
            (r.is_verified ? ' &#10004;' : '') + '<div class="n">' + esc(r.full_name || ' ') + '</div></div>' +
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
    $('scan').textContent = state.scannedAt ? 'Rescan' : 'Scan lists';
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
