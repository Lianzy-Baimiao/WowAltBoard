/*
 * WowAltBoard - app/main.js
 *
 * Boot: check the capability probe, load settings, build the model, render.
 * Everything that can fail says so on the page rather than leaving a blank table.
 */
(function (global) {
  'use strict';

  var AE = global.AE = global.AE || {};
  var doc = global.document;

  function fatal(title, detail) {
    var box = doc.getElementById('fatal');
    box.style.display = '';
    doc.getElementById('fatal-title').textContent = title;
    doc.getElementById('fatal-detail').textContent = detail || '';
    doc.getElementById('app').style.display = 'none';
  }

  function boot() {
    var probe = global.__AE_PROBE || {};

    // The encoding trap: file:// has no Content-Type, so a script with no BOM is
    // decoded using the document's encoding. On a zh-CN machine a missing
    // <meta charset> means every Chinese character mojibakes.
    if (probe.encoding && probe.encoding.toUpperCase() !== 'UTF-8') {
      fatal('页面编码不是 UTF-8（当前 ' + probe.encoding + '）',
            '中文会显示为乱码。请确认 index.html 的 <meta charset="utf-8"> 在 <head> 的最前面。');
      return;
    }

    if (!global.AE_DATA) {
      fatal('数据未加载', '没有找到 data/data.js。请先双击文件夹里的 魔兽看板.exe'
            + '（或 启动.bat）来扫描游戏目录。');
      return;
    }

    var loaded;
    try {
      loaded = AE.loadSettings();
    } catch (e) {
      loaded = { settings: AE.settingsDefaults(), origin: '默认', storageOk: false };
    }
    AE.settingsOrigin = loaded.origin;
    AE.storageOk = loaded.storageOk && probe.storage !== false;

    var model;
    try {
      model = AE.buildModel(global.AE_DATA,
                            loaded.settings.learnedDungeonNames,
                            loaded.settings.dungeonNameOverrides,
                            global.AE_BAGSYNC,
                            loaded.settings.learnedRaidNames);
    } catch (e) {
      fatal('数据解析失败', e.message);
      if (global.console) global.console.error(e);
      return;
    }

    if (!model.characters.length) {
      fatal('没有找到任何角色',
            '扫描到 ' + model.sources.length + ' 个数据源，但里面没有角色记录。' +
            '需要装了 AlterEgo 并且登录过游戏，插件才会写入数据。');
      return;
    }

    // Remember the localized dungeon and raid names we just harvested, so they
    // survive after the lockouts that revealed them expire. The built-in tables
    // in labels.js cover the seasons this build shipped with; this cache is what
    // keeps a FUTURE season Chinese without waiting for a new release.
    var learnedChanged = false;
    Object.keys(model.dungeonNames).forEach(function (k) {
      if (loaded.settings.learnedDungeonNames[k] !== model.dungeonNames[k]) {
        loaded.settings.learnedDungeonNames[k] = model.dungeonNames[k];
        learnedChanged = true;
      }
    });
    Object.keys(model.raidNames).forEach(function (k) {
      if (loaded.settings.learnedRaidNames[k] !== model.raidNames[k]) {
        loaded.settings.learnedRaidNames[k] = model.raidNames[k];
        learnedChanged = true;
      }
    });
    // Localized class names, for the 毕业装备 panel's class picker. labels.js
    // ships the 9 this account could verify; there is no localized class table
    // anywhere on disk, so the other 4 arrive here the first time a character of
    // that class is scanned.
    if (!loaded.settings.learnedClassNames) loaded.settings.learnedClassNames = {};
    model.characters.forEach(function (ch) {
      if (!ch.classFile || !ch.className) return;
      if (loaded.settings.learnedClassNames[ch.classFile] !== ch.className) {
        loaded.settings.learnedClassNames[ch.classFile] = ch.className;
        learnedChanged = true;
      }
    });

    try {
      AE.render(model, loaded.settings);
      AE.wireHeaderDrag();
      AE.wireTips();
      AE.renderLayoutPicker();
      // Say so once, rather than letting a moved folder look like a data loss
      // that silently fixed itself.
      if (loaded.adoptedFrom) {
        AE.toast({
          title: '设置已从旧路径迁移过来',
          body: '这个文件夹被移动或改名过。浏览器按路径分开存设置，' +
                '所以刚才是从旧位置找回来的。想让设置以后跟着文件夹走，' +
                '去 设置 → 其他 → 保存设置到文件。',
          ms: 9000
        });
      }
    } catch (e) {
      fatal('渲染失败', e.message);
      if (global.console) global.console.error(e);
      return;
    }

    if (learnedChanged) AE.saveSettings(loaded.settings);
    wireChrome();
    if (AE.wireDashboard) AE.wireDashboard();
  }

  // Every slide-over panel, so open/close/click-outside is handled in one place
  // instead of three near-copies.
  var PANELS = [
    { id: 'panel',  onClose: null },
    { id: 'drawer', onClose: null },
    { id: 'trend',  onClose: null },
    { id: 'vault',  onClose: null },
    { id: 'bis',    onClose: null }
  ];

  function closeAll(except) {
    PANELS.forEach(function (p) {
      if (p.id === except) return;
      var node = doc.getElementById(p.id);
      if (node) node.classList.remove('open');
    });
    updateBackdrop();
  }

  function anyOpen() {
    for (var i = 0; i < PANELS.length; i++) {
      var n = doc.getElementById(PANELS[i].id);
      if (n && n.classList.contains('open')) return true;
    }
    return false;
  }

  function updateBackdrop() {
    var bd = doc.getElementById('backdrop');
    if (!bd) return;
    if (anyOpen()) bd.classList.add('on');
    else bd.classList.remove('on');
  }

  AE.togglePanel = function (id) {
    var node = doc.getElementById(id);
    if (!node) return;
    var willOpen = !node.classList.contains('open');
    closeAll(willOpen ? id : null);
    if (willOpen) node.classList.add('open');
    else node.classList.remove('open');
    updateBackdrop();
  };

  AE.openPanel = function (id) {
    closeAll(id);
    var node = doc.getElementById(id);
    if (node) node.classList.add('open');
    updateBackdrop();
  };

  AE.closeAllPanels = function () { closeAll(null); };
  AE.updateBackdrop = updateBackdrop;

  function wireChrome() {
    doc.getElementById('btn-settings').addEventListener('click', function () {
      AE.buildSettingsPanel();
      AE.togglePanel('panel');
    });
    doc.getElementById('panel-close').addEventListener('click', function () { closeAll(null); });
    doc.getElementById('drawer-close').addEventListener('click', function () { closeAll(null); });
    doc.getElementById('trend-close').addEventListener('click', function () { closeAll(null); });
    doc.getElementById('vault-close').addEventListener('click', function () { closeAll(null); });
    doc.getElementById('bis-close').addEventListener('click', function () { closeAll(null); });

    doc.getElementById('btn-trends').addEventListener('click', function () { AE.openTrends(); });
    doc.getElementById('btn-vault').addEventListener('click', function () { AE.openVault(); });
    doc.getElementById('btn-bis').addEventListener('click', function () { AE.openBis(); });
    // 选中的趋势指标要活过刷新：写进设置，history.js 的 render() 打开面板时读回。
    var trendSel = doc.getElementById('trend-metric');
    trendSel.addEventListener('change', function () {
      var s = AE.state && AE.state.settings;
      if (s) { s.trendMetric = trendSel.value; AE.saveSettings(s); }
      AE.rerenderTrends();
    });

    // 筛选全空时主表下方那个空态里的直达按钮：开设置面板并直接落到「筛选」页签。
    var emptyBtn = doc.getElementById('empty-open-filter');
    if (emptyBtn) emptyBtn.addEventListener('click', function () {
      var s = AE.state && AE.state.settings;
      if (s) { s.panelTab = 'filter'; AE.saveSettings(s); }
      if (AE.buildSettingsPanel) AE.buildSettingsPanel();
      AE.openPanel('panel');
    });

    // Click anywhere outside an open panel closes it. The backdrop covers the
    // page while a panel is open, so this needs no hit-testing.
    doc.getElementById('backdrop').addEventListener('mousedown', function () { closeAll(null); });

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(null);
    });

    doc.getElementById('btn-xlsx').addEventListener('click', AE.exportXlsx);
    wireExportMenu();

    wireTheme();
    wireRefresh();
  }

  // The caret menu next to 导出 Excel. Kept here rather than in export.js so all
  // the header wiring stays in one place.
  function wireExportMenu() {
    var more = doc.getElementById('btn-export-more');
    var menu = doc.getElementById('export-menu');
    if (!more || !menu) return;

    function setOpen(on) {
      menu.hidden = !on;
      more.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    more.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(menu.hidden);
    });

    doc.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== more) setOpen(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    doc.getElementById('btn-csv').addEventListener('click', function () {
      setOpen(false);
      AE.exportCsv();
    });
    doc.getElementById('btn-print').addEventListener('click', function () {
      // Close first: the menu is inside <header>, and an open menu would be
      // painted into the printout.
      setOpen(false);
      global.print();
    });
  }

  // ------------------------------------------------------------ theme switch

  // A two-button segmented control rather than a sliding toggle: it names both
  // states, so there is nothing to infer from which way a knob points, and it
  // matches the surrounding buttons instead of introducing a new shape.
  function wireTheme() {
    var seg = doc.getElementById('theme-seg');
    var buttons = seg.querySelectorAll('button[data-theme-value]');
    var s = AE.state.settings;

    function paint() {
      for (var i = 0; i < buttons.length; i++) {
        var on = buttons[i].getAttribute('data-theme-value') === s.theme;
        buttons[i].classList.toggle('on', on);
        buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        s.theme = this.getAttribute('data-theme-value');
        paint();
        AE.refresh();
        // The panel mirrors this control, so keep it in step if it is open.
        if (doc.getElementById('panel').classList.contains('open')) AE.buildSettingsPanel();
      });
    }
    paint();
    AE.repaintThemeSwitch = paint;
  }

  // ---------------------------------------------------------------- refresh

  var REFRESH_MS = 5000;
  var refreshTimer = null;
  var refreshEnabled = false;
  var refreshRequest = null;
  var refreshSequence = 0;
  var manualScan = null;
  var manualScanSequence = 0;
  var loadedScanId = global.AE_DATA && global.AE_DATA.scanId;

  function checkForScan() {
    if (!refreshEnabled || refreshRequest || manualScan || doc.hidden) return;
    // Script tags work on file:// (fetch does not). Read a tiny completion
    // marker, not the full payload. Unique URLs bypass WebView2 caches.
    var script = doc.createElement('script');
    var timeout;
    refreshRequest = script;
    function cleanup() {
      global.clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
      if (refreshRequest === script) refreshRequest = null;
    }
    script.charset = 'utf-8';
    script.src = 'data/scan-status.js?t=' + Date.now() + '-' + (++refreshSequence);
    script.onload = function () {
      var status = global.AE_SCAN_STATUS;
      cleanup();
      if (!refreshEnabled || manualScan || !status || !status.scanId || status.scanId === loadedScanId) return;
      // Defer while editing or viewing details; the next check applies it.
      var active = doc.activeElement;
      if (anyOpen() || (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable))) return;
      global.location.reload();
    };
    script.onerror = cleanup; // missing marker / mid-write: retry next tick
    timeout = global.setTimeout(cleanup, 10000);
    doc.head.appendChild(script);
  }

  function scanFailure(code) {
    var hints = {
      NO_WOW: '未找到游戏目录，请在托盘菜单中设置游戏目录。',
      SV_UNREADABLE: '插件存档暂时无法读取，请等游戏写盘完成后重试。',
      NO_WRITE: '程序目录不可写，请把整个程序移到可写目录后重试。',
      SCAN_BUSY: '另一次扫描仍在进行，请稍后重试。',
      TIMEOUT: '扫描未能及时完成，请稍后重试；也可从托盘菜单手动扫描。',
      BRIDGE_TIMEOUT: '未收到桌面程序的扫描结果，请确认已退出旧版程序并重新打开新版。',
      MISSING_SCRIPT: '缺少 tools/scan.ps1，请重新完整解压程序。'
    };
    AE.toast({ title: '扫描未完成', body: hints[code] || '请检查插件是否启用，并在游戏中 /reload 后重试。托盘菜单的「立即重新扫描」可查看详细原因。', kind: 'bad', ms: 9000 });
  }

  function finishManualScan(result) {
    if (!manualScan || !result || result.type !== 'scan-result' || result.id !== manualScan.id) return;
    global.clearTimeout(manualScan.timer);
    var button = doc.getElementById('btn-refresh');
    button.disabled = false;
    button.textContent = manualScan.label;
    button.removeAttribute('aria-busy');
    manualScan = null;
    if (result.ok === true) global.location.reload();
    else scanFailure(result.error);
  }

  function requestManualScan() {
    if (manualScan) return;
    var bridge = global.chrome && global.chrome.webview;
    if (!bridge || !bridge.postMessage || !bridge.addEventListener) {
      // A plain file:// browser cannot execute local programs. Be explicit,
      // rather than silently reloading old output and pretending to scan.
      AE.toast({ title: '请用桌面程序进行扫描',
        body: '浏览器页面不能直接扫描游戏文件。请打开「魔兽看板.exe」后点刷新，或在托盘菜单点「立即重新扫描」。', ms: 0,
        actions: [{ label: '仅重新载入已扫描数据', onClick: function () { global.location.reload(); } }] });
      return;
    }
    var button = doc.getElementById('btn-refresh');
    var id = 'scan-' + Date.now() + '-' + (++manualScanSequence);
    manualScan = { id: id, label: button.textContent };
    button.disabled = true;
    button.textContent = '扫描中…';
    button.setAttribute('aria-busy', 'true');
    manualScan.timer = global.setTimeout(function () {
      finishManualScan({ type: 'scan-result', id: id, ok: false, error: 'BRIDGE_TIMEOUT' });
    }, 130000);
    try { bridge.postMessage({ type: 'scan', id: id }); }
    catch (e) { finishManualScan({ type: 'scan-result', id: id, ok: false, error: 'BRIDGE_TIMEOUT' }); }
  }

  function wireRefresh() {
    doc.getElementById('btn-refresh').addEventListener('click', requestManualScan);
    var bridge = global.chrome && global.chrome.webview;
    if (bridge && bridge.addEventListener) bridge.addEventListener('message', function (event) {
      finishManualScan(event.data);
    });

    var box = doc.getElementById('autorefresh');
    // Default on; honor an explicit opt-out. Unchanged scans never reload.
    var on = true;
    try { on = global.sessionStorage.getItem('AEW:autorefresh') !== '0'; } catch (e) { /* default on */ }
    box.checked = on;
    if (on) startAutoRefresh();
    global.addEventListener('focus', checkForScan);
    doc.addEventListener('visibilitychange', checkForScan);

    box.addEventListener('change', function () {
      try {
        global.sessionStorage.setItem('AEW:autorefresh', box.checked ? '1' : '0');
      } catch (e) { /* ignore */ }
      if (box.checked) startAutoRefresh();
      else stopAutoRefresh();
    });
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshEnabled = true;
    refreshTimer = global.setInterval(checkForScan, REFRESH_MS);
    checkForScan();
  }

  function stopAutoRefresh() {
    refreshEnabled = false;
    if (refreshTimer) { global.clearInterval(refreshTimer); refreshTimer = null; }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof window !== 'undefined' ? window : globalThis);
