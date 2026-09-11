/*
 * End-to-end regression test for BagSync account counting in tools/scan.ps1.
 *
 * PowerShell unwraps pipeline results: no results become $null and one result
 * becomes the object itself. Both have an empty `.Count`, which once generated
 * invalid JavaScript (`accounts: ,`). Build temporary WoW trees with 0, 1, and
 * 2 BagSync files and run the real scanner against each one.
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
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-bagsync-'));
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
      collectBackups: false,
      readBagSync: true,
      includeFlavors: ['_retail_']
    }));

    for (var i = 0; i < Math.max(1, want); i++) {
      var sv = path.join(flavor, 'WTF', 'Account', 'ACCOUNT' + i, 'SavedVariables');
      write(path.join(sv, 'AlterEgo.lua'),
        'AlterEgoDB = { ["global"] = { ["weeklyReset"] = 1, ["characters"] = {}, }, }\n');
      if (i < want) {
        write(path.join(sv, 'BagSync.lua'),
          'BagSyncDB = { ["Realm"] = { ["Character' + i + '"] = { ["guid"] = "Player-' + i + '", }, }, }\n');
      }
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
    var bagText = fs.readFileSync(path.join(base, 'data', 'bagsync.js'), 'utf8').replace(/^﻿/, '');
    vm.runInNewContext(dataText, context, { filename: 'data.js' });
    vm.runInNewContext(bagText, context, { filename: 'bagsync.js' });

    checks++;
    if (context.window.AE_DATA.bagSync.accounts !== want) {
      failures.push(want + ' files: data.js says accounts=' + context.window.AE_DATA.bagSync.accounts);
    }
    checks++;
    if (!Array.isArray(context.window.AE_BAGSYNC) || context.window.AE_BAGSYNC.length !== want) {
      failures.push(want + ' files: bagsync.js contains '
        + (context.window.AE_BAGSYNC && context.window.AE_BAGSYNC.length) + ' payloads');
    }
  } catch (e) {
    failures.push(want + ' files: ' + e.message);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

[0, 1, 2].forEach(runCase);
console.log('BagSync 扫描：检查项 ' + checks + '，问题 ' + failures.length
  + '（0 / 1 / 2 个账号均须生成可执行的 data.js，且计数与 bagsync.js 一致）');
failures.forEach(function (x) { console.log('  · ' + x); });
process.exit(failures.length ? 1 : 0);
