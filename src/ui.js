/*
 * Reading Instagram's page and clicking its buttons like a person:
 * a visible cursor glides to the button, pauses, then presses it.
 * Everything that depends on Instagram's page layout is in this file.
 */
(function (root) {
  'use strict';
  const IGU = (root.IGU = root.IGU || {});

  const FOLLOW_NAMES = ['Following', 'Follow', 'Follow Back', 'Requested'];
  const BLOCK_RE = /try again later|action blocked|we restrict certain activity|we limit how often|to protect our community|temporarily blocked|unusual activity|automated behavio/i;
  const AUTH_RE = /\/(challenge|accounts\/login|accounts\/suspended|accounts\/disabled)/i;
  const GONE_RE = /Sorry, this page isn't available|Profile isn't available|This account isn't available|User not found/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const T = (el) => ((el && (el.innerText || el.textContent)) || '').trim();
  const isOurs = (el) => !!(el && el.closest && el.closest('#igu-host, #igu-cursor'));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const followScope = () => (document.querySelector('header') ? 'header button, header [role="button"]' : 'main button, main [role="button"]');

  /** What the current page shows: the follow button's text, open dialogs, and whether the profile exists. */
  function pageInfo() {
    let btn = null;
    for (const el of document.querySelectorAll(followScope())) {
      if (isOurs(el)) continue;
      const t = T(el);
      if (FOLLOW_NAMES.includes(t) && visible(el)) {
        btn = t;
        break;
      }
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => visible(d) && !isOurs(d)).map((d) => T(d).slice(0, 500));
    const bodyText = T(document.body).slice(0, 5000);
    return { url: location.href, path: location.pathname, btn, dialogs, unavailable: !btn && GONE_RE.test(bodyText) };
  }

  /** ['auth' | 'limited', note] when Instagram is pushing back, else null. */
  function blocked(info) {
    if (!info) return null;
    const m = (info.url || '').match(AUTH_RE);
    if (m) return ['auth', 'Instagram opened its ' + m[1] + ' page'];
    for (const d of info.dialogs || []) {
      if (BLOCK_RE.test(d)) return ['limited', 'Instagram said: ' + d.replace(/\s+/g, ' ').slice(0, 160)];
    }
    return null;
  }

  /**
   * Find a button to click. 'following' = the Following button on a profile.
   * Anything else = a button with exactly that text inside an open dialog (newest dialog first).
   * Buttons already clicked once are skipped, so a confirm dialog is never mixed up with the menu.
   */
  function findTarget(kind) {
    if (kind === 'following') {
      return [...document.querySelectorAll(followScope())].find((e) => !isOurs(e) && T(e) === 'Following' && visible(e)) || null;
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => visible(d) && !isOurs(d)).reverse();
    for (const d of dialogs) {
      const el = [...d.querySelectorAll('button, [role="button"]')].find((e) => T(e) === kind && visible(e) && !e.dataset.iguClicked);
      if (el) return el;
    }
    return null;
  }

  async function waitFor(fn, timeoutMs, stepMs, shouldStop) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end || (shouldStop && shouldStop())) return null;
      await sleep(stepMs || 300);
    }
  }

  // ---------- the visible cursor ----------
  let cursorEl = null;
  function cursor() {
    if (cursorEl && cursorEl.isConnected) return cursorEl;
    cursorEl = document.createElement('div');
    cursorEl.id = 'igu-cursor';
    cursorEl.style.cssText =
      'position:fixed;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;' +
      'background:rgba(255,48,64,.6);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.3);' +
      'z-index:2147483646;pointer-events:none;transition:transform .08s;display:none;';
    document.documentElement.appendChild(cursorEl);
    return cursorEl;
  }
  function lastPos() {
    try {
      const p = JSON.parse(sessionStorage.getItem('igu_cursor') || 'null');
      if (p && Number.isFinite(p.x)) return { x: Math.min(p.x, innerWidth - 5), y: Math.min(p.y, innerHeight - 5) };
    } catch (e) {
      /* ignore */
    }
    return { x: innerWidth * 0.55, y: innerHeight * 0.65 };
  }
  function place(x, y, scale) {
    const c = cursor();
    c.style.display = 'block';
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    c.style.transform = scale ? 'scale(' + scale + ')' : '';
  }

  /** Glide the cursor along a slight curve to (x, y). Timer based, so it also finishes in a background tab. */
  async function moveCursor(x, y) {
    const from = lastPos();
    const dur = rand(380, 780);
    const cx = (from.x + x) / 2 + rand(-70, 70);
    const cy = (from.y + y) / 2 + rand(-45, 45);
    const t0 = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const px = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * x;
      const py = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * y;
      place(px, py);
      if (t >= 1) break;
      await sleep(16);
    }
    try {
      sessionStorage.setItem('igu_cursor', JSON.stringify({ x, y }));
    } catch (e) {
      /* ignore */
    }
  }

  function highlight(el) {
    const o = el.style.outline;
    const oo = el.style.outlineOffset;
    el.style.outline = '3px solid #ff3040';
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.outline = o;
      el.style.outlineOffset = oo;
    }, 1500);
  }

  function fire(target, type, x, y, buttons) {
    const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: buttons || 0 };
    const Ctor = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
    const opts = type.indexOf('pointer') === 0 ? Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, base) : base;
    target.dispatchEvent(new Ctor(type, opts));
  }

  /** Move the cursor onto the element, pause like a hand would, then press and release. */
  async function humanClick(el) {
    let r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await sleep(300);
      r = el.getBoundingClientRect();
    }
    const x = r.left + r.width * rand(0.3, 0.7);
    const y = r.top + r.height * rand(0.3, 0.7);
    el.dataset.iguClicked = '1';
    highlight(el);
    await moveCursor(x, y);
    let hit = document.elementFromPoint(x, y);
    if (!hit || !el.contains(hit)) hit = el; // something of ours is on top: press the button itself
    fire(hit, 'pointerover', x, y);
    fire(hit, 'mouseover', x, y);
    fire(hit, 'pointermove', x, y);
    fire(hit, 'mousemove', x, y);
    await sleep(rand(220, 650));
    place(x, y, 0.7);
    fire(hit, 'pointerdown', x, y, 1);
    fire(hit, 'mousedown', x, y, 1);
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    await sleep(rand(60, 140));
    fire(hit, 'pointerup', x, y);
    fire(hit, 'mouseup', x, y);
    fire(hit, 'click', x, y);
    place(x, y);
  }

  function pressEscape() {
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    const t = document.activeElement && !isOurs(document.activeElement) ? document.activeElement : document.body;
    t.dispatchEvent(new KeyboardEvent('keydown', opts));
    t.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  /** Scroll the page a bit, like reading a feed. */
  function scrollFeed() {
    const dy = (Math.random() < 0.8 ? 1 : -1) * Math.round(rand(250, 750));
    window.scrollBy({ top: dy, behavior: 'smooth' });
    place(innerWidth * rand(0.4, 0.6), innerHeight * rand(0.45, 0.65));
  }

  /** Close "Turn on notifications" style popups. */
  async function dismissPopups() {
    for (const label of ['Not Now', 'Not now']) {
      const el = findTarget(label);
      if (el) {
        await humanClick(el);
        await sleep(600);
      }
    }
  }

  IGU.ui = { pageInfo, blocked, findTarget, waitFor, humanClick, moveCursor, pressEscape, scrollFeed, dismissPopups, sleep, rand };
})(typeof globalThis !== 'undefined' ? globalThis : this);
