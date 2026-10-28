/*
 * Builds the Excel report (Summary, Following, Not following back, Followers, Action log).
 * Uses SheetJS, bundled in lib/xlsx.full.min.js.
 */
(function (root) {
  'use strict';
  const IGU = (root.IGU = root.IGU || {});

  const fmt = (t) => (t ? new Date(t).toLocaleString('en-AU') : '');
  const yn = (b) => (b ? 'Yes' : 'No');
  const profileLink = (u) => 'https://www.instagram.com/' + u + '/';

  function addLinks(XLSX, ws, col, firstRow, urls) {
    urls.forEach((url, i) => {
      const addr = XLSX.utils.encode_cell({ r: firstRow + i, c: col });
      if (ws[addr]) ws[addr].l = { Target: url };
    });
  }

  function table(XLSX, header, data, widths) {
    const ws = XLSX.utils.aoa_to_sheet([header].concat(data));
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    return ws;
  }

  IGU.buildWorkbook = function (XLSX, state, settings, nowTs) {
    const s = IGU.settingsWithDefaults(settings);
    const a = IGU.analyze(state, s);
    const c = a.counts;
    const p = state.profile || {};
    const wb = XLSX.utils.book_new();
    const today = state.daily && state.daily.date === IGU.localDate(nowTs) ? state.daily.count : 0;
    const known = (n) => (n != null ? n : 'unknown');

    const summary = [
      ['Instagram Unfollow Report', ''],
      ['Report created', fmt(nowTs)],
      ['Account', state.viewer ? (state.viewer.username ? '@' + state.viewer.username : 'id ' + state.viewer.id) : ''],
      ['Last scan', fmt(state.scannedAt)],
      ['', ''],
      ['Followers (shown on your profile)', known(p.followers)],
      ['Following (shown on your profile)', known(p.following)],
      ['Followers (scanned)', c.followers],
      ['Following (scanned)', c.following],
      ['', ''],
      ['Follow you back (mutual)', c.mutual],
      ['Do not follow you back', c.notBack],
      ['   Unfollowed', c.unfollowed],
      ['   Kept (ticked, keep list, verified, followed again)', c.kept],
      ['   Already not following or account gone', c.alreadyGone],
      ['   Failed', c.failed],
      ['   Still to unfollow', c.toUnfollow],
      ['Followers you do not follow back', c.youDontFollowBack],
      ['', ''],
      ['Unfollows today', today + ' of ' + s.dailyCap],
      ['Last run ended', state.lastStop ? fmt(state.lastStop.at) + ' (' + (IGU.STOP_REASONS[state.lastStop.reason] || state.lastStop.reason) + ')' : ''],
      ['Last time Instagram limited you', fmt(state.limitedAt) || 'never'],
      ['', ''],
      ['Settings used', ''],
      ['Wait between unfollows (sec, +/- ' + s.jitterPct + '%)', s.delaySec],
      ['Unfollows before a break', s.batchSize],
      ['Break length (sec)', s.breakMinSec + ' to ' + s.breakMaxSec],
      ['Max unfollows per day', s.dailyCap],
      ['Recheck the last profile after each batch', yn(s.verifyBatch)],
      ['Scroll feed during breaks', yn(s.browseFeed)],
      ['Keep verified accounts', yn(s.keepVerified)]
    ];
    const wsSum = XLSX.utils.aoa_to_sheet(summary);
    wsSum['!cols'] = [{ wch: 52 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

    const fHeader = ['Username', 'Full name', 'Follows you', 'Status', 'Verified', 'Private', 'Action time', 'Note', 'Profile link'];
    const fRows = a.rows.map((r) => [r.username, r.full_name, yn(r.followsYou), r.status, yn(r.is_verified), yn(r.is_private), fmt(r.at), r.note, profileLink(r.username)]);
    const wsF = table(XLSX, fHeader, fRows, [24, 28, 11, 24, 9, 8, 22, 34, 42]);
    addLinks(XLSX, wsF, 8, 1, a.rows.map((r) => profileLink(r.username)));
    XLSX.utils.book_append_sheet(wb, wsF, 'Following');

    const nb = a.rows.filter((r) => !r.followsYou);
    const nHeader = ['Username', 'Full name', 'Status', 'Verified', 'Private', 'Action time', 'Note', 'Profile link'];
    const nRows = nb.map((r) => [r.username, r.full_name, r.status, yn(r.is_verified), yn(r.is_private), fmt(r.at), r.note, profileLink(r.username)]);
    const wsN = table(XLSX, nHeader, nRows, [24, 28, 24, 9, 8, 22, 34, 42]);
    addLinks(XLSX, wsN, 7, 1, nb.map((r) => profileLink(r.username)));
    XLSX.utils.book_append_sheet(wb, wsN, 'Not following back');

    const flHeader = ['Username', 'Full name', 'You follow them', 'Verified', 'Profile link'];
    const flRows = state.followers.map((u) => [u.username, u.full_name, yn(a.followingIds.has(u.id)), yn(u.is_verified), profileLink(u.username)]);
    const wsFl = table(XLSX, flHeader, flRows, [24, 28, 15, 9, 42]);
    addLinks(XLSX, wsFl, 4, 1, state.followers.map((u) => profileLink(u.username)));
    XLSX.utils.book_append_sheet(wb, wsFl, 'Followers');

    const lHeader = ['Time', 'Username', 'Action', 'Result', 'Details'];
    const lRows = state.log.map((e) => [fmt(e.t), e.username ? '@' + e.username : '', e.action, e.result, e.details || '']);
    XLSX.utils.book_append_sheet(wb, table(XLSX, lHeader, lRows, [22, 24, 12, 20, 70]), 'Action log');

    return wb;
  };

  IGU.reportFileName = function (state, ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    const who = state.viewer && state.viewer.username ? state.viewer.username.replace(/[^\w.-]/g, '') + '-' : '';
    return 'instagram-unfollow-report-' + who + IGU.localDate(ts) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.xlsx';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
