'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
for (const translated of [false, true]) {
  test('tree publication: ' + (translated ? 'valid coverage publishes' : 'failed coverage preserves last data'), () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-tree-publish-'));
    try {
      fs.mkdirSync(path.join(dir, 'tools/.talent-raw'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'app'));
      fs.copyFileSync(path.join(ROOT, 'tools/fetch-talent-tree.js'), path.join(dir, 'tools/fetch-talent-tree.js'));
      // Tiny independent raw fixture; no installed addon, private data, cache or network needed.
      const raw = Array.from({ length: 30 }, (_, i) => ({ specId: i + 1, traitTreeId: 1,
        className: 'Fixture', specName: 'spec' + i, fullNodeOrder: [10],
        classNodes: [{ id: 10, posX: 0, posY: 0, type: 'single', maxRanks: 1,
          entries: [{ id: 101, definitionId: 1, name: 'Test Talent', icon: 'test', spellId: 1, maxRanks: 1 }] }]
      }));
      fs.writeFileSync(path.join(dir, 'tools/.talent-raw/talents.json'), JSON.stringify(raw));
      for (const f of ['TraitDefinition.csv', 'SpellName.csv', 'TraitSubTree.csv']) {
        fs.writeFileSync(path.join(dir, 'tools/.talent-raw', f), 'ID\n');
      }
      fs.writeFileSync(path.join(dir, 'tools/.talent-names.json'), JSON.stringify({ names: translated ? { 1: '\u6d4b\u8bd5' } : { 2: 'unused' }, subs: {} }));
      const out = path.join(dir, 'app/talent-tree.js'); fs.writeFileSync(out, 'KEEP PREVIOUS TREE');
      const result = spawnSync(process.execPath, ['tools/fetch-talent-tree.js', '--offline'], { cwd: dir, encoding: 'utf8' });
      if (translated) {
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(fs.readFileSync(out, 'utf8'), /window.AE_TALENT_TREE/);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /95%/);
        assert.equal(fs.readFileSync(out, 'utf8'), 'KEEP PREVIOUS TREE');
      }
      assert.deepEqual(fs.readdirSync(path.dirname(out)), ['talent-tree.js'], 'no staging files left behind');
    } finally {
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(dir).startsWith('wow-tree-publish-'));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const failTree of [false, true]) {
  test('update orchestration: fresh tree first; tree failure=' + failTree, { skip: process.platform !== 'win32' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-update-order-'));
    try {
      fs.mkdirSync(path.join(dir, 'tools'));
      fs.copyFileSync(path.join(ROOT, 'tools/update-bis-data.ps1'), path.join(dir, 'tools/update-bis-data.ps1'));
      for (const rel of ['GearInsight/core/BisData.lua', 'GearInsight_Talents/PopularTalents.lua']) {
        const f = path.join(dir, 'game/_retail_/Interface/AddOns', rel);
        fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '-- fixture');
      }
      fs.writeFileSync(path.join(dir, 'tools/config.json'), JSON.stringify({ wowPaths: [path.join(dir, 'game')], includeFlavors: ['_retail_'] }));
      // Intercept the executable boundary. Not a single real fetch/generator may run in this test.
      fs.writeFileSync(path.join(dir, 'run.ps1'), '\ufeff' + [
        'function global:node {',
        '  param([string]$script)',
        '  Add-Content -LiteralPath (Join-Path $env:FIXTURE_ROOT "calls.txt") -Value ((Split-Path -Leaf $script) + "|" + ($args -join " "))',
        '  $global:LASTEXITCODE = if ($env:FAIL_TREE -eq "1" -and $script -like "*fetch-talent-tree.js") { 1 } else { 0 }',
        '}',
        '& (Join-Path $PSScriptRoot "tools/update-bis-data.ps1") -SkipRio',
        'exit $LASTEXITCODE'
      ].join('\r\n'));
      const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'run.ps1')], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, FIXTURE_ROOT: dir, FAIL_TREE: failTree ? '1' : '0' }
      });
      assert.equal(r.status, failTree ? 1 : 0, r.stdout + r.stderr);
      const calls = fs.readFileSync(path.join(dir, 'calls.txt'), 'utf8').trim().split(/\r?\n/);
      const ti = calls.findIndex(c => c.startsWith('fetch-talent-tree.js|'));
      const gi = calls.findIndex(c => c.startsWith('gen-talents.js|'));
      assert.ok(ti >= 0); assert.ok(calls[ti].includes('--refresh'), 'an update must not simply restamp cached data');
      if (failTree) assert.equal(gi, -1, 'do not pair new samples with a failed tree update');
      else assert.ok(gi > ti, 'tree must precede samples');
      assert.ok(!calls.some(c => c.startsWith('fetch-maxroll.js|')), 'retain bundled data for sources disallowing automated access');
    } finally {
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(dir).startsWith('wow-update-order-'));
      fs.rmSync(dir, { recursive:true, force:true });
    }
  });
}
