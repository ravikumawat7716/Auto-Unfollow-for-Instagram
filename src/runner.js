/*
 * The unfollow run. It works in the Instagram tab where you pressed Start:
 * open a profile, click Following > Unfollow, wait, open the next profile...
 *
 * Each step is saved before the tab moves to a new page, and picked up again
 * when the new page loads. The tab that runs it is marked in sessionStorage,
 * so other Instagram tabs only show progress.
 */
(function (root) {
  'use strict';
  const IGU = root.IGU;
  const ui = IGU.ui;
  const KEY_RUN = 'igu_run';
  const KEY_BEAT = 'igu_beat';
  const KEY_STOP = 'igu_stop';
  const TOKEN = 'igu_run_token';
  const STALE_MS = 90000;

  const profileUrl = (u) => location.origin + '/' + encodeURIComponent(u) + '/';
  const myToken = () => {
    try {
      return sessionStorage.getItem(TOKEN);
    } catch (e) {
      return null;
    }
  };

  IGU.createRunner = function (deps) {
    // deps: getState, getSettings, saveState, reload, onEvent(type, data)
    let run = null;
    let stopRequested = false;
    let looping = false;
    let beatTimer = null;

    const settings = () => IGU.settingsWithDefaults(deps.getSettings());
    const status = (text) => deps.onEvent('status', { text });
    const get = async (k) => (await chrome.storage.local.get(k))[k];

    async function saveRun() {
      await chrome.storage.local.set({ [KEY_RUN]: run });
    }
    async function beat() {
      if (run && run.active) await chrome.storage.local.set({ [KEY_BEAT]: { token: run.token, t: Date.now() } });
    }

    /** Is a run going on somewhere? { active, mine, fresh, run } */
    async function info() {
      const r = await get(KEY_RUN);
      const b = await get(KEY_BEAT);
      const active = !!(r && r.active);
      const fresh = active && b && b.token === r.token && Date.now() - b.t < STALE_MS;
      return { active, mine: active && myToken() === r.token, fresh: !!fresh, run: r || null };
    }

    async function navigate(url) {
      await saveRun();
      await deps.saveState();
      await beat();
      location.assign(url);
      return 'navigated';
    }

    async function start() {
      await deps.reload();
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try {
        sessionStorage.setItem(TOKEN, token);
      } catch (e) {
        /* ignore */
      }
      await chrome.storage.local.remove(KEY_STOP);
      run = { active: true, token, runId: String(Date.now()), step: 'next', target: null, nextAt: 0, inBatch: 0, errorsInRow: 0, lastUnfollowed: null, startedAt: Date.now() };
      IGU.addLog(deps.getState(), { action: 'Run', result: 'Started', details: 'daily limit ' + settings().dailyCap });
      await deps.saveState();
      await saveRun();
      await beat();
      return resume();
    }

    /** Called on every page load. Carries on if this tab owns an active run. */
    async function resume() {
      if (looping) return false;
      const r = await get(KEY_RUN);
      if (!(r && r.active && myToken() === r.token)) return false;
      run = r;
      stopRequested = (await get(KEY_STOP)) === r.token;
      looping = true;
      deps.onEvent('running', {});
      await beat();
      clearInterval(beatTimer);
      beatTimer = setInterval(beat, 10000);
      try {
        await loop();
      } catch (e) {
        await finish('crashed', String(e && e.message ? e.message : e));
      } finally {
        looping = false;
      }
      return true;
    }

    async function requestStop() {
      const r = await get(KEY_RUN);
      if (!(r && r.active)) return;
      if (myToken() === r.token && looping) {
        stopRequested = true;
        return;
      }
      const b = await get(KEY_BEAT);
      const fresh = b && b.token === r.token && Date.now() - b.t < STALE_MS;
      if (fresh) {
        await chrome.storage.local.set({ [KEY_STOP]: r.token }); // the running tab picks this up
      } else {
        run = r;
        await finish('stopped');
      }
    }

    /** A run whose tab was closed: mark it as stopped. */
    async function closeStale() {
      const i = await info();
      if (i.active && !i.mine && !i.fresh) {
        run = i.run;
        await finish('interrupted');
        return true;
      }
      return false;
    }

    function onStorageChange(changes) {
      if (changes[KEY_STOP] && run && changes[KEY_STOP].newValue === run.token) stopRequested = true;
    }

    async function finish(reason, detail) {
      const state = deps.getState();
      state.lastStop = { reason, at: Date.now() };
      if (detail) IGU.addLog(state, { action: 'Run', result: 'Error', details: detail });
      IGU.addLog(state, { action: 'Run', result: 'Stopped', details: IGU.STOP_REASONS[reason] || reason });
      await deps.saveState();
      if (run) {
        run.active = false;
        run.step = 'done';
        await saveRun();
      }
      await chrome.storage.local.remove([KEY_BEAT, KEY_STOP]);
      try {
        sessionStorage.removeItem(TOKEN);
      } catch (e) {
        /* ignore */
      }
      clearInterval(beatTimer);
      deps.onEvent('stopped', { reason });
      return 'finished';
    }

    function line() {
      const s = settings();
      const st = deps.getState();
      const today = st.daily.date === IGU.localDate(Date.now()) ? st.daily.count : 0;
      const left = IGU.analyze(st, s, run && run.runId).counts.toUnfollow;
      return 'Today ' + today + ' of ' + s.dailyCap + '  |  Left ' + left;
    }

    async function countdown(until, label, scroll) {
      let nextScroll = Date.now() + ui.rand(1500, 3500);
      while (!stopRequested) {
        const left = until - Date.now();
        if (left <= 0) break;
        status(label + ': ' + Math.ceil(left / 1000) + 's\n' + line());
        if (scroll && Date.now() >= nextScroll) {
          ui.scrollFeed();
          nextScroll = Date.now() + ui.rand(2500, 6000);
        }
        await ui.sleep(Math.min(1000, left));
      }
    }

    // ---------- the steps ----------

    async function loop() {
      for (;;) {
        if (stopRequested) return finish('stopped');
        const s = settings();
        const state = deps.getState();
        switch (run.step) {
          case 'next': {
            const today = IGU.localDate(Date.now());
            if (state.daily.date !== today) state.daily = { date: today, count: 0 };
            if (state.daily.count >= s.dailyCap) return finish('daily_cap');
            const queue = IGU.analyze(state, s, run.runId).queue;
            if (!queue.length) return finish('done');
            run.target = { id: queue[0].id, username: queue[0].username };
            run.step = 'open';
            return navigate(profileUrl(run.target.username));
          }
          case 'open': {
            const res = await openAndUnfollow();
            if (res === 'navigated' || res === 'finished') return res;
            break;
          }
          case 'wait': {
            await countdown(run.nextAt, run.waitLabel || 'Next account', false);
            if (stopRequested) break;
            run.step = 'next';
            await saveRun();
            break;
          }
          case 'verify_go': {
            run.step = 'verify';
            return navigate(profileUrl(run.lastUnfollowed.username));
          }
          case 'verify': {
            const res = await verify();
            if (res === 'finished') return res;
            break;
          }
          case 'break_go': {
            run.step = 'break';
            run.nextAt = Date.now() + IGU.between(s.breakMinSec, s.breakMaxSec) * 1000;
            if (s.browseFeed && location.pathname !== '/') return navigate(location.origin + '/');
            await saveRun();
            break;
          }
          case 'break': {
            if (s.browseFeed && location.pathname === '/') await ui.dismissPopups();
            await countdown(run.nextAt, s.browseFeed ? 'Break, browsing your feed' : 'Break', s.browseFeed);
            if (stopRequested) break;
            run.step = 'next';
            await saveRun();
            break;
          }
          default:
            return finish('crashed', 'Unknown step ' + run.step);
        }
      }
    }

    async function openAndUnfollow() {
      const u = run.target;
      if (location.pathname.replace(/\/+$/, '').toLowerCase() !== '/' + u.username.toLowerCase()) {
        return navigate(profileUrl(u.username));
      }
      status('Opening @' + u.username + '\n' + line());
      const [kind, note] = await unfollowHere(u.username);
      if (stopRequested && kind === 'stopped') return finish('stopped');
      return record(u, kind, note);
    }

    /** The clicks. Returns [kind, note]: unfollowed | already_gone | not_found | failed | limited | auth | stopped */
    async function unfollowHere(username) {
      const stop = () => stopRequested;
      const ready = await ui.waitFor(() => {
        const i = ui.pageInfo();
        return i.btn || i.unavailable || ui.blocked(i) ? i : null;
      }, 20000, 300, stop);
      if (stopRequested) return ['stopped', ''];
      if (!ready) return ['failed', 'Profile did not load'];
      const b = ui.blocked(ready);
      if (b) return b;
      if (ready.unavailable) return ['not_found', 'Account not available (deleted or deactivated)'];
      if (ready.btn === 'Follow Back') return ['already_gone', 'Already not following (they follow you)'];
      if (ready.btn === 'Follow') return ['already_gone', 'Already not following'];
      if (ready.btn === 'Requested') return ['already_gone', 'Only a pending follow request'];

      status('Unfollowing @' + username + '\n' + line());
      await ui.sleep(ui.rand(1200, 3000)); // look at the profile for a moment
      if (stopRequested) return ['stopped', ''];
      const followingBtn = ui.findTarget('following');
      if (!followingBtn) return ['failed', 'The Following button disappeared'];
      await ui.humanClick(followingBtn);

      const item = await ui.waitFor(() => ui.blocked(ui.pageInfo()) || ui.findTarget('Unfollow'), 8000, 250);
      if (Array.isArray(item)) return item;
      if (!item) {
        ui.pressEscape();
        return ['failed', 'The Unfollow option did not appear'];
      }
      await ui.sleep(ui.rand(400, 1200));
      await ui.humanClick(item);

      let clicks = 1;
      const end = Date.now() + 12000;
      while (Date.now() < end) {
        await ui.sleep(400);
        const i = ui.pageInfo();
        const bl = ui.blocked(i);
        if (bl) return bl;
        if (i.btn === 'Follow' || i.btn === 'Follow Back') {
          await ui.sleep(ui.rand(400, 1000));
          return ['unfollowed', i.btn === 'Follow Back' ? 'Note: this account follows you' : ''];
        }
        if (clicks < 2) {
          const confirm = ui.findTarget('Unfollow'); // private accounts ask to confirm
          if (confirm) {
            await ui.sleep(ui.rand(400, 1000));
            await ui.humanClick(confirm);
            clicks++;
          }
        }
      }
      ui.pressEscape();
      return ['failed', 'Clicked Unfollow but the button still shows Following'];
    }

    async function record(u, kind, note) {
      const s = settings();
      const state = deps.getState();
      let acted = false;
      if (kind === 'unfollowed') {
        run.errorsInRow = 0;
        run.inBatch++;
        acted = true;
        const today = IGU.localDate(Date.now());
        if (state.daily.date !== today) state.daily = { date: today, count: 0 };
        state.daily.count++;
        run.lastUnfollowed = { id: u.id, username: u.username };
        IGU.setResult(state, u, 'unfollowed', note, run.runId);
        IGU.addLog(state, { username: u.username, action: 'Unfollow', result: 'Done', details: note });
      } else if (kind === 'already_gone' || kind === 'not_found') {
        run.errorsInRow = 0;
        IGU.setResult(state, u, kind, note, run.runId);
        IGU.addLog(state, { username: u.username, action: 'Check', result: 'Skipped', details: note });
      } else if (kind === 'limited' || kind === 'auth') {
        state.limitedAt = Date.now();
        IGU.addLog(state, { username: u.username, action: 'Unfollow', result: 'Stopped by Instagram', details: note });
        return finish(kind);
      } else {
        run.errorsInRow++;
        IGU.setResult(state, u, 'failed', note, run.runId);
        IGU.addLog(state, { username: u.username, action: 'Unfollow', result: 'Failed', details: note });
      }
      await deps.saveState();
      deps.onEvent('progress', {});
      if (run.errorsInRow >= 3) return finish('errors');

      const capped = state.daily.count >= s.dailyCap;
      const nothingLeft = IGU.analyze(state, s, run.runId).queue.length === 0;
      if (capped || nothingLeft) {
        run.step = 'next';
      } else if (acted && run.inBatch >= s.batchSize) {
        run.inBatch = 0;
        run.step = s.verifyBatch && run.lastUnfollowed ? 'verify_go' : 'break_go';
      } else {
        run.step = 'wait';
        run.waitLabel = acted ? 'Next unfollow' : 'Next account';
        run.nextAt = Date.now() + (acted ? IGU.jitter(s.delaySec, s.jitterPct) : ui.rand(2, 5)) * 1000;
      }
      await saveRun();
      return 'ok';
    }

    /** Reopened the last unfollowed profile: did Instagram keep the unfollow? */
    async function verify() {
      const u = run.lastUnfollowed;
      const state = deps.getState();
      if (location.pathname.replace(/\/+$/, '').toLowerCase() !== '/' + u.username.toLowerCase()) {
        return navigate(profileUrl(u.username));
      }
      status('Checking @' + u.username + ' stayed unfollowed\n' + line());
      const i = await ui.waitFor(() => {
        const p = ui.pageInfo();
        return p.btn || p.unavailable || ui.blocked(p) ? p : null;
      }, 20000, 300, () => stopRequested);
      if (stopRequested) return 'ok';
      if (!i) {
        IGU.addLog(state, { username: u.username, action: 'Verify', result: 'Skipped', details: 'Profile did not load' });
        run.step = 'break_go';
        await saveRun();
        return 'ok';
      }
      const bl = ui.blocked(i);
      if (bl) {
        state.limitedAt = Date.now();
        IGU.addLog(state, { username: u.username, action: 'Verify', result: 'Stopped by Instagram', details: bl[1] });
        return finish(bl[0]);
      }
      if (i && i.btn === 'Following') {
        state.limitedAt = Date.now();
        IGU.setResult(state, u, 'failed', 'Instagram undid the unfollow', run.runId);
        IGU.addLog(state, { username: u.username, action: 'Verify', result: 'Instagram undid it', details: 'Unfollows are being reversed, which means Instagram is limiting you' });
        return finish('limited');
      }
      IGU.addLog(state, { username: u.username, action: 'Verify', result: 'OK', details: 'Still unfollowed after reload' });
      await deps.saveState();
      run.step = 'break_go';
      await ui.sleep(ui.rand(1000, 2000));
      await saveRun();
      return 'ok';
    }

    return { start, resume, requestStop, closeStale, info, onStorageChange, isLooping: () => looping, keys: { KEY_RUN, KEY_BEAT, KEY_STOP } };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
