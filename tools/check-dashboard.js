/* Small dependency-free contract tests for dashboard chrome and native theme messages. */
'use strict';
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var nodes = {};
['overview-count', 'overview-total', 'overview-rewards', 'overview-runs', 'overview-rating', 'board-search'].forEach(function (id) {
  nodes[id] = {value: '', textContent: '', events: {}, addEventListener: function (name, fn) { this.events[name] = fn; }};
});
var messages = [], refreshes = 0;
var doc = {
  getElementById: function (id) { return nodes[id]; },
  activeElement: null,
  body: {getAttribute: function () { return 'dark'; }, setAttribute: function () {}},
  createElement: function () { return {getContext: function () { return {fillStyle: '#000000'}; }}; },
  addEventListener: function () {}
};
var env = {document: doc, console: console,
  AE: {state: {settings: {search: 'saved'}}, refresh: function () { refreshes++; }},
  chrome: {webview: {postMessage: function (v) { messages.push(v); }}},
  getComputedStyle: function () { return {getPropertyValue: function (key) { return {'--bg':'#14161a', '--fg':'#dfe4ec', '--line':'#2f353f'}[key]; }}; }
};
env.window = env;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/dashboard.js'), 'utf8'), env);
function character(reward, runs, rating) { return {vault: {hasAvailableRewards: reward}, mp: {runsThisWeek: {total: runs}, rating: rating}}; }
env.AE.updateOverview([character(true, 3, 1200), character(false, 2, 2500)], 8);
assert.equal(nodes['overview-count'].textContent, 2);
assert.equal(nodes['overview-rewards'].textContent, 1);
assert.equal(nodes['overview-runs'].textContent, 5);
assert.equal(nodes['overview-rating'].textContent, '2,500');
assert.equal(nodes['board-search'].value, 'saved');
env.AE.updateOverview([], 8);
assert.equal(nodes['overview-count'].textContent, 0);
assert.equal(nodes['overview-rewards'].textContent, 0);
assert.equal(nodes['overview-runs'].textContent, 0);
env.AE.wireDashboard();
var search = nodes['board-search'];
search.events.compositionstart(); search.value = 'typing'; search.events.input();
assert.equal(refreshes, 0);
search.events.compositionend(); assert.equal(refreshes, 1);
assert.equal(env.AE.state.settings.search, 'typing');
doc.activeElement = search; search.value = ' typing ';
env.AE.updateOverview([], 8); assert.equal(search.value, ' typing ');
env.AE.syncDesktopTheme();
assert.equal(messages.length, 1);
assert.equal(messages[0].background, '#14161a');
assert.equal(messages[0].type, 'theme'); assert.equal(messages[0].dark, true);
delete env.chrome; env.AE.syncDesktopTheme();
assert.equal(messages.length, 1);
console.log('Dashboard chrome: checks passed (summary, empty state, IME, search sync, native bridge, browser fallback)');
