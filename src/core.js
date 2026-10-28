/*
 * Core logic: settings, saved state, comparing the two lists, scan, safety checks.
 * No page clicking here (see ui.js and runner.js).
 */
(function (root) {
  'use strict';
  const IGU = (root.IGU = root.IGU || {});

  IGU.DEFAULT_SETTINGS = {
    delaySec: 5, // wait between unfollows, randomised by jitterPct
    jitterPct: 30,
    batchSize: 5, // unfollows before a longer break
    breakMinSec: 60,
    breakMaxSec: 120,
    dailyCap: 1000, // max unfollows per calendar day
    verifyBatch: true, // after each batch, reopen the last profile to check the unfollow stuck
    browseFeed: true, // scroll the home feed during breaks
    keepVerified: false,
    autoExport: true, // download the Excel report when a run stops
    whitelist: ''
  };

  IGU.STOP_REASONS = {
    done: 'Finished. Nobody left to unfollow.',
    daily_cap: 'Daily limit reached. Come back tomorrow and press Start again.',
    limited: 'Instagram is limiting your actions, so it stopped to keep your account safe. Wait at least a day before starting again.',
    auth: 'Instagram wants you to log in again or verify your account. Stopped. Sort that out in Instagram first.',
    errors: 'Stopped after 3 problems in a row. See Recent activity, then press Start again.',
    stopped: 'Stopped by you.',
    interrupted: 'The Instagram tab that was running it got closed. Press Start to carry on.',
    crashed: 'Stopped because of an unexpected error. See Recent activity.'
  };

  const RESULT_LABELS = {
    unfollowed: 'Unfollowed',
    already_gone: 'Already not following',
    not_found: 'Account not available',
    failed: 'Failed'
  };
  IGU.RESULT_LABELS = RESULT_LABELS;
  IGU.MAX_ATTEMPTS = 3;

  const DAY = 24 * 60 * 60 * 1000;

  IGU.newState = function () {
    return {
      version: 2,
      viewer: null, // { id, username }
      profile: null, // { followers, followers_exact, following, following_exact }
      scannedAt: null,
      following: [], // [{ id, username, full_name, is_verified, is_private }]
      followers: [],
      results: {}, // userId -> { status, at, note, attempts, run }
      keep: {}, // userId -> true (ticked "keep" in the list)
      log: [], // [{ t, username, action, result, details }]
      daily: { date: null, count: 0 },
      limitedAt: null,
      lastStop: null
    };
  };

  /** Bring data saved by version 1 up to date. */
  IGU.migrate = function (state) {
    if (!state.version || state.version < 2) {
      // Version 1 unfollowed through a request Instagram no longer accepts and mistook
      // the reply for a block. Drop that false alarm and its failed attempts.
      state.limitedAt = null;
      for (const id of Object.keys(state.results || {})) {
        if (state.results[id].status !== 'unfollowed') delete state.results[id];
      }
      if (state.lastStop && state.lastStop.reason === 'auth') state.lastStop = null;
      delete state.doubleCheckBroken;
      state.version = 2;
    }
    return state;
  };

  IGU.slimUser = function (u) {
    return {
      id: String(u.pk != null ? u.pk : u.pk_id != null ? u.pk_id : u.id),
      username: String(u.username || ''),
      full_name: String(u.full_name || ''),
      is_verified: !!u.is_verified,
      is_private: !!u.is_private
    };
  };

  IGU.localDate = function (ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  IGU.parseWhitelist = function (text) {
    const set = new Set();
    String(text || '')
      .split(/[\s,;]+/)
      .forEach((raw) => {
        let t = raw.trim();
        if (!t) return;
        const m = t.match(/instagram\.com\/([^/?#]+)/i);
        if (m) t = m[1];
        t = t.replace(/^@/, '').toLowerCase();
        if (t) set.add(t);
      });
    return set;
  };

  IGU.addLog = function (state, entry, max) {
    state.log.push(Object.assign({ t: Date.now(), username: '', action: '', result: '', details: '' }, entry));
    const cap = max || 10000;
    if (state.log.length > cap) state.log.splice(0, state.log.length - cap);
  };

  IGU.setResult = function (state, user, status, note, runId) {
    const prev = state.results[user.id] || {};
    state.results[user.id] = {
      status,
      at: Date.now(),
      note: note || '',
      attempts: (prev.attempts || 0) + (status === 'failed' ? 1 : 0),
      run: runId || null
    };
  };

  IGU.settingsWithDefaults = function (settings) {
    const s = Object.assign({}, IGU.DEFAULT_SETTINGS);
    for (const k of Object.keys(IGU.DEFAULT_SETTINGS)) if (settings && settings[k] !== undefined) s[k] = settings[k];
    return s;
  };

  /**
   * Compare following vs followers and work out what to do with each account.
   * Returns rows for every account you follow, the unfollow queue, and counts.
   */
  IGU.analyze = function (state, settings, runId) {
    const s = IGU.settingsWithDefaults(settings);
    const followerIds = new Set(state.followers.map((u) => u.id));
    const followingIds = new Set(state.following.map((u) => u.id));
    const wl = IGU.parseWhitelist(s.whitelist);
    const c = {
      following: state.following.length,
      followers: state.followers.length,
      mutual: 0,
      notBack: 0,
      kept: 0,
      toUnfollow: 0,
      unfollowed: 0,
      alreadyGone: 0,
      failed: 0,
      youDontFollowBack: 0
    };
    const rows = [];
    const queue = [];

    for (const u of state.following) {
      const followsYou = followerIds.has(u.id);
      const res = state.results[u.id];
      const st = res && res.status;
      let status;
      if (followsYou) {
        status = 'Mutual';
        c.mutual++;
      } else {
        c.notBack++;
        if (st === 'unfollowed' && state.scannedAt && state.scannedAt > res.at) {
          status = 'Kept (followed again)';
          c.kept++;
        } else if (st === 'unfollowed' || st === 'already_gone' || st === 'not_found') {
          status = RESULT_LABELS[st];
          if (st === 'unfollowed') c.unfollowed++;
          else c.alreadyGone++;
        } else if (state.keep[u.id]) {
          status = 'Kept (ticked)';
          c.kept++;
        } else if (wl.has(u.username.toLowerCase())) {
          status = 'Kept (keep list)';
          c.kept++;
        } else if (s.keepVerified && u.is_verified) {
          status = 'Kept (verified)';
          c.kept++;
        } else if (st === 'failed' && ((res.attempts || 1) >= IGU.MAX_ATTEMPTS || (runId && res.run === runId))) {
          status = 'Failed';
          c.failed++;
        } else {
          status = 'To unfollow';
          c.toUnfollow++;
        }
      }
      const row = Object.assign({}, u, { followsYou, status, at: res ? res.at : null, note: res ? res.note || '' : '' });
      rows.push(row);
      if (status === 'To unfollow') queue.push(row);
    }
    for (const f of state.followers) if (!followingIds.has(f.id)) c.youDontFollowBack++;
    return { rows, queue, counts: c, followingIds };
  };

  /** Checks before a run starts. Blockers stop it; warnings need a yes; notes are just info. */
  IGU.preflight = function (state, currentViewerId, now) {
    const blockers = [];
    const warnings = [];
    const notes = [];
    if (!state.scannedAt) {
      blockers.push('Scan your lists first.');
      return { ok: false, blockers, warnings, notes };
    }
    if (currentViewerId && state.viewer && String(currentViewerId) !== String(state.viewer.id)) {
      blockers.push('You are logged in to a different account than the one that was scanned. Scan again first.');
    }
    const p = state.profile || {};
    const got = state.followers.length;
    if (p.followers) {
      const need = Math.floor(p.followers * (p.followers_exact ? 0.97 : 0.9));
      if (got < need) {
        blockers.push('The followers scan looks incomplete (' + got + ' of ' + p.followers + '). Scan again, so nobody who follows you gets unfollowed by mistake.');
      } else if (!p.followers_exact) {
        warnings.push('Your profile shows a rounded follower count (' + p.followers + '), so the scan (' + got + ') could only be roughly checked.');
      }
    } else {
      warnings.push('Could not read the follower count on your profile, so the scan could not be double-checked against it.');
    }
    if (p.following && state.following.length < p.following * 0.97) {
      notes.push(
        'Your profile says ' + p.following + ' following and the list has ' + state.following.length +
          '. The gap is usually deactivated accounts, which Instagram counts but does not list.'
      );
    }
    if (now - state.scannedAt > 3 * DAY) warnings.push('Your scan is more than 3 days old. A fresh scan is safer.');
    if (state.limitedAt && now - state.limitedAt < DAY) {
      const hrs = Math.max(1, Math.round((now - state.limitedAt) / 3600000));
      warnings.push('Instagram limited your account about ' + hrs + ' hour(s) ago. Waiting at least 24 hours is safer.');
    }
    return { ok: blockers.length === 0, blockers, warnings, notes };
  };

  IGU.jitter = function (sec, pct) {
    return Math.max(1, sec * (1 + ((Math.random() * 2 - 1) * pct) / 100));
  };

  IGU.between = function (min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.random() * (hi - lo);
  };

  IGU.describe = function (r) {
    if (!r) return '';
    const msg = r.json && (r.json.message || r.json.feedback_title);
    return 'HTTP ' + r.status + (msg ? ': ' + msg : r.error ? ': ' + r.error : '');
  };

  /** Merge a fresh scan into the saved state. */
  IGU.applyScan = function (state, scan) {
    const sameAccount = state.viewer && scan.viewer && String(state.viewer.id) === String(scan.viewer.id);
    if (!sameAccount) {
      const log = state.log || [];
      const fresh = IGU.newState();
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, fresh, { log });
    }
    state.viewer = scan.viewer;
    state.profile = scan.profile;
    state.following = scan.following;
    state.followers = scan.followers;
    state.scannedAt = scan.scannedAt;
    // Keep the unfollow history (so nobody gets unfollowed twice). Everything else is checked again.
    for (const id of Object.keys(state.results)) {
      if (state.results[id].status !== 'unfollowed') delete state.results[id];
    }
    return state;
  };

  /** Read your full following and followers lists. */
  IGU.scan = async function (deps) {
    const api = deps.api;
    const sleep = deps.sleep;
    const onProgress = deps.onProgress || function () {};
    const isStopped = deps.isStopped || (() => false);

    const id = api.viewerId();
    if (!id) throw Object.assign(new Error('You are not logged in to Instagram in this browser.'), { kind: 'auth' });

    onProgress({ phase: 'profile' });
    const username = await deps.getUsername();
    const profile = username ? await api.profileCounts(username) : null;

    async function fetchAll(kind) {
      const out = [];
      const seen = new Set();
      let maxId = null;
      for (let page = 0; page < 2000; page++) {
        if (isStopped()) throw Object.assign(new Error('Scan stopped.'), { kind: 'stopped' });
        let r;
        for (let attempt = 0; attempt < 4; attempt++) {
          r = await api.listPage(kind, id, maxId);
          if (r.kind === 'ok' || r.kind === 'auth') break;
          if (r.kind === 'limited' && r.status !== 429) break;
          if (attempt < 3) {
            onProgress({ phase: 'retry', kind, status: r.status, wait: r.status === 429 ? 60 * (attempt + 1) : 5 * (attempt + 1) });
            await sleep(r.status === 429 ? 60000 * (attempt + 1) : 5000 * (attempt + 1));
          }
        }
        if (r.kind === 'limited' || r.kind === 'auth') {
          throw Object.assign(new Error('Instagram stopped the scan (' + IGU.describe(r) + ').'), { kind: r.kind });
        }
        if (r.kind !== 'ok') throw Object.assign(new Error('Could not load your ' + kind + ' (' + IGU.describe(r) + ').'), { kind: r.kind });

        const users = (r.json && r.json.users) || [];
        for (const raw of users) {
          const u = IGU.slimUser(raw);
          if (!seen.has(u.id)) {
            seen.add(u.id);
            out.push(u);
          }
        }
        onProgress({ phase: kind, count: out.length, total: profile ? profile[kind] : null });
        const next = r.json && r.json.next_max_id;
        if (!next || users.length === 0 || String(next) === String(maxId)) break;
        maxId = next;
        await sleep(1200 + Math.random() * 1800);
      }
      return out;
    }

    const following = await fetchAll('following');
    await sleep(3000);
    const followers = await fetchAll('followers');
    return {
      viewer: { id: String(id), username: username || null },
      profile,
      following,
      followers,
      scannedAt: Date.now()
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
