'use strict';
// Independent, hand-authored fixtures: these expectations do not come from the old validators.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
function app() {
  const g = { AE: {}, document: {}, console }; g.window = g;
  for (const file of ['talent-decode.js', 'bis.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'app', file), 'utf8'), g);
  }
  return g.AE;
}
function plain(x) { return JSON.parse(JSON.stringify(x)); }
function tree() {
  return { types: ['single', 'choice'], nodes: {
    10: [0, 0, 2, 0, 0, [[101, 0, 0, 1, 2]], 0, 0],
    20: [0, 0, 1, 1, 0, [[102, 0, 0, 2, 1], [103, 0, 0, 3, 1]], 0, 0],
    30: [0, 0, 1, 0, 0, [[201, 0, 0, 4, 1]], 0, 0]
  }, specs: { 71: { classNodes: [10], specNodes: [20], heroNodes: [], subNodes: [] } } };
}
function spec() {
  return { specId: 71, dict: [101, 201, 999, 102, 103], base: [1, 2],
    builds: [[], [1, 0, 4, 1], [2, 1], [3, 1], [1, 3], [4, 1, 5, 1]],
    content: { raid: [{ n: 'boss', p: [0, 1, 2, 3, 4, 5].map(i => [i, 0, 'p' + i, 0, 'eu']) }] } };
}
test('missing build reference must not decode into the first player build', () => {
  const ae = app();
  assert.equal(ae.decodeTalentBuild(spec(), 99), null);
  assert.equal(ae.decodeTalentBuild(spec(), -1), null);
  assert.equal(ae.decodeTalentBuild(spec(), '0'), null);
});
test('base is real data, ranks are not dictionary references, zero deletes', () => {
  const ae = app();
  assert.deepEqual(plain(ae.decodeTalentBuild(spec(), 0)), { 101: 2 });
  assert.deepEqual(plain(ae.decodeTalentBuild(spec(), 1)), { 102: 1 });
});
test('one validated view feeds tree picks, counts and player rows without renumbering', () => {
  const api = app().TalentData;
  const s = spec(), before = JSON.stringify(s);
  const result = api.screen(s, tree());
  assert.deepEqual(plain(result.rejected.map(b => b.index)), [2, 3, 4, 5]);
  assert.equal(result.removedRows, 4);
  assert.equal(result.acceptedBuilds, 2);
  assert.deepEqual(plain(result.data.content.raid[0].p.map(p => p[0])), [0, 1]);
  assert.equal(JSON.stringify(s), before, 'keep original evidence immutable');
  assert.equal(result.data.builds, s.builds, 'no index shifts');
});
test('unknown entries removed by a delta do not invalidate the selected build', () => {
  const s = spec(); s.base = [3, 1]; s.builds = [[], [3, 0, 1, 2]];
  const result = app().TalentData.screen(s, tree());
  assert.deepEqual(plain(result.rejected.map(b => b.index)), [0]);
  assert.equal(result.data.content.raid[0].p.length, 1);
  assert.equal(result.data.content.raid[0].p[0][0], 1);
});
test('tree missing: no unverified sample is offered as a complete build', () => {
  const result = app().TalentData.screen(spec(), null);
  assert.equal(result.acceptedBuilds, 0);
  assert.equal(result.removedRows, 6);
});
function generate(lua) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-talent-input-'));
  try {
    for (const d of ['tools', 'app']) fs.mkdirSync(path.join(dir, d));
    // Run the actual CLI, isolated from the bundled data and installed addons.
    for (const f of ['tools/gen-talents.js', 'app/lua-parser.js', 'app/talent-decode.js', 'app/talent-tree.js']) {
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
    fs.writeFileSync(path.join(dir, 'app/talent-tree.js'), 'window.AE_TALENT_TREE=' + JSON.stringify(tree()) + ';');
    fs.writeFileSync(path.join(dir, 'input.lua'), lua);
    fs.writeFileSync(path.join(dir, 'GearInsight_Talents.toc'), '## Version: fixture-1\n');
    const out = path.join(dir, 'app/talent-data.js'); fs.writeFileSync(out, 'KEEP PREVIOUS DATA');
    const run = spawnSync(process.execPath, ['tools/gen-talents.js', '--lua', 'input.lua'], { cwd: dir, encoding: 'utf8' });
    return { status: run.status, text: run.stdout + run.stderr, output: fs.readFileSync(out, 'utf8') };
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('wow-talent-input-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
for (const ref of ['99', '0', '-1', '1.5', 'nil']) {
  test('generator rejects broken pool reference ' + ref + ' and keeps last file', () => {
    const result = generate('GearInsightPopularTalents = { ["WARRIOR/ARMS"] = { specID=71, dict={101}, pool={{1,1}}, content={raid={{enc="boss",list={{b=' + ref + ',player="test"}}}}} } }');
    assert.notEqual(result.status, 0, result.text);
    assert.equal(result.output, 'KEEP PREVIOUS DATA');
  });
}

test('hero subtree selector is a choice, not a purchased rank-zero talent', () => {
  const t = tree(); t.types.push('subtree');
  t.nodes[40] = [0, 0, 0, 2, 0, [[301, 0, 0, 0, 0]], 0, 0];
  t.specs[71].subNodes = [40];
  const s = spec(); s.dict.push(301); s.base.push(6, 1); s.builds = [[]];
  assert.equal(app().TalentData.screen(s, t).rejected.length, 0);
});

test('generator publishes a valid candidate, keeps exact mappings and reads adjacent TOC', () => {
  const result = generate('GearInsightPopularTalents = { ["WARRIOR/ARMS"] = { specID=71, dict={101,102,999}, pool={{1,2},{2,1},{3,1}}, content={raid={{enc="boss",list={{b=2,player="A"},{b=1,player="B"},{b=3,player="C"}}}}} } }');
  assert.equal(result.status, 0, result.text);
  const g = { window: {} }; vm.runInNewContext(result.output, g);
  const d = g.window.AE_TALENTS, s = d.specs['WARRIOR/ARMS'];
  assert.equal(d.addonVersion, 'fixture-1');
  assert.match(d.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(d.source.treeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(plain(s.content.raid[0].p.map(p => p[0])), [1, 0, 2]);
  assert.deepEqual(plain(app().TalentData.decode(s, 1)), { 102: 1 });
  assert.equal(d.quality['WARRIOR/ARMS'].removedRows, 1);
  assert.equal(d.quality['WARRIOR/ARMS'].rejected[0].index, 2);
});
for (const flat of ['1', '1,-1', '1,1.5', '9,1', '1,1,1,2']) {
  test('generator rejects malformed input pairs ' + flat, () => {
    const result = generate('GearInsightPopularTalents = { ["WARRIOR/ARMS"] = { specID=71, dict={101}, pool={{' + flat + '}}, content={raid={{list={{b=1}}}}} } }');
    assert.notEqual(result.status, 0);
    assert.equal(result.output, 'KEEP PREVIOUS DATA');
  });
}
test('an entirely incompatible source cannot replace the last usable snapshot', () => {
  const result = generate('GearInsightPopularTalents = { ["WARRIOR/ARMS"] = { specID=71, dict={999}, pool={{1,1}}, content={raid={{list={{b=1}}}}} } }');
  assert.notEqual(result.status, 0);
  assert.match(result.text, /no usable samples/);
  assert.equal(result.output, 'KEEP PREVIOUS DATA');
});
test('bundled data audit independently expects exactly six quarantined builds / ten source rows', () => {
  const g = { window: {} };
  for (const f of ['talent-tree', 'talent-data']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'app', f + '.js'), 'utf8'), g);
  const expected = { 'MONK/MISTWEAVER': [50,85,89,94], 'WARRIOR/PROTECTION': [73,88] };
  let builds = 0, rows = 0;
  for (const [key, s] of Object.entries(g.window.AE_TALENTS.specs)) {
    const result = app().TalentData.screen(s, g.window.AE_TALENT_TREE);
    assert.deepEqual(plain(result.rejected.map(b => b.index)), expected[key] || []);
    rows += result.removedRows; builds += s.builds.length;
    for (const encs of Object.values(result.data.content)) for (const enc of encs) {
      for (const p of enc.p) assert.ok(!(expected[key] || []).includes(p[0]));
    }
  }
  assert.equal(builds, 3972); assert.equal(rows, 10);
});
test('verifier decodes base plus delta instead of reading rank numbers as indices', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-talent-audit-'));
  try {
    const g = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'app/talent-tree.js'), 'utf8'), g);
    const t = g.window.AE_TALENT_TREE, sp = t.specs[71];
    const n = sp.classNodes.map(id => t.nodes[id]).find(n => n[2] >= 1 && t.types[n[3]] === 'single');
    const d = { specs: { 'WARRIOR/ARMS': { specId: 71, dict: [999999999, n[5][0][0]], base: [1,1],
      builds: [[], [1,0,2,1]], content: { raid: [{ p: [[0,0,'A',0,'eu'], [1,0,'B',0,'eu']] }] } } } };
    const file = path.join(dir, 'data.js'); fs.writeFileSync(file, 'window.AE_TALENTS=' + JSON.stringify(d));
    const script = 'process.argv.push("fixture", "--data",' + JSON.stringify(file) + ');console.log("RESULT="+JSON.stringify(require("./tools/verify-talent-tree.js").cross));';
    const run = spawnSync(process.execPath, ['-e', script], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const result = JSON.parse(run.stdout.match(/RESULT=(.*)/)[1]);
    assert.equal(result.builds, 2); assert.equal(result.missing, 1); assert.equal(result.dirty, 0);
    assert.equal(result.removedRows, 1);
    const strict = spawnSync(process.execPath, ['tools/verify-talent-tree.js', '--data', file, '--strict-data'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(strict.status, 1, 'strict audits must not report incomplete source data as clean');
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('wow-talent-audit-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
