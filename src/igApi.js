/*
 * Read-only Instagram lookups used by the scan.
 * Unfollowing is NOT done here. It is done by clicking the real buttons (see ui.js and runner.js).
 */
(function (root) {
  'use strict';
  const IGU = (root.IGU = root.IGU || {});

  const DEFAULT_APP_ID = '936619743392459'; // Instagram web app id (sent by instagram.com itself)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getCookie(name) {
    const parts = ('; ' + (root.document ? root.document.cookie : '')).split('; ' + name + '=');
    if (parts.length < 2) return null;
    try {
      return decodeURIComponent(parts.pop().split(';')[0]);
    } catch (e) {
      return null;
    }
  }

  function safeStorage(kind, key) {
    try {
      const s = root[kind];
      return s ? s.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  /** ok | limited | auth | notfound | error */
  function classify(status, json, finalUrl) {
    const msg = String((json && (json.message || json.error_type)) || '').toLowerCase();
    if (finalUrl && /\/(challenge|accounts\/login|accounts\/suspended)/.test(finalUrl)) return 'auth';
    if (/checkpoint|challenge|login_required|consent_required/.test(msg)) return 'auth';
    if (status === 429) return 'limited';
    if (json && json.spam === true) return 'limited';
    if (/feedback_required|rate_limit|please wait|try again later|too many/.test(msg)) return 'limited';
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'notfound';
    if (status >= 400 || status === 0 || (json && json.status === 'fail')) return 'error';
    return 'ok';
  }

  async function getJson(path) {
    const headers = {
      accept: '*/*',
      'x-ig-app-id': safeStorage('localStorage', 'instagramWebFBAppId') || DEFAULT_APP_ID,
      'x-requested-with': 'XMLHttpRequest'
    };
    const csrf = getCookie('csrftoken');
    if (csrf) headers['x-csrftoken'] = csrf;
    const claim = safeStorage('sessionStorage', 'www-claim-v2');
    if (claim) headers['x-ig-www-claim'] = claim;
    let res;
    try {
      res = await fetch(location.origin + path, { method: 'GET', headers, credentials: 'include' });
    } catch (e) {
      return { kind: 'error', status: 0, json: null, error: 'Network error: ' + (e && e.message ? e.message : e) };
    }
    let text = '';
    try {
      text = await res.text();
    } catch (e) {
      text = '';
    }
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      json = null;
    }
    let kind = classify(res.status, json, res.url);
    if (kind === 'ok' && json === null) kind = 'error';
    return { kind, status: res.status, json, error: json ? '' : text.slice(0, 160) };
  }

  /** "2,981" -> {n: 2981, exact: true}. "1.2K" -> {n: 1200, exact: false}. */
  function parseCount(text) {
    if (!text) return { n: null, exact: false };
    let t = String(text).replace(/\s/g, '');
    let mult = 1;
    if (/[Kk]$/.test(t)) {
      mult = 1000;
      t = t.slice(0, -1);
    } else if (/[Mm]$/.test(t)) {
      mult = 1000000;
      t = t.slice(0, -1);
    }
    if (mult === 1) {
      const n = parseInt(t.replace(/[.,]/g, ''), 10);
      return Number.isFinite(n) ? { n, exact: true } : { n: null, exact: false };
    }
    const f = parseFloat(t.replace(/,/g, ''));
    return Number.isFinite(f) ? { n: Math.round(f * mult), exact: false } : { n: null, exact: false };
  }

  IGU.parseCount = parseCount;

  IGU.api = {
    classify,

    /** Logged-in user's numeric id, from Instagram's own cookie. */
    viewerId() {
      return getCookie('ds_user_id');
    },

    /** Your username, from the Profile link in Instagram's sidebar. */
    async myUsername(timeoutMs) {
      const end = Date.now() + (timeoutMs || 10000);
      while (Date.now() < end) {
        for (const img of document.querySelectorAll('a[href] img[alt$="profile picture"]')) {
          const a = img.closest('a');
          if (!a || a.closest('main, header, article, [role="dialog"]')) continue;
          const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
          if (m) return m[1];
        }
        await sleep(400);
      }
      return null;
    },

    /**
     * Follower and following counts for a username. Instagram puts
     * "650 Followers, 2,981 Following, 3 Posts" in every profile page's description.
     */
    async profileCounts(username) {
      const empty = { followers: null, followers_exact: false, following: null, following_exact: false };
      const pick = (text) => {
        const m = String(text || '').match(/([\d.,]+\s*[KkMm]?)\s+Followers?,\s*([\d.,]+\s*[KkMm]?)\s+Following/);
        if (!m) return null;
        const f = parseCount(m[1]);
        const g = parseCount(m[2]);
        return { followers: f.n, followers_exact: f.exact, following: g.n, following_exact: g.exact };
      };
      try {
        const res = await fetch(location.origin + '/' + encodeURIComponent(username) + '/', { credentials: 'include' });
        const got = pick(await res.text());
        if (got) return got;
      } catch (e) {
        /* fall through */
      }
      // Fallback: we are on the profile page itself, read the header.
      const h = document.querySelector('header');
      if (h && location.pathname.replace(/\/+$/, '').toLowerCase() === '/' + username.toLowerCase()) {
        const txt = h.innerText || '';
        const f = txt.match(/([\d.,]+\s*[KkMm]?)\s+followers?\b/i);
        const g = txt.match(/([\d.,]+\s*[KkMm]?)\s+following\b/i);
        if (f || g) {
          const pf = parseCount(f && f[1]);
          const pg = parseCount(g && g[1]);
          return { followers: pf.n, followers_exact: pf.exact, following: pg.n, following_exact: pg.exact };
        }
      }
      return empty;
    },

    /** One page of your followers or following list. kind = 'followers' | 'following'. */
    listPage(kind, id, maxId) {
      let path = '/api/v1/friendships/' + id + '/' + kind + '/?count=50';
      if (kind === 'followers') path += '&search_surface=follow_list_page';
      if (maxId) path += '&max_id=' + encodeURIComponent(maxId);
      return getJson(path);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
