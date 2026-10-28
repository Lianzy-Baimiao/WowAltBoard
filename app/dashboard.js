/* Dashboard chrome and a deliberately tiny, theme-only native host bridge. */
(function (global) {
  'use strict';
  var AE = global.AE = global.AE || {};
  var doc = global.document;
  function tn(s, vars) { return AE.tn ? AE.tn(s, vars) : s; }
  function locale() { return AE.i18n ? AE.i18n.locale() : undefined; }
  function text(id, value) {
    var node = doc.getElementById(id);
    if (node) node.textContent = value;
  }
  AE.updateOverview = function (characters, total) {
    var rewards = 0, runs = 0, rating = 0;
    characters.forEach(function (ch) {
      if (ch.vault.hasAvailableRewards) rewards++;
      runs += ch.mp.runsThisWeek.total || 0;
      rating = Math.max(rating, ch.mp.rating || 0);
    });
    text('overview-count', characters.length);
    text('overview-total', tn('共 {n} 个角色', { n: total }));
    text('overview-rewards', rewards);
    // The card turns green only when there is something to collect.
    var rewardEl = doc.getElementById('overview-rewards');
    var rewardCard = rewardEl && rewardEl.parentNode;
    if (rewardCard && rewardCard.classList) rewardCard.classList.toggle('is-active', rewards > 0);
    text('overview-runs', runs);
    text('overview-rating', characters.length ? Math.round(rating).toLocaleString(locale()) : '—');
    var search = doc.getElementById('board-search');
    if (search && doc.activeElement !== search) search.value = AE.state.settings.search;
  };
  AE.syncDesktopTheme = function () {
    if (!global.chrome || !global.chrome.webview) return;
    // Normalize CSS colors, including custom user colors, to the bridge's #rrggbb contract.
    var style = global.getComputedStyle(doc.body);
    var canvas = doc.createElement('canvas');
    var ctx = canvas.getContext('2d');
    function color(name) {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = style.getPropertyValue(name).trim();
      var value = ctx.fillStyle;
      return /^#[0-9a-f]{6}$/i.test(value) ? value : '#14161a';
    }
    try {
      global.chrome.webview.postMessage({type: 'theme',
        background: color('--bg'), foreground: color('--fg'), border: color('--line'),
        dark: doc.body.getAttribute('data-theme') !== 'light'});
      doc.body.setAttribute('data-desktop', 'true');
    } catch (e) { /* Browser mode and UI must remain usable if the bridge fails. */ }
  };
  AE.wireDashboard = function () {
    // The frozen column casts its edge shadow only while rows slide under it.
    var wrap = doc.getElementById('grid-wrap');
    if (wrap && wrap.addEventListener) {
      var scrolled = false;
      var sync = function () {
        var on = wrap.scrollLeft > 0;
        if (on !== scrolled) { scrolled = on; wrap.classList.toggle('scrolled-x', on); }
      };
      wrap.addEventListener('scroll', sync, { passive: true });
      sync();
    }
    var search = doc.getElementById('board-search');
    if (!search) return;
    search.value = AE.state.settings.search;
    search.addEventListener('input', function () {
      if (search.composing) return;
      AE.state.settings.search = search.value.trim();
      AE.refresh();
    });
    search.addEventListener('compositionstart', function () { search.composing = true; });
    search.addEventListener('compositionend', function () {
      search.composing = false;
      AE.state.settings.search = search.value.trim();
      AE.refresh();
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      var target = e.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (doc.querySelector('aside.open')) return;
      e.preventDefault(); search.focus();
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);