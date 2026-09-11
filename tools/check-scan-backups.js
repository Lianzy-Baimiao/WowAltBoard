/*
 * End-to-end regression test for backup collection in tools/scan.ps1.
 *
 * Same PowerShell unwrap trap as the BagSync bug (Issue #1): a function
 * returning a pipeline of zero or one item hands the caller $null / a bare
 * PSCustomObject unless the caller forces an array with @(...). The backups
 * path tolerates both shapes in `foreach`, so the emitted JS stays valid —
 * the symptoms were only a lying console count and a dead "-eq 0" check —
 * but the fix deserves the same guard, and this also pins the whole
 * 0/1/2-file path: scanner exits 0, data.js and backups.js both execute,
 * and the payload counts match what was planted.
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

function runCase(want) {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-backups-'));
  try {
    var base = path.join(tmp, 'WowAltBoard');
    var tools = path.join(base, 'tools');
    var wow = path.join(tmp, 'World of Warcraft');
    var flavor = path.join(wow, '_retail_');
    mkdir(tools);
    mkdir(path.join(flavor, 'Interface'));
    fs.copyFileSync(path.join(ROOT, 'tools', 'scan.ps1'), path.join(tools, 'scan.ps1'));
    write(path.join(tools, 'config.json'), JSON.stringify({
      wowPaths: [wow],
      absorbDownloadedSettings: false,
      checkForUpdates: false,
      collectBackups: true,
      readBagSync: false,
      includeFlavors: ['_retail_']
    }));

    for (var i = 0; i < Math.max(1, want); i++) {
      var sv = path.join(flavor, 'WTF', 'Account', 'ACCOUNT' + i, 'SavedVariables');
      write(path.join(sv, 'AlterEgo.lua'),
        'AlterEgoDB = { ["global"] = { ["weeklyReset"] = 1, ["characters"] = {}, }, }\n');
    }
    // The files Get-BackupSources looks for, one per account directory.
    // 0: none planted. 1: one Myslot.lua. 2: Myslot + edit-mode cache.
    var acct0 = path.join(flavor, 'WTF', 'Account', 'ACCOUNT0');
    if (want >= 1) {
      write(path.join(acct0, 'SavedVariables', 'Myslot.lua'),
        'MyslotExports = { ["exports"] = { } }\n');
    }
    if (want >= 2) {
      write(path.join(acct0, 'edit-mode-cache-account.txt'), 'EDIT_MODE_CACHE_DUMMY_PAYLOAD\n');
    }

    var r = cp.spawnSync(PS,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tools, 'scan.ps1')],
      { cwd: base, encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      throw new Error('scanner exit ' + r.status + ': '
        + String(r.stdout || r.stderr || '').trim().split(/\r?\n/).slice(-4).join(' / '));
    }

    var context = { window: {} };
    var dataText = fs.readFileSync(path.join(base, 'data', 'data.js'), 'utf8').replace(/^﻿/, '');
    var bakText = fs.readFileSync(path.join(base, 'data', 'backups.js'), 'utf8').replace(/^﻿/, '');
    vm.runInNewContext(dataText, context, { filename: 'data.js' });
    vm.runInNewContext(bakText, context, { filename: 'backups.js' });

    checks += 3;
    if (!Array.isArray(context.window.AE_BACKUPS) || context.window.AE_BACKUPS.length !== want) {
      failures.push(want + ' backups: backups.js contains '
        + (context.window.AE_BACKUPS && context.window.AE_BACKUPS.length) + ' payloads');
    }
    var idx = context.window.AE_DATA.backupIndex;
    if (!Array.isArray(idx) || idx.length !== want) {
      failures.push(want + ' backups: data.js backupIndex has '
        + (idx && idx.length) + ' entries');
    }
    if (idx && idx.length && !idx.every(function (e) { return e && e.id && e.label; })) {
      failures.push(want + ' backups: a backupIndex entry is missing id/label');
    }
  } catch (e) {
    failures.push(want + ' backups: ' + e.message);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

[0, 1, 2].forEach(runCase);
console.log('备份扫描：检查项 ' + checks + '，问题 ' + failures.length
  + '（0 / 1 / 2 个备份文件均须生成可执行的 data.js 和 backups.js，且条数与种进去的一致）');
failures.forEach(function (x) { console.log('  · ' + x); });
process.exit(failures.length ? 1 : 0);
