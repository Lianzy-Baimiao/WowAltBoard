/* Whole-app updates. The native updater owns disk/network/process operations.
 * No update code or data is hot-swapped into the current page. Restart is always explicit. */
(function (global) {
  'use strict';
  var AE = global.AE = global.AE || {}, doc = global.document;
  var bridge = global.chrome && global.chrome.webview, boot = global.AE_APP_UPDATE_BOOT;
  var supported = !!(boot && boot.protocol === 1 && bridge && bridge.postMessage && bridge.addEventListener);
  var state = supported ? boot : { phase: 'unsupported' }, pending = null, serial = 0, watchdog;
  var errors = {
    NOT_PUBLISHED: '当前发布尚未提供增量更新包。可以继续使用，或从下方「最新发布」下载完整包。',
    NETWORK: '无法连接更新服务，可稍后重试；当前应用没有改动。',
    HASH_MISMATCH: '下载校验失败，未安装。重试会复用已校验的更新包。',
    MANIFEST_INVALID: '更新清单不合法，未安装。', PACKAGE_INVALID: '更新包内容不合法，未安装。',
    APP_UPDATE_REQUIRED: '更新协议不兼容，需要从最新发布手动升级一次。',
    FILE_BUSY: '更新目录被占用或无法写入，请关闭另一个看板窗口后重试。',
    NO_WRITE_ACCESS: '目录不可写，请把看板放在有写入权限的文件夹。',
    CHECK_FIRST: '请先检查并下载更新。', BUSY: '另一个更新任务正在进行。',
    SCAN_BUSY: '正在扫描角色，请扫描结束后再重启更新。',
    INSTALL_FAILED: '安装未完成，请重试。若更新曾中断，下次从「魔兽看板.exe」启动会先恢复应用文件。',
    CANCELLED: '下载已取消，当前应用没有改动。', TIMEOUT: '更新响应超时，已请求取消；稍后可重试。'
  };
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function size(n) { return n < 1048576 ? Math.ceil(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function message() {
    if (!supported) return bridge ? '当前桌面程序不支持应用内更新，需要手动升级一次程序。' : '应用内安装需要通过「魔兽看板.exe」打开；浏览器版可从最新发布下载完整包。';
    if (state.phase === 'error') return errors[state.error] || '更新没有完成，当前版本可以继续使用。';
    if (state.phase === 'checking') return '正在检查应用新版本…';
    if (state.phase === 'available') return '发现 v' + state.version + '：' + state.changed + ' 个文件有变化，需下载 ' + state.packages + ' 个组件包，约 ' + size(state.bytes) + '。';
    if (state.phase === 'downloading') return '正在准备更新：' + state.completed + '/' + state.total + ' 个组件；未变化组件复用本地，不重复下载。';
    if (state.phase === 'ready') return 'v' + state.version + ' 已下载并校验。你可以继续使用，方便时再重启安装。';
    if (state.phase === 'current') return '当前没有更高版本的正式发布；源站数据是否更新与应用版本是两回事。';
    if (state.phase === 'cancelled') return '已取消，当前应用没有改动；重试会复用已下载并校验的组件包。';
    if (state.phase === 'updated') return '应用更新已完成。角色数据、设置及窗口状态已保留。';
    if (state.phase === 'restored') return '已恢复上一次应用文件。角色数据和设置未回退。';
    return '更新整个看板：界面、启动器、扫描工具，以及随版本发布的装备、天赋和图标。';
  }
  function paint(host) {
    host.textContent = ''; host.appendChild(el('h3', '', '应用更新'));
    if (supported) host.appendChild(el('p', 'note', '当前应用 v' + (state.currentVersion || '未知')));
    var status = el('p', 'app-update-message', message()); status.setAttribute('role', 'status'); host.appendChild(status);
    if (!supported) return;
    var actions = el('div', 'row-buttons');
    function button(label, action, disabled) {
      var b = el('button', 'mini', label); b.type = 'button'; b.disabled = !!disabled;
      b.addEventListener('click', function () { request(action); }); actions.appendChild(b);
    }
    button('检查应用更新', 'check', pending);
    if (state.phase === 'available') button('下载更新（' + size(state.bytes) + '）', 'download', pending);
    if (pending && pending.action !== 'preferences' && pending.action !== 'apply' && pending.action !== 'rollback') button('取消下载 / 检查', 'cancel', false);
    if (state.ready || state.phase === 'ready') button('重启并安装更新', 'apply', pending);
    if (state.canRollback) button('恢复上一次应用版本', 'rollback', pending);
    host.appendChild(actions);
    var label = el('label', 'update-auto'), check = el('input'); check.type = 'checkbox'; check.checked = pending && pending.action === 'preferences' ? pending.automatic : !!state.automatic; check.disabled = !!pending;
    check.addEventListener('change', function () { request('preferences', check.checked); });
    label.appendChild(check); label.appendChild(doc.createTextNode('自动检查并后台下载（每 24 小时，不自动重启）')); host.appendChild(label);
    host.appendChild(el('p', 'note', '默认关闭，只在看板运行时检查。按组件增量下载，不是每次重新下载完整应用；安装前会再次确认重启。保留角色数据、设置、游戏路径和窗口状态。'));
    if (state.checkedAt) { var date = new Date(state.checkedAt); host.appendChild(el('p', 'note', '上次应用检查：' + (isNaN(date.getTime()) ? '未知' : date.toLocaleString()))); }
  }
  function refresh() { Array.prototype.forEach.call(doc.querySelectorAll('.app-updates'), paint); }
  function armTimeout(id) {
    global.clearTimeout(watchdog);
    watchdog = global.setTimeout(function () {
      if (!pending || pending.id !== id) return;
      bridge.postMessage({ type: 'app-update', id: id, action: 'cancel' }); pending = null; state.phase = 'error'; state.error = 'TIMEOUT'; refresh();
    }, 240000);
  }
  function request(action, automatic) {
    if (!supported) return;
    if (action === 'cancel') { if (pending) bridge.postMessage({ type: 'app-update', id: pending.id, action: 'cancel' }); return; }
    if (pending) return;
    var id = 'app-update-' + Date.now() + '-' + (++serial); pending = { id: id, action: action, automatic: !!automatic }; armTimeout(id);
    try { bridge.postMessage({ type: 'app-update', id: id, action: action, automatic: !!automatic }); }
    catch (e) { pending = null; global.clearTimeout(watchdog); state.phase = 'error'; state.error = 'UPDATE_FAILED'; }
    refresh();
  }
  AE.AppUpdates = { open: function () {
    if (!AE.state || !AE.buildSettingsPanel || !AE.openPanel) return false;
    AE.state.settings.panelTab = 'misc'; AE.buildSettingsPanel(); AE.openPanel('panel');
    var box = doc.querySelector('.app-updates'); if (box) box.scrollIntoView({ block: 'start' });
    if (supported && !pending) request('check');
    return true;
  }, render: function () { var host = el('section', 'app-updates'); paint(host); return host; } };
  if (supported) {
    bridge.addEventListener('message', function (event) {
      var m = event.data;
      if (!pending || !m || m.type !== 'app-update-result' || m.id !== pending.id || !m.state) return;
      state = m.state;
      if (m.done) { pending = null; global.clearTimeout(watchdog); } else armTimeout(m.id);
      refresh();
    });
    global.setTimeout(function () { if (state.automatic) request('auto'); }, 1500);
    global.setInterval(function () { if (state.automatic) request('auto'); }, 30 * 60 * 1000);
  }
})(window);
