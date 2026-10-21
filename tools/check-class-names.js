'use strict';
/*
 * WowAltBoard - tools/check-class-names.js
 *
 * 回归：tools/fetch-class-names.js 怎么判定「玩家职业」。
 *
 * 12.1.5 的 DB2 里多了一个隐藏职业 ID 15「旅行者」(TRAVELER)：4 个专精
 * （「初始」+ 名字还是英文占位的 Witch / Slayer / Inquisitor），没有精通，也没有天赋树。
 * 旧判定「专精数 >= 3」把它算成了玩家职业，交叉校验失败，更新数据.bat 第 1 步报错。
 *
 * 这里从 app/class-names.js 反推一份假的 ChrClasses / ChrSpecialization CSV，
 * 再加上冒险者 / 旅行者 / 宠物专精，用 --raw-dir / --out 在临时目录里跑生成器
 * （不联网，不碰 tools/.db2-names/ 和 app/class-names.js）：
 *   1. 隐藏职业和宠物专精都被丢掉，产物和仓库里的 app/class-names.js 一致（日期除外）；
 *   2. 隐藏职业带上精通、却没有天赋树 → 两条定义对不上，硬失败，不写文件；
 *   3. CSV 没有 MasterySpellID_0 列 → 硬失败，不写文件。
 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var assert = require('assert');

var ROOT = path.resolve(__dirname, '..');
var TOOL = path.join(__dirname, 'fetch-class-names.js');

function pad(s) { return (s + '　　　　　　').slice(0, 12); }
function lastLine(text) {
  var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
  return lines.length ? lines[lines.length - 1] : '（没有输出）';
}
function loadGlobal(file, key) {
  var g = {};
  g.window = g;
  new Function('window', fs.readFileSync(file, 'utf8'))(g);
  return g[key];
}

// Blizzard 的职业 ID（ChrClasses.ID）是固定的；和 12.1.5 DB2 实测一致。
var CLASS_ID = {
  WARRIOR: 1, PALADIN: 2, HUNTER: 3, ROGUE: 4, PRIEST: 5, DEATHKNIGHT: 6, SHAMAN: 7,
  MAGE: 8, WARLOCK: 9, MONK: 10, DRUID: 11, DEMONHUNTER: 12, EVOKER: 13
};
// 非玩家职业的专精，ID / 名字照抄 12.1.5 DB2（旅行者那三个就是英文占位）。
var HIDDEN = [
  { id: 1478, cls: 14, name: '冒险者' },
  { id: 1492, cls: 15, name: '旅行者' },
  { id: 1496, cls: 15, name: 'Witch' },
  { id: 1497, cls: 15, name: 'Slayer' },
  { id: 1498, cls: 15, name: 'Inquisitor' }
];
// ClassID 0 的宠物专精：名字不是中文，也必须在「名字得是中文」之前被丢掉。
var PETS = [{ id: 74, name: 'Ferocity' }, { id: 79, name: 'Cunning' }, { id: 81, name: 'Tenacity' }];

function toCsv(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n') + '\n';
}

function fixture(names, tree) {
  var classes = [['Name_lang', 'Filename', 'Flags', 'ID']];
  Object.keys(CLASS_ID).forEach(function (file) {
    assert.ok(names.cls[file], 'app/class-names.js 缺职业 ' + file);
    classes.push([names.cls[file], file, '0', CLASS_ID[file]]);
  });
  classes.push(['冒险者', 'Adventurer', '2197554', 14]);
  classes.push(['旅行者', 'TRAVELER', '2197554', 15]);

  var realIds = {};
  Object.keys(CLASS_ID).forEach(function (k) { realIds[CLASS_ID[k]] = 1; });
  var specs = [];
  Object.keys(names.spec).forEach(function (id) {
    var zh = names.spec[id][0], cid = names.spec[id][1];
    assert.ok(realIds[cid], 'app/class-names.js 里的专精 ' + id + ' 不属于玩家职业（classID ' + cid + '）');
    // 有天赋树的是战斗专精，带精通；「初始」起始专精没有 —— 和真 DB2 一样。
    specs.push({ id: id, cls: cid, name: zh, mastery: tree.specs[id] ? 100000 + Number(id) : 0 });
  });
  return { classes: classes, specs: specs };
}

function specCsv(base, opts) {
  var head = ['Name_lang', 'Description_lang', 'ID', 'ClassID', 'OrderIndex', 'Role', 'Flags',
    'MasterySpellID_0', 'MasterySpellID_1'];
  var rows = [head];
  function add(s) {
    rows.push([s.name, '说明，带英文逗号,和 "引号"\n还有换行', s.id, s.cls, 0, 2, 0, s.mastery, 0]);
  }
  base.specs.forEach(add);
  HIDDEN.forEach(function (h) {
    // hiddenMastery：旅行者的三个战斗专精真带上了精通（职业快上线时 DB2 会这样）。
    var m = opts.hiddenMastery && h.cls === 15 && h.id !== 1492 ? 900000 + h.id : 0;
    add({ id: h.id, cls: h.cls, name: h.name, mastery: m });
  });
  PETS.forEach(function (p) { add({ id: p.id, cls: 0, name: p.name, mastery: 0 }); });
  if (opts.dropMastery) {
    var col = head.indexOf('MasterySpellID_0');
    rows = rows.map(function (r) { return r.filter(function (_, i) { return i !== col; }); });
  }
  return toCsv(rows);
}

function run(classesCsv, specsCsv) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-class-names-'));
  try {
    fs.writeFileSync(path.join(dir, 'ChrClasses.csv'), classesCsv, 'utf8');
    fs.writeFileSync(path.join(dir, 'ChrSpecialization.csv'), specsCsv, 'utf8');
    var out = path.join(dir, 'out-class-names.js');
    var r = cp.spawnSync(process.execPath, [TOOL, '--offline', '--raw-dir', dir, '--out', out],
      { encoding: 'utf8', timeout: 60000, windowsHide: true });
    return {
      status: r.status,
      text: String(r.stdout || '') + String(r.stderr || ''),
      names: fs.existsSync(out) ? loadGlobal(out, 'AE_DB2_NAMES') : null
    };
  } finally {
    var abs = path.resolve(dir);
    assert.equal(path.dirname(abs), path.resolve(os.tmpdir()));
    assert.ok(path.basename(abs).indexOf('wow-class-names-') === 0);
    fs.rmSync(abs, { recursive: true, force: true });
  }
}

function main() {
  var names = loadGlobal(path.join(ROOT, 'app', 'class-names.js'), 'AE_DB2_NAMES');
  var tree = loadGlobal(path.join(ROOT, 'app', 'talent-tree.js'), 'AE_TALENT_TREE');
  assert.ok(names && names.cls && names.spec, 'app/class-names.js 没加载出来');
  assert.ok(tree && tree.specs, 'app/talent-tree.js 没加载出来');
  assert.equal(Object.keys(names.cls).length, 13, 'app/class-names.js 不是 13 个职业');
  var base = fixture(names, tree);
  var classesCsv = toCsv(base.classes);

  // 1. 旧判定在这里失败：旅行者 4 个专精 >= 3。
  var ok = run(classesCsv, specCsv(base, {}));
  assert.equal(ok.status, 0, '带隐藏职业的 DB2 没生成出来：' + lastLine(ok.text));
  assert.ok(ok.names, '退出码 0 却没写出文件');
  assert.deepStrictEqual(ok.names.cls, names.cls, '职业表和仓库里的 app/class-names.js 不一致');
  assert.deepStrictEqual(ok.names.spec, names.spec, '专精表和仓库里的 app/class-names.js 不一致');
  HIDDEN.concat(PETS).forEach(function (h) {
    assert.ok(!(h.id in ok.names.spec), '非玩家专精 ' + h.id + '（' + h.name + '）混进了产物');
  });
  assert.ok(/3 个 ClassID=0 的宠物专精、5 个非玩家职业的专精被丢掉/.test(ok.text),
    '没报出丢掉的非玩家专精：' + lastLine(ok.text));

  // 2. 隐藏职业像真职业一样带精通，但天赋树里没有它：必须停下来，而不是二选一。
  var bad = run(classesCsv, specCsv(base, { hiddenMastery: true }));
  assert.equal(bad.status, 1, '隐藏职业带精通时没有失败：' + lastLine(bad.text));
  assert.ok(/两条「玩家职业」定义不一致[^\n]*TRAVELER/.test(bad.text), '失败原因不对：' + lastLine(bad.text));
  assert.equal(bad.names, null, '交叉校验失败时不许写文件');

  // 3. 精通列没了，①就退化成「谁都不是玩家职业」：报结构变了，不许写文件。
  var nocol = run(classesCsv, specCsv(base, { dropMastery: true }));
  assert.equal(nocol.status, 1, '缺 MasterySpellID_0 列时没有失败：' + lastLine(nocol.text));
  assert.ok(/MasterySpellID_0/.test(nocol.text), '失败原因不对：' + lastLine(nocol.text));
  assert.equal(nocol.names, null, '缺列失败时不许写文件');
}

try {
  main();
} catch (e) {
  console.log(pad('职业名生成') + '不通过');
  console.log('  · ' + String((e && e.message) || e).split(/\r?\n/)[0]);
  process.exit(1);
}
console.log(pad('职业名生成') + '通过（隐藏职业 / 宠物专精被排除；职业定义冲突、缺精通列都会硬失败且不写文件）');
