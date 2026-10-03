/* Regression: settings must not call a saved v1.17.0 check the latest release,
 * nor open that snapshot's pinned release when the user wants the latest one.
 * Run without network or personal scan data: node tools/check-update-panel.js
 */
'use strict';
var assert = require('assert');
var stub = require('./dom-stub.js');
var env = stub.makeEnv(['panel-body', 'panel-tabs']);
['app/labels.js', 'app/settings.js', 'app/render.js', 'app/panel.js'].forEach(env.load);
var AE = env.g.AE;
var opened = [], toasts = [];
env.g.open = function (url) { opened.push(url); };
AE.toast = function (message) { toasts.push(message); };
var settings = AE.settingsDefaults();
settings.panelTab = 'misc';
var panel = env.byId['panel-body'];
panel.childNodes = panel.children;
function render(update, current, repo, scannedAtLocal) {
  // Start with an empty drawer; scroll restoration is outside this regression.
  panel.innerHTML = '';
  AE.state = { settings: settings, model: {
    toolVersion: current || '1.17.2', repo: repo,
    scannedAtLocal: scannedAtLocal,
    columns: { dungeonIds: [] }, update: update
  } };
  AE.buildSettingsPanel();
  var boxes = stub.findByClass(panel, 'update-box');
  assert.equal(boxes.length, 1);
  return boxes[0];
}
function snapshot(version) {
  return { checked: true, currentVersion: '1.17.0', latestVersion: version,
    url: 'https://github.com/Lianzy-Baimiao/WowAltBoard/releases/tag/' + version };
}
function clickLatest(box) {
  var buttons = [];
  stub.walk(box, function (node) { if (node.tagName === 'BUTTON') buttons.push(node); });
  // Exercise the actual primary action, not a separate URL helper.
  assert.ok(buttons[0]);
  buttons[0].click();
  return buttons[0];
}
var box = render(snapshot('v1.17.0'), '1.17.2', 'Lianzy-Baimiao/WowAltBoard', '2026-10-02 04:58:00');
console.log('Settings update: ' + box.textContent);
assert.ok(!/最新 v1\.17\.0|已是最新/.test(box.textContent),
  'stale v1.17.0 snapshot must not be presented as the latest release for v1.17.2');
assert.ok(box.textContent.includes('上次检查查到 v1.17.0'));
assert.ok(box.textContent.includes('检查记录早于当前版本'));
assert.ok(box.textContent.includes('2026-10-02 04:58:00'), 'show when the saved check was made');
assert.ok(box.textContent.includes('不是实时查询'));
assert.equal(clickLatest(box).textContent, '查看最新版本', 'do not pretend opening a page re-checks locally');
assert.equal(opened.pop(), 'https://github.com/Lianzy-Baimiao/WowAltBoard/releases/latest');
assert.ok(toasts.pop().body.includes('托盘'), 'explain how to refresh the saved result');

box = render(snapshot('v1.17.2'));
assert.ok(box.textContent.includes('当时未发现更新'));
assert.ok(!box.textContent.includes('有更新'), 'compare against installed version, not saved currentVersion');
box = render(snapshot('v1.17.10'));
assert.ok(box.textContent.includes('有更新'), 'versions must use numeric comparison');
box = render(snapshot('v1.17.0'), '1.17.0');
assert.ok(box.textContent.includes('上次检查查到 v1.17.0'));
assert.ok(!box.textContent.includes('已是最新'), 'even an equal snapshot is not a live check');

box = render(null, '1.17.2', 'example/OtherBoard');
assert.ok(box.textContent.includes('未检查'));
clickLatest(box);
assert.equal(opened.pop(), 'https://github.com/example/OtherBoard/releases/latest');
box = render({ checked: false, error: 'network offline', url: 'https://example.com/old' });
assert.ok(box.textContent.includes('上次检查没成功'));
assert.ok(box.textContent.includes('network offline'));
clickLatest(box);
assert.equal(opened.pop(), 'https://github.com/Lianzy-Baimiao/WowAltBoard/releases/latest');
box = render({ checked: false, error: 'disabled in config.json' });
assert.ok(!/最新 v|已是最新|undefined|Invalid Date/.test(box.textContent));
box = render(snapshot('v1.17.2'), '?');
assert.ok(!box.textContent.includes('有更新'), 'unknown installed version cannot imply an available update');
assert.ok(box.textContent.includes('当前版本未知'));
console.log('Update panel: stale/equal/newer/unknown versions, timestamps, latest link, missing/failed/disabled checks passed');
