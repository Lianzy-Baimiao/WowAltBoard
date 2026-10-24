/*
 * WowAltBoard - tools/verify-simc-data.js
 *
 * app/simc-data.js 的**可执行格式定义**。和 verify-rio-data.js / verify-wcl-data.js 同一套路：
 * 字段形状、引用完整性，外加两条只有这份数据才有的硬判据 ——
 *   · 每条天赋串用**面板那份解码器**（app/talent-decode.js）重新解一遍：版本 2、specID 和
 *     所在专精一致、点数和英雄子树与生成时声明的一致。生成器用的是 tools/decode-talent-string.js，
 *     两份独立实现对上账，才说明「这串画出来的树就是 SimC 那一套」；
 *   · 装等来源可追溯：s=c（配置写明）或 s=b（bonus_id 查表，b 必须在 ilvlByBonus 里、装等等于表值）。
 *     没有来源就不许有装等 —— 面板上的数字必须说得出是谁给的。
 *
 * 用法：node tools\verify-simc-data.js [app\simc-data.js]
 */
'use strict';

var fs = require('fs');
var path = require('path');

var BASE = path.resolve(__dirname, '..');
var dataPath = process.argv[2] || path.join(BASE, 'app', 'simc-data.js');
if (!fs.existsSync(dataPath)) {
  console.error('没有 ' + dataPath + ' —— 先跑 node tools\\fetch-simc.js');
  process.exit(1);
}
var win = {};
new Function('window', fs.readFileSync(dataPath, 'utf8'))(win); // eslint-disable-line no-new-func
var S = win.AE_SIMC;

var gg = {}; gg.window = gg;
['talent-tree.js', 'talent-decode.js'].forEach(function (f) {
  new Function('window', fs.readFileSync(path.join(BASE, 'app', f), 'utf8'))(gg); // eslint-disable-line no-new-func
});
var TREE = gg.AE_TALENT_TREE, DEC = gg.AE && gg.AE.TalentDecode;

var errors = [], warns = [], checks = 0;
function fail(m) { errors.push(m); }
function warn(m) { warns.push(m); }
function ck() { checks++; }

var SLOTS = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
var STATS = ['crit', 'haste', 'mastery', 'versatility'];
var stat = { specs: 0, profiles: 0, slots: 0, iv: { c: 0, b: 0, none: 0 }, short: [], multiHero: [] };
var usedItems = {}, usedEnch = {};

(function () {
  ck(); if (!S || typeof S !== 'object') { fail('没有 window.AE_SIMC'); return; }
  ck(); if (S.v !== 1) fail('v 应为 1，实际 ' + S.v);
  ck(); if (!/^\d{4}-\d{2}-\d{2}$/.test(S.updatedAt || '')) fail('updatedAt 不是 YYYY-MM-DD：' + S.updatedAt);
  ck(); if (!/^[0-9a-f]{40}$/.test(S.commit || '')) fail('commit 不是 40 位提交号：' + S.commit);
  ck(); if (S.commitDate !== S.updatedAt) fail('updatedAt 要写 SimC 那次提交的日期（数据有多新），不是生成那天');
  ck(); if (!/GPL-3\.0/.test(S.license || '')) fail('license 里没写 GPL-3.0 —— 衍生自 GPL 文件，必须带');
  ck(); if (!fs.existsSync(path.join(BASE, 'docs', 'LICENSE-simulationcraft.md'))) {
    fail('缺 docs/LICENSE-simulationcraft.md（license 字段指向它）');
  }
  ck(); if (!/^https:\/\/github\.com\/simulationcraft\/simc$/.test(S.repo || '')) fail('repo 不对：' + S.repo);
  ck(); if (!S.specs || typeof S.specs !== 'object') { fail('没有 specs'); return; }
  ck(); if (!S.items || !S.ench) { fail('没有 items / ench'); return; }
  ck(); if (!(S.fullPts > 0)) fail('fullPts 不是正数：' + S.fullPts);
  var ib = S.ilvlByBonus || {};
  Object.keys(ib).forEach(function (k) {
    ck(); if (!/^\d+$/.test(k) || !(ib[k] > 0 && ib[k] < 1000)) fail('ilvlByBonus 里 ' + k + ' → ' + ib[k] + ' 不像装等');
  });
  if (!TREE || !DEC || !DEC.decode) { fail('加载不到 app/talent-tree.js / app/talent-decode.js，串没法复核'); return; }

  var freq = {};
  Object.keys(S.specs).forEach(function (sid) {
    var sp = S.specs[sid], ts = TREE.specs[sid];
    stat.specs++;
    ck(); if (!ts) { fail('specId ' + sid + ' 在天赋树里不存在'); return; }
    ck(); if (sp.cls !== ts.cls || sp.specEn !== ts.specEn) {
      fail(sid + '：cls/specEn 是 ' + sp.cls + '/' + sp.specEn + '，天赋树里是 ' + ts.cls + '/' + ts.specEn);
    }
    ck(); if (!Array.isArray(sp.profiles) || !sp.profiles.length) { fail(sid + '：没有 profiles'); return; }
    var seen = {};
    sp.profiles.forEach(function (p, i) {
      stat.profiles++;
      var lb = sid + ' ' + (p.f || ('#' + i));
      ck(); if (!/^[A-Z0-9]+_[A-Za-z0-9_']+\.simc$/.test(p.f || '')) fail(lb + '：文件名不像 SimC 配置');
      ck(); if (seen[p.f]) fail(lb + '：同一个文件出现两次'); seen[p.f] = 1;
      ck(); if (i > 0 && p.f.length < sp.profiles[0].f.length) fail(lb + '：比 profiles[0] 还短，默认配置排错了');
      freq[p.p] = (freq[p.p] || 0) + 1;
      checkProfile(sid, lb, p);
    });
  });
  var mode = Number(Object.keys(freq).sort(function (x, y) { return freq[y] - freq[x] || y - x; })[0]);
  ck(); if (mode !== S.fullPts) fail('fullPts 是 ' + S.fullPts + '，而最常见的总点数是 ' + mode);
  ck(); if (stat.specs < 20) fail('只有 ' + stat.specs + ' 个专精（MID2 实测 29）—— 上游目录结构变了？');
}());
function checkProfile(sid, lb, p) {
  // ---- 天赋串：拿面板那份解码器独立解一遍，和生成器声明的点数 / 英雄子树对账。
  var o = DEC.decode(p.s, TREE);
  ck(); if (!o || o.err) { fail(lb + '：面板解码器解不开（' + (o && o.err) + '）'); return; }
  ck(); if (o.ver !== 2) fail(lb + '：串头版本 ' + o.ver + '，游戏只认 2');
  ck(); if (String(o.spec) !== String(sid)) fail(lb + '：串头 specID ' + o.spec + '，放在 ' + sid + ' 下');
  ck(); if (o.pts !== p.p) fail(lb + '：声明 ' + p.p + ' 点，面板解出 ' + o.pts + ' 点 —— 两份解码器对不上');
  ck(); if (JSON.stringify(o.subs) !== JSON.stringify(p.h)) {
    fail(lb + '：英雄子树声明 ' + JSON.stringify(p.h) + '，面板解出 ' + JSON.stringify(o.subs));
  }
  ck(); if (!p.h.length) fail(lb + '：一条英雄天赋都没点');
  if (p.h.length > 1) stat.multiHero.push(lb + '（' + p.h.length + ' 条英雄天赋）');
  if (p.p < S.fullPts) stat.short.push(lb + '（' + p.p + '/' + S.fullPts + ' 点）');

  // ---- 部位。
  var keys = Object.keys(p.slots || {});
  ck(); if (keys.length < 15) fail(lb + '：只有 ' + keys.length + ' 个部位');
  keys.forEach(function (k) {
    var r = p.slots[k], sl = lb + ' 部位 ' + k;
    stat.slots++;
    ck(); if (SLOTS.indexOf(Number(k)) < 0) { fail(sl + '：不是认得的 INVSLOT'); return; }
    ck(); if (!(r.i > 0)) { fail(sl + '：没有 itemId'); return; }
    usedItems[r.i] = 1;
    // 装等和来源必须同时有、同时没有。
    ck();
    if (r.v) {
      if (r.s === 'c') stat.iv.c++;
      else if (r.s === 'b') {
        stat.iv.b++;
        ck(); if ((S.ilvlByBonus || {})[r.b] !== r.v) fail(sl + '：s=b 但 ilvlByBonus[' + r.b + '] 不等于 ' + r.v);
      } else fail(sl + '：有装等 ' + r.v + ' 但没写来源（s 只能是 c / b）');
      ck(); if (!(r.v > 100 && r.v < 1000)) fail(sl + '：装等 ' + r.v + ' 不像真的');
    } else {
      stat.iv.none++;
      if (r.s || r.b) fail(sl + '：没有装等却写了来源');
    }
    if (r.e != null) { ck(); if (!(r.e > 0)) fail(sl + '：附魔 ID 不对'); usedEnch[r.e] = 1; }
    ck(); if (r.e && r.t) fail(sl + '：附魔 ID 和附魔标识只该有一个');
    if (r.t != null) { ck(); if (!/^[a-z0-9_]+$/.test(r.t)) fail(sl + '：附魔标识 ' + r.t + ' 不是 SimC 的写法'); }
    if (r.m != null) { ck(); if (!/^[a-z0-9_]+$/.test(r.m)) fail(sl + '：装饰标识 ' + r.m + ' 不是 SimC 的写法'); }
    (r.g || []).forEach(function (id) { ck(); if (!(id > 0)) fail(sl + '：宝石 ID 不对'); usedItems[id] = 1; });
    (r.c || []).forEach(function (s) { ck(); if (STATS.indexOf(s) < 0) fail(sl + '：制造副属性 ' + s + ' 不认识'); });
  });
}
// ---- 物品池 / 附魔表：引用的都要在，在的都要被引用（多出来的是生成器的漏洞，不是无害的冗余）。
(function () {
  if (!S || !S.items || !S.ench) return;
  Object.keys(usedItems).forEach(function (id) {
    var it = S.items[id];
    ck(); if (!it) { fail('物品 ' + id + ' 被引用但物品池里没有'); return; }
    ck(); if (typeof it.n !== 'string') fail('物品 ' + id + ' 没有 n');
    else if (!it.n) warn('物品 ' + id + ' 没有中文名（DB2 里还没有，面板会退到别的来源）');
    ck(); if (it.q != null && !(it.q >= 1 && it.q <= 8)) fail('物品 ' + id + ' 品质 ' + it.q + ' 不对（0 要省略）');
    ck(); if (it.i != null && !/^[a-z0-9_-]+$/.test(it.i)) fail('物品 ' + id + ' 图标名 ' + it.i + ' 不安全');
  });
  Object.keys(S.items).forEach(function (id) { ck(); if (!usedItems[id]) fail('物品池里的 ' + id + ' 没有任何配置引用'); });
  Object.keys(usedEnch).forEach(function (id) {
    var en = S.ench[id];
    ck(); if (!en) { fail('附魔 ' + id + ' 被引用但附魔表里没有'); return; }
    ck(); if (!en.n) warn('附魔 ' + id + ' 没有中文名');
    ck(); if (/[$|&]/.test(en.n)) fail('附魔 ' + id + ' 的名字里还留着游戏内的标记：' + en.n);
    ck(); if (!(en.q >= 0 && en.q <= 5)) fail('附魔 ' + id + ' 品质档 ' + en.q + ' 不对');
  });
  Object.keys(S.ench).forEach(function (id) { ck(); if (!usedEnch[id]) fail('附魔表里的 ' + id + ' 没有任何配置引用'); });
}());

if (stat.short.length) warn('没点满的配置 ' + stat.short.length + ' 份（面板会说明）：' + stat.short.join('，'));
if (stat.multiHero.length) warn('串里点了两条英雄天赋的 ' + stat.multiHero.length + ' 份（面板会说明）：' + stat.multiHero.join('，'));

console.log('');
console.log('来源       ' + (S && S.source));
console.log('提交       ' + (S && S.commit) + '（' + (S && S.commitDate) + '）');
console.log('规模       ' + stat.specs + ' 个专精 / ' + stat.profiles + ' 份配置 / ' + stat.slots + ' 个部位');
console.log('装等来源   配置写明 ' + stat.iv.c + ' / bonus_id 查表 ' + stat.iv.b + ' / 没有 ' + stat.iv.none);
console.log('串复核     ' + stat.profiles + ' 条用 app/talent-decode.js 独立解开，点数和英雄子树与生成时一致');
console.log('检查项     ' + checks);
if (warns.length) {
  console.log('');
  console.log('警告 ' + warns.length + ' 条：');
  warns.forEach(function (w) { console.log('  · ' + w); });
}
console.log('');
if (errors.length) {
  console.log('不合格式，' + errors.length + ' 个问题：');
  errors.slice(0, 30).forEach(function (e) { console.log('  · ' + e); });
  if (errors.length > 30) console.log('  … 还有 ' + (errors.length - 30) + ' 个');
  process.exit(1);
}
console.log('格式全部通过。');
