/*
 * End-to-end regression test: the scanner and the model must find AlterEgo's
 * lookup tables in both addon layouts.
 *
 * AlterEgo 1.6.6 (patch 12.1.5) moved Dungeons / Raids / Seasons / Inventory /
 * UpgradeTracks into its embedded library, Interface\AddOns\AlterEgo\Libs\
 * LiqUI\Data\, and Data.dungeons left MythicPlus.lua for a new Dungeons.lua.
 * The scanner only looked in Data\, so a 1.6.6 install silently lost them:
 * the season label read "S18" instead of "S2", every M+ column abbr became
 * "?", raid columns showed "#2987" and sorted by instanceID. No error, no
 * warning -- the page just got quietly worse.
 *
 * Builds fake WoW trees for the 1.6.6 layout (plus a stale Data\Raids.lua that
 * an overwrite install can leave behind, which must NOT win) and the 1.6.5
 * layout, runs the real scanner on each, and feeds the generated data.js
 * through the real model.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var PS = process.platform === 'win32' ? 'powershell.exe' : 'powershell';
var failures = [];
var checks = 0;

function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function write(p, text) { mkdir(path.dirname(p)); fs.writeFileSync(p, text, 'utf8'); }
function check(ok, msg) { checks++; if (!ok) failures.push(msg); }

// Row shapes copied from the real files (AlterEgo 1.6.5 Data\ and 1.6.6
// Libs\LiqUI\Data\), trimmed to the fields the dashboard reads.
var LIQ_HEAD = '---@class LiqUI\nlocal LiqUI = LibStub and LibStub("LiqUI-1.0", true)\n'
  + 'if not LiqUI or not LiqUI.Data then\n  return\nend\n\nlocal Data = LiqUI.Data\n\n';
var AE_HEAD = '---@class AE_Addon\nlocal addon = select(2, ...)\n\nlocal Data = addon.Data\n\n';

function dungeonRows(rows) {
  return 'Data.dungeons = {\n' + rows.map(function (r) {
    return '  {seasonID = ' + r[0] + ', seasonDisplayID = ' + (r[0] - 16) + ', challengeModeID = ' + r[1]
      + ', mapId = ' + r[2] + ', encounters = {}, loot = {}, teleports = {' + r[3] + '}, time = 0, abbr = "'
      + r[4] + '", name = "' + r[5] + '"},';
  }).join('\n') + '\n}\n';
}
var DUNGEONS = dungeonRows([
  [17, 556, 658, 1254555, 'POS', 'Pit of Saron'],
  [17, 161, 1209, 159898, 'SR', 'Skyreach'],
  [18, 588, 2993, 1286812, 'AOF', 'Altar of Fangs'],
  [18, 587, 2813, 1286809, 'MR', 'Murder Row'],
  [18, 249, 1762, 1286831, 'KR', "Kings' Rest"]
]);
// The id list a correct model derives from DUNGEONS for season 18, in order.
var WANT_IDS = [588, 587, 249];

// 1.6.6 raids: difficulty ids became DifficultyUtil symbols, Kith'ix is order 3.
var RAIDS_LIQ = 'Data.raids = {\n'
  + '  {seasonID = 18, seasonDisplayID = 2, instanceID = 2987, order = 1, numEncounters = 1, encounters = {}, loot = {}, modifiedInstanceInfo = nil, abbr = "TG", name = "The Tidebound Grotto"},\n'
  + '  {seasonID = 18, seasonDisplayID = 2, instanceID = 3004, order = 2, numEncounters = 8, encounters = {}, loot = {}, modifiedInstanceInfo = nil, abbr = "VA", name = "The Venomous Abyss"},\n'
  + '  {seasonID = 18, seasonDisplayID = 2, instanceID = 3095, order = 3, numEncounters = 1, encounters = {}, loot = {}, modifiedInstanceInfo = nil, abbr = "UK", name = "The Unbinding of Kith\'ix"},\n'
  + '}\n\nData.raidDifficulties = {\n'
  + '  {id = DifficultyUtil.ID.PrimaryRaidNormal, order = 2, abbr = "N", name = "Normal", color = RARE_BLUE_COLOR},\n'
  + '  {id = DifficultyUtil.ID.PrimaryRaidMythic, order = 4, abbr = "M", name = "Mythic", color = LEGENDARY_ORANGE_COLOR},\n'
  + '}\n';
// 1.6.5 raids: numeric difficulty ids, no Kith'ix yet.
var RAIDS_OLD = 'Data.raids = {\n'
  + '  {seasonID = 18, seasonDisplayID = 2, instanceID = 2987, order = 1, numEncounters = 1, encounters = {}, loot = {}, abbr = "TG", name = "The Tidebound Grotto"},\n'
  + '  {seasonID = 18, seasonDisplayID = 2, instanceID = 3004, order = 2, numEncounters = 8, encounters = {}, loot = {}, abbr = "VA", name = "The Venomous Abyss"},\n'
  + '}\n\nData.raidDifficulties = {\n'
  + '  {id = 14, color = RARE_BLUE_COLOR, order = 2, abbr = "N", name = "Normal"},\n'
  + '  {id = 16, color = LEGENDARY_ORANGE_COLOR, order = 4, abbr = "M", name = "Mythic"},\n'
  + '}\n';
var SEASONS = 'Data.seasons = {\n'
  + '  {seasonID = 17, seasonDisplayID = 1, expansionID = Enum.ExpansionLevel.Midnight, name = "Midnight - Season 1"},\n'
  + '  {seasonID = 18, seasonDisplayID = 2, expansionID = Enum.ExpansionLevel.Midnight, name = "Midnight - Season 2"},\n'
  + '}\n';
var AFFIXES = 'Data.affixes = {\n  {id = 10, base = 1, name = "", description = "", fileDataID = nil},\n}\n\n'
  + 'Data.keystones = {\n  {itemID = 180653},\n}\n';
var VAULT = 'Data.mythicPlusVaultItemLevels = {\n  [18] = {\n    [2] = 305,\n    [10] = 318,\n  },\n}\n';

var LAYOUTS = {
  // What AlterEgo 1.6.6 actually ships, plus the 1.6.5 Data\Raids.lua that an
  // overwrite install leaves behind. The game no longer loads that file, so
  // the scanner must not either.
  '1.6.6': {
    version: 'v1.6.6',
    files: {
      'Data\\MythicPlus.lua': AE_HEAD + AFFIXES,
      'Data\\Vault.lua': AE_HEAD + VAULT,
      'Data\\Raids.lua': AE_HEAD + RAIDS_OLD,
      'Libs\\LiqUI\\Data\\Dungeons.lua': LIQ_HEAD + DUNGEONS,
      'Libs\\LiqUI\\Data\\Raids.lua': LIQ_HEAD + RAIDS_LIQ,
      'Libs\\LiqUI\\Data\\Seasons.lua': LIQ_HEAD + SEASONS
    }
  },
  '1.6.5': {
    version: 'v1.6.5',
    files: {
      'Data\\MythicPlus.lua': AE_HEAD + AFFIXES + '\n' + DUNGEONS,
      'Data\\Vault.lua': AE_HEAD + VAULT,
      'Data\\Raids.lua': AE_HEAD + RAIDS_OLD,
      'Data\\Seasons.lua': AE_HEAD + SEASONS
    }
  }
};

// The browser load order for the files buildModel needs (same as tests.html).
function loadModel(dataText) {
  var ctx = { window: {} };
  vm.createContext(ctx);
  ['app/class-names.js', 'app/lua-parser.js', 'app/labels.js', 'app/model.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, ''), ctx, { filename: f });
  });
  vm.runInContext(dataText, ctx, { filename: 'data.js' });
  return ctx.window;
}

function runCase(name) {
  var layout = LAYOUTS[name];
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-addontables-'));
  try {
    var base = path.join(tmp, 'WowAltBoard');
    var tools = path.join(base, 'tools');
    var wow = path.join(tmp, 'World of Warcraft');
    var flavor = path.join(wow, '_retail_');
    var addon = path.join(flavor, 'Interface', 'AddOns', 'AlterEgo');
    mkdir(tools);
    fs.copyFileSync(path.join(ROOT, 'tools', 'scan.ps1'), path.join(tools, 'scan.ps1'));
    write(path.join(tools, 'config.json'), JSON.stringify({
      wowPaths: [wow],
      absorbDownloadedSettings: false,
      checkForUpdates: false,
      collectBackups: false,
      readBagSync: false,
      includeFlavors: ['_retail_']
    }));
    write(path.join(addon, 'AlterEgo.toc'), '## Interface: 120105\n## Title: AlterEgo\n## Version: '
      + layout.version + '\n');
    Object.keys(layout.files).forEach(function (rel) {
      write(path.join.apply(path, [addon].concat(rel.split('\\'))), layout.files[rel]);
    });
    write(path.join(flavor, 'WTF', 'Account', 'ACCOUNT0', 'SavedVariables', 'AlterEgo.lua'),
      'AlterEgoDB = { ["global"] = { ["weeklyReset"] = 1, ["characters"] = {}, }, }\n');

    var r = cp.spawnSync(PS,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tools, 'scan.ps1')],
      { cwd: base, encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      throw new Error('scanner exit ' + r.status + ': '
        + String(r.stdout || r.stderr || '').trim().split(/\r?\n/).slice(-4).join(' / '));
    }
    var dataText = fs.readFileSync(path.join(base, 'data', 'data.js'), 'utf8').replace(/^\uFEFF/, '');
    var w = loadModel(dataText);
    var raw = w.AE_DATA;
    var m = w.AE.buildModel(raw);
    var tag = name + ': ';

    check(raw.addonVersion === layout.version, tag + 'addonVersion = ' + raw.addonVersion);
    check(m.activeSeason === 18, tag + 'activeSeason = ' + m.activeSeason + ' (want 18)');
    check(JSON.stringify(m.columns.dungeonIds) === JSON.stringify(WANT_IDS),
      tag + 'M+ columns = ' + JSON.stringify(m.columns.dungeonIds) + ' (want ' + JSON.stringify(WANT_IDS) + ')');
    var abbrs = WANT_IDS.map(function (id) {
      var d = m.tables.dungeonById[id];
      return d ? d.abbr : '?';
    }).join('/');
    check(abbrs === 'AOF/MR/KR', tag + 'dungeon abbrs = ' + abbrs);
    check(m.season.short === 'S2', tag + 'season label = ' + m.season.short + ' (want S2, not S18)');
    check(m.tables.raidByInstance[3004] && m.tables.raidByInstance[3004].order === 2,
      tag + 'raid table missing The Venomous Abyss');
    check(m.tables.vaultItemLevels['18'] && m.tables.vaultItemLevels['18']['10'] === 318,
      tag + 'vault item levels not read from Data\\Vault.lua');

    if (name === '1.6.6') {
      check(raw.addonTables['Dungeons.lua'] != null, tag + 'Dungeons.lua not embedded');
      // The stale Data\Raids.lua has no 3095. Finding it proves LiqUI won.
      var uk = m.tables.raidByInstance[3095];
      check(uk && uk.abbr === 'UK' && uk.order === 3,
        tag + "raid 3095 (Kith'ix) missing -- the stale Data\\Raids.lua won over Libs\\LiqUI\\Data");
      check(w.AE.Labels.raidLabel(3095, '', uk ? uk.name : '', 'UK') === '基希克斯破封',
        tag + 'raid 3095 has no zhCN fallback name');
      // A leftover Data.dungeons in MythicPlus.lua must not override Dungeons.lua.
      var stale = {};
      Object.keys(raw.addonTables).forEach(function (k) { stale[k] = raw.addonTables[k]; });
      stale['MythicPlus.lua'] = AE_HEAD + AFFIXES + '\n'
        + dungeonRows([[18, 999, 9999, 1, 'OLD', 'Stale Dungeon']]);
      var m2 = w.AE.buildModel({ sources: raw.sources, addonTables: stale, scannedAt: raw.scannedAt });
      check(JSON.stringify(m2.columns.dungeonIds) === JSON.stringify(WANT_IDS),
        tag + 'stale MythicPlus.lua dungeons won over Dungeons.lua: ' + JSON.stringify(m2.columns.dungeonIds));
    }
  } catch (e) {
    failures.push(name + ': ' + e.message);
  } finally {
    var full = path.resolve(tmp), prefix = path.resolve(os.tmpdir()) + path.sep;
    if (full.indexOf(prefix) !== 0 || path.basename(full).indexOf('WowAltBoard-addontables-') !== 0) throw Error('unsafe cleanup');
    fs.rmSync(full, { recursive: true, force: true });
  }
}

Object.keys(LAYOUTS).forEach(runCase);
console.log('插件数据表扫描：检查项 ' + checks + '，问题 ' + failures.length
  + '（AlterEgo 1.6.6 的 Libs\\LiqUI\\Data 与 1.6.5 的 Data\\ 两种布局都要读到副本 / 团本 / 赛季表）');
failures.forEach(function (x) { console.log('  · ' + x); });
process.exit(failures.length ? 1 : 0);
