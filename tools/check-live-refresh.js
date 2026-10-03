/* Regression: an already-open dashboard must notice scanner output after /reload. */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var makeEl = require('./dom-stub.js').makeEl;
var root = path.resolve(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
function dashboard(savedPreference, native) {
  var nodes = {}, intervals = {}, events = {}, sequence = 0, reloads = 0;
  html.replace(/id="([^"]+)"/g, function (_, id) { nodes[id] = makeEl('div'); });
  var current = 1, rendered = 0, requests = [], urls = [], timeouts = {};
  var messages = [], nativeEvents = {}, toasts = [];
  var settings = { theme: 'dark', learnedDungeonNames: {}, dungeonNameOverrides: {}, learnedRaidNames: {} };
  var doc = { readyState: 'complete', hidden: false, head: makeEl('head'), body: makeEl('body'),
    getElementById: function (id) { return nodes[id] || null; }, createElement: makeEl,
    addEventListener: function (name, fn) { events[name] = fn; } };
  var env = { document: doc, console: console, Date: Date,
    AE_DATA: { revision: current, scanId: 'scan-' + current }, AE_MANIFEST: { generatedAt: 'scan-1' },
    sessionStorage: { getItem: function () { return savedPreference; }, setItem: function (_, v) { savedPreference = v; } },
    setInterval: function (fn) { intervals[++sequence] = fn; return sequence; },
    clearInterval: function (id) { delete intervals[id]; },
    setTimeout: function (fn) { timeouts[++sequence] = fn; return sequence; }, clearTimeout: function (id) { delete timeouts[id]; },
    addEventListener: function (name, fn) { events[name] = fn; },
    location: { reload: function () { reloads++; env.AE_DATA = { revision: current }; render(env.AE_DATA); } },
    AE: { loadSettings: function () { return { settings: settings, storageOk: true }; },
      buildModel: function (data) { return { revision: data.revision, characters: [{}], dungeonNames: {}, raidNames: {} }; },
      toast: function (o) { toasts.push(o); },
      render: render, state: { settings: settings }, wireHeaderDrag: function () {}, wireTips: function () {},
      renderLayoutPicker: function () {}, saveSettings: function () {} }
  };
  function render(model) { rendered = model.revision; }
  var append = doc.head.appendChild;
  doc.head.appendChild = function (script) { append(script); requests.push(script); urls.push(script.src); return script; };
  function flush(fail) {
    var pending = requests; requests = [];
    pending.forEach(function (script) {
      if (fail) { if (script.onerror) script.onerror(); }
      else { env.AE_SCAN_STATUS = { scanId: 'scan-' + current }; if (script.onload) script.onload(); }
    });
  }
  if (native) env.chrome = { webview: {
    postMessage: function (message) { messages.push(message); },
    addEventListener: function (name, fn) { nativeEvents[name] = fn; }
  } };
  env.window = env;
  vm.runInNewContext(main, env, { filename: 'app/main.js' });
  flush();
  return {
    env: env, nodes: nodes, doc: doc, events: events,
    flush: flush, urls: urls, messages: messages, toasts: toasts,
    reply: function (data) { if (nativeEvents.message) nativeEvents.message({ data: data }); },
    expire: function () { Object.keys(timeouts).forEach(function (id) { if (timeouts[id]) timeouts[id](); }); },
    writeScan: function () { current++; },
    tick: function () { Object.keys(intervals).forEach(function (id) { if (intervals[id]) intervals[id](); }); },
    rendered: function () { return rendered; }, reloads: function () { return reloads; }
  };
}
var board = dashboard(null);
assert.equal(board.rendered(), 1, 'initial dashboard uses the old scan');
board.writeScan(); // launcher has rewritten data/data.js after the game's /reload
board.tick(); board.flush();
assert.equal(board.rendered(), 2, 'open dashboard must display the latest scan without restarting the game or app');
assert.equal(board.nodes.autorefresh.checked, true, 'fresh sessions enable automatic refresh');
board = dashboard(null); board.tick(); board.flush();
assert.equal(board.reloads(), 0, 'unchanged scans do not reload');
assert.notEqual(board.urls[0], board.urls[1], 'cache-busting URLs must be unique');
assert.equal(board.doc.head.children.length, 0, 'probe scripts are cleaned up');
board.writeScan(); board.events.focus(); board.flush();
assert.equal(board.rendered(), 2, 'returning from the game checks immediately');
board = dashboard('0'); board.writeScan(); board.tick(); board.events.focus(); board.flush();
assert.equal(board.reloads(), 0, 'explicit opt-out is respected');
board.nodes.autorefresh.checked = true; board.nodes.autorefresh.dispatch('change'); board.flush();
assert.equal(board.rendered(), 2, 're-enabling immediately catches up');
board = dashboard(null); board.nodes.panel.classList.add('open'); board.writeScan(); board.tick(); board.flush();
assert.equal(board.reloads(), 0, 'settings are not discarded mid-edit');
board.nodes.panel.classList.remove('open'); board.tick(); board.flush();
assert.equal(board.rendered(), 2, 'deferred data applies after the panel closes');
board = dashboard(null); board.doc.activeElement = makeEl('input'); board.writeScan(); board.tick(); board.flush();
assert.equal(board.reloads(), 0, 'typing is not interrupted');
board.doc.activeElement = null; board.tick(); board.flush(); assert.equal(board.rendered(), 2);
board = dashboard(null); board.doc.hidden = true; board.writeScan(); board.tick(); board.flush();
assert.equal(board.reloads(), 0, 'hidden window waits');
board.doc.hidden = false; board.events.visibilitychange(); board.flush(); assert.equal(board.rendered(), 2);
board = dashboard(null); board.writeScan(); board.tick(); board.flush(true);
assert.equal(board.reloads(), 0, 'missing/locked marker does not reload');
board.tick(); board.flush(); assert.equal(board.rendered(), 2, 'read errors retry');
board = dashboard(null); board.tick(); var count = board.urls.length; board.tick();
assert.equal(board.urls.length, count, 'probes do not overlap');
board.expire(); board.flush(true); board.writeScan(); board.tick(); board.flush();
assert.equal(board.rendered(), 2, 'stalled probe times out and retries');
board = dashboard(null); board.writeScan(); board.tick(); board.nodes.autorefresh.checked = false;
board.nodes.autorefresh.dispatch('change'); board.flush(); assert.equal(board.reloads(), 0, 'late probe honors opt-out');

board = dashboard(null, true);
board.nodes['btn-refresh'].click();
assert.equal(board.messages.length, 1, 'native refresh must request a real scan');
assert.equal(board.messages[0].type, 'scan');
assert.equal(board.reloads(), 0, 'never reload old data before scan finishes');
assert.equal(board.nodes['btn-refresh'].disabled, true, 'scan disables repeated clicks');
board.nodes['btn-refresh'].click(); assert.equal(board.messages.length, 1, 'rapid clicks do not queue duplicate scans');
board.writeScan(); board.tick(); board.flush(); assert.equal(board.reloads(), 0, 'auto refresh waits for manual scan');
board.reply({ type: 'scan-result', id: 'unrelated', ok: true }); assert.equal(board.reloads(), 0);
board.reply({ type: 'scan-result', id: board.messages[0].id, ok: true }); assert.equal(board.rendered(), 2, 'successful scan reloads fresh output');
board = dashboard('0', true); board.nodes['btn-refresh'].click();
board.reply({ type: 'scan-result', id: board.messages[0].id, ok: false, error: 'SV_UNREADABLE' });
assert.equal(board.reloads(), 0, 'scan failure keeps the existing page');
assert.equal(board.nodes['btn-refresh'].disabled, false, 'failed scan allows retry');
assert.equal(board.toasts.length, 1, 'failure is visible');
board.nodes['btn-refresh'].click(); assert.equal(board.messages.length, 2);
assert.notEqual(board.messages[0].id, board.messages[1].id, 'each request has a unique correlation id');
board.reply({ type: 'scan-result', id: board.messages[0].id, ok: true }); assert.equal(board.reloads(), 0, 'late replies cannot finish a retry');
board.writeScan(); board.reply({ type: 'scan-result', id: board.messages[1].id, ok: true }); assert.equal(board.rendered(), 2, 'manual scan works with auto refresh disabled');
board = dashboard('0', true); board.nodes['btn-refresh'].click(); board.expire();
assert.equal(board.nodes['btn-refresh'].disabled, false, 'unresponsive bridge times out');
assert.equal(board.toasts.length, 1); assert.equal(board.reloads(), 0);
board = dashboard('0', true); board.env.chrome.webview.postMessage = function () { throw Error('bridge gone'); };
board.nodes['btn-refresh'].click(); assert.equal(board.nodes['btn-refresh'].disabled, false); assert.equal(board.toasts.length, 1);
board = dashboard('0'); board.nodes['btn-refresh'].click();
assert.equal(board.reloads(), 0, 'browser fallback must not claim to have scanned');
assert.equal(board.toasts.length, 1, 'browser fallback explains how to scan');
assert.ok(board.toasts[0].actions.length, 'browser fallback still offers reload-only');
board.toasts[0].actions[0].onClick(); assert.equal(board.reloads(), 1);
console.log('Manual scan: request, busy state, result correlation, failure, timeout and browser fallback passed');
console.log('Live refresh: latest scan, unchanged scan, focus, opt-out, editing, retry and cache checks passed');
