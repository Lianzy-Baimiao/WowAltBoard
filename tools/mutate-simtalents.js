/*
 * WowAltBoard - tools/mutate-simtalents.js
 *
 * SimC 默认配置那一组断言（装备页「模拟配装」、天赋页「SimC 配置」、生成器 / 校验器）的变异测试。
 *
 * 为什么单独一份，而不是靠 mutate-loadout.js
 * ---------------------------------------
 * 那一组盯的是 raider.io / WCL 的导入串，判据是**字节相等**。这一组独有的失败方式是：
 *   · 配置列表是竖着一排按钮，**高亮错一行**时界面完全自洽（树、点数、名字各自都对得上），
 *     只有「树上点亮的节点 == 高亮那一份解出来的节点」能抓；
 *   · 「换配置 / 换英雄树」两个开关的 state 都不持久化，不真去点的话它们在测试里等于不存在；
 *   · 有的配置两条英雄树都点了（MID2：野德、射击猎），游戏里只能选一条 —— 选择条没画、
 *     或者点数直接印串里的合计，都会给出一个游戏里做不到的东西；
 *   · 没有 SimC 配置的专精（治疗等 11 个）要退到实战分布并说出来，否则「模拟配装」按钮凭空不见；
 *   · 生成器把点数 / 默认配置 / 装等算错时，**面板照样画得一切正常** —— 只有校验器和解析回归能抓。
 *
 * 严格程度和别的 mutate-*.js 一档：**每个变异体必须让指定的那句话出现在输出里**，
 * 光「退出码非 0」不算抓到。锚点在文件里出现次数不是 1，同样直接算失败。
 *
 * 用法：node tools\mutate-simtalents.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var MT = require('./mutation-text.js');

var lock = require('./mutate-lock.js');

var ROOT = path.resolve(__dirname, '..');
var BIS = path.join(ROOT, 'app', 'bis.js');
var RUNNER = path.join(__dirname, 'run-tests.js');
// 生成器。改坏了产物就带着错的点数 / 顺序，而面板照样画得一切正常 —— 所以也要盯它。
var GEN = path.join(__dirname, 'fetch-simc.js');
var PROD = path.join(ROOT, 'app', 'simc-data.js');

lock.acquire('mutate-simtalents');
process.on('exit', lock.release);

function run() {
  var r = cp.spawnSync(process.execPath, [RUNNER],
    { cwd: ROOT, encoding: 'utf8', env: lock.childEnv() });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** 见 mutate-loadout.js 的同名函数：锚点必须正好出现一次，否则算锚点失效。 */
function textMutant(desc, file, from, to, want) {
  return {
    desc: desc, want: want,
    apply: function () {
      var orig = fs.readFileSync(file, 'utf8');
      var n = MT.count(orig, from);
      if (n !== 1) {
        console.log('    锚点在文件里出现 ' + n + ' 次（必须正好 1 次）');
        return null;
      }
      fs.writeFileSync(file, MT.replace(orig, from, to));
      return function () { fs.writeFileSync(file, orig); };
    }
  };
}
/**
 * 生成器侧的变异体。
 *
 * 改 tools/fetch-simc.js 里**生成那一段**不会让 run-tests.js 变红 —— 套件读的是已经生成好的
 * app/simc-data.js。所以这一类走另一条路：改完生成器 → 用缓存重新生成产物（--offline，不联网）
 * → 跑 tools/verify-simc-data.js（它拿**面板那份解码器**把每条串重解一遍对账）。
 * 跑完把产物和源码一起还原。
 *
 * （解析那几个纯函数 —— slotRow / cleanEnchant —— 不走这里：tools/check-simc-parse.js 直接
 * require 它们，run-tests.js 每次都跑那个回归，所以用普通的 textMutant 就能抓。）
 */
function genMutant(desc, from, to, want) {
  return {
    desc: desc, want: want, gen: true,
    apply: function () {
      var orig = fs.readFileSync(GEN, 'utf8');
      var n = MT.count(orig, from);
      if (n !== 1) {
        console.log('    锚点在文件里出现 ' + n + ' 次（必须正好 1 次）');
        return null;
      }
      var prod = fs.readFileSync(PROD);
      fs.writeFileSync(GEN, MT.replace(orig, from, to));
      return function () {
        fs.writeFileSync(GEN, orig);
        fs.writeFileSync(PROD, prod);
      };
    }
  };
}

/** 重生成产物（只用缓存，不联网），再跑格式校验器。 */
function runGen() {
  var r0 = cp.spawnSync(process.execPath, [GEN, '--offline'],
    { cwd: ROOT, encoding: 'utf8', env: lock.childEnv() });
  var out = (r0.stdout || '') + (r0.stderr || '');
  if (r0.status !== 0) return { status: r0.status, out: out };
  var r1 = cp.spawnSync(process.execPath, [path.join(__dirname, 'verify-simc-data.js')],
    { cwd: ROOT, encoding: 'utf8', env: lock.childEnv() });
  return { status: r1.status, out: out + (r1.stdout || '') + (r1.stderr || '') };
}

var MUTANTS = [
  // ---- 天赋页：块画没画 ----

  // 配置列表整块不画（按钮也跟着没了）。下界断言的意义就在这里。
  textMutant('SimC 配置列表整块不画', BIS,
    '    host.appendChild(pickBox);\n\n    host.appendChild(renderSimLoadout(b));',
    '\n    host.appendChild(renderSimLoadout(b));',
    'SimC 天赋 simtBox 只验过'),

  // 有配置也退回插件那条统计路。页面一切正常，只是 SimC 那一套整个没了。
  // 关键字是块数那条，不是「只检查了 0 个专精」：checkSimTalents 按**产物里有没有配置**
  // 记专精（有真值就记一次），所以专精数照样是 29，拦住它的是「配置列表 0 个」。
  textMutant('天赋页退回插件那条统计路', BIS,
    '    if (pick) { renderSimTalents(host, s, pick); return; }',
    '    /* mutant: 不走 SimC 那条路 */',
    '配置列表 0 个 / 导入串块 0 个'),

  // 导入串那一块不画：能看树，但拿不走串。
  textMutant('SimC 导入串整块不画', BIS,
    '    host.appendChild(renderSimLoadout(b));',
    '    /* mutant: 导入串块不画 */',
    '导入串块 0 个'),
  // ---- 天赋页：给出去的串 ----

  // 复制交出去的和框里显示的不是同一串。前面都在验 DOM 里的字，只有真点一次按钮才抓得到。
  textMutant('SimC 复制按钮交出改过一个字符的串', BIS,
    "      if (AE.copyWithToast) AE.copyWithToast(b.s, '天赋导入串');",
    "      if (AE.copyWithToast) AE.copyWithToast(b.s.slice(0, -1) + (b.s.slice(-1) === 'A' ? 'B' : 'A'), '天赋导入串');",
    '复制出去的串、框里显示的串、产物里的串不是同一条'),

  // 框里放的串改了一个字符。串长、字符集、人数全都正常。
  textMutant('SimC 串框里的串改了一个字符', BIS,
    '    ta.value = b.s;',
    "    ta.value = b.s.slice(0, -1) + (b.s.slice(-1) === 'A' ? 'B' : 'A');",
    '导入串块的输入框里没有产物那条串'),

  // ---- 天赋页：高亮那一行 == 画出来的树 ----

  // 高亮错一行：界面完全自洽（树、点数、名字各自都对），只有对着点亮的节点验才抓得到。
  textMutant('配置列表高亮错一行', BIS,
    "      var btn = choiceButton('', 'simb' + (i === pick.idx ? ' on' : ''), function () {",
    "      var btn = choiceButton('', 'simb' + (i === (pick.idx + 1) % pick.list.length ? ' on' : ''), function () {",
    '但画出来的树和它不一致'),

  // 提示的第一行不再是文件名 —— 照着它就翻不到 SimC 仓库里的原文件了。
  textMutant('配置按钮的提示第一行不是文件名', BIS,
    "      btn.setAttribute('data-tip', p.f + '\\n' + ptsText",
    "      btn.setAttribute('data-tip', ptsText + '\\n' + p.f",
    '高亮配置的提示第一行是'),

  // 点数印成串里的合计：两条英雄树都点了的配置（野德 95）会印一个游戏里点不出来的数。
  textMutant('点数印成两条英雄树的合计', BIS,
    "    return vals.length ? tn('{list} 点', { list: vals.join(' / ') }) : tn('{n} 点', { n: p.p });",
    "    return tn('{n} 点', { n: p.p });",
    '游戏里配得出来的只有'),

  // 没点满的配置不说（MID2：冰霜死骑两份）：导进去会剩点数，而界面上看不出来。
  textMutant('没点满的配置不标「少 N 点」', BIS,
    '      if (p.p < SC.fullPts) {',
    '      if (false) {',
    '界面上没说'),

  // ---- 天赋页：两个开关 ----

  // 两条英雄树都点了却不给选择条：游戏里只能选一条，界面上给出一个做不到的形状。
  textMutant('两条英雄树都点了时不画选择条', BIS,
    "    if (subs.length > 1) {\n      var sbar = el('div', 'tree-pick');",
    "    if (subs.length > 2) {\n      var sbar = el('div', 'tree-pick');",
    '英雄天赋选择条画了 0 个按钮'),

  // 只有一条英雄树也画选择条：一个只有一个选项的选择器是在骗人。
  textMutant('只有一条英雄树也画选择条', BIS,
    "    if (subs.length > 1) {\n      var sbar = el('div', 'tree-pick');",
    "    if (subs.length > 0) {\n      var sbar = el('div', 'tree-pick');",
    '这份只有 1 条英雄天赋，却画了'),

  // 「换配置」按钮写死成第 0 份：界面自洽（高亮第 0 份、串是第 0 份），只是按钮不管用。
  textMutant('「换配置」按钮写死成第 0 份', BIS,
    '        state.simIdx = i;\n        state.simSub = 0;       // 换配置，英雄树的选择跟着重置',
    '        state.simIdx = 0;\n        state.simSub = 0;       // 换配置，英雄树的选择跟着重置',
    '高亮却在第 0 份'),

  // 两条英雄树的节点一起点亮：坐标是各自树内的 5×5，叠在一起是一个游戏里不存在的形状。
  textMutant('两条英雄树的节点一起画', BIS,
    "    // 只画选中那条英雄树的节点。**算在这里**：下面那句「共 N 点」要拿它算「三棵树里画了多少点」。\n"
      + "    var heroIds = (sp.heroNodes || []).filter(function (id) {\n"
      + "      var n = TR.nodes[id];\n"
      + "      return n && (!sub || n[6] === sub);",
    "    // 只画选中那条英雄树的节点。**算在这里**：下面那句「共 N 点」要拿它算「三棵树里画了多少点」。\n"
      + "    var heroIds = (sp.heroNodes || []).filter(function (id) {\n"
      + "      var n = TR.nodes[id];\n"
      + "      return !!n;",
    '和这一份的任一条子树都不吻合'),
  // ---- 装备页：没有 SimC 配置的专精 ----

  // 不说：「模拟配装」按钮凭空不见了，看着像功能坏了。
  textMutant('没有 SimC 配置时不说', BIS,
    "    if (state.view === 'simc' && simc() && !simPick(s.specId)) {",
    "    if (false) {",
    '「SimC 没有默认配置」那句画了 0 次'),

  // 高亮按 state.view 判：退到实战分布时一个按钮都不亮，看不出现在画的是哪份。
  textMutant('退到实战分布时高亮按 state.view 判', BIS,
    "      var b = choiceButton(v[1], view === v[0] ? 'on' : null, function () {",
    "      var b = choiceButton(v[1], state.view === v[0] ? 'on' : null, function () {",
    '退到实战分布时高亮的是'),

  // 不退到实战分布，停在随包参照表那一份上 —— 那是首屏占位用的，不是给这些专精的答案。
  textMutant('没有 SimC 配置时不退到实战分布', BIS,
    "      v = 'rio';                                      // 这个专精 SimC 没有",
    "      return gi;                                      // mutant: 不退",
    '退到实战分布时高亮的是'),

  // ---- 校验器自己：证明下界不是摆设 ----

  textMutant('SimC 真值恒为空（证明「跳过」不会报成通过）', RUNNER,
    '  return sp && sp.profiles && sp.profiles.length ? sp.profiles : null;',
    '  return null;',
    'SimC 天赋配置（实测 29 / 47），取数路径不对'),

  textMutant('树比对一次都不算（证明 simtTree 下界不是空的）', RUNNER,
    '    else stats.simtTree++;',
    '    else if (false) stats.simtTree++;',
    '「画出来的树就是高亮那一份」验了 0 次'),

  textMutant('「串是游戏格式」一次都不算（证明 simtGameOk 下界不是空的）', RUNNER,
    '    else stats.simtGameOk++;',
    '    else if (false) stats.simtGameOk++;',
    'SimC 天赋 simtGameOk 只验过 0 次'),

  textMutant('「没有 SimC 配置」那一半一次都不验（证明 simNone 下界不是空的）', RUNNER,
    '    stats.simNone++;',
    '    if (false) stats.simNone++;',
    '没配置的验了 0/'),

  // ---- 生成器 / 解析：面板照样画得一切正常，只有校验器和解析回归能抓 ----

  // 点数算上系统白给的节点（MID2 的 47 条串每条都有）：声明的点数比游戏里多，面板照着印。
  genMutant('生成器把白给的节点算进点数',
    '      if (!n.purchased || !n.inSpec) return;',
    '      if (!n.inSpec) return;',
    '两份解码器对不上'),

  // 默认配置排错：profiles[0] 不再是不带英雄天赋后缀的那份，装备页默认画的就是别的。
  genMutant('生成器把默认配置排到后面',
    '    specs[k].profiles.sort(function (a, b) { return a.f.length - b.f.length || (a.f < b.f ? -1 : 1); });',
    '    specs[k].profiles.sort(function (a, b) { return b.f.length - a.f.length || (a.f < b.f ? -1 : 1); });',
    '默认配置排错了'),

  // 配置写明的 ilevel 被丢掉、只认 bonus_id：DK 鲜血头盔那种「写了 ilevel、bonus 不在表里」的会变成没装等。
  textMutant('解析时不认 ilevel=，只查 bonus_id', GEN,
    "  if (g.ilevel) { r.v = g.ilevel; r.s = 'c'; }\n  else {",
    "  if (false) { r.v = g.ilevel; r.s = 'c'; }\n  else {",
    '写了 ilevel 的部位'),

  // 附魔名里游戏现算的 $ 占位不删：面板上印出「+$k2 敏捷」。
  textMutant('附魔名里的 $ 占位不删', GEN,
    "replace(/\\$[a-z]?\\d+[a-z]?\\d*%?/gi, '')",
    "replace(/\\$NOPE/g, '')",
    '$k 占位要删掉'),

  // ---- 天赋节点的悬停提示里带「天赋原本说明」（两条路共用）----

  // 说明整个不挂。界面上看不出任何异常 —— 只有「提示里逐字节含产物那一条」能抓。
  textMutant('天赋说明不挂到提示上', BIS,
    '        var d = talentDesc(e[3]);',
    '        var d = null;',
    '天赋说明只逐条核对过'),

  // 取错 entry：二选一节点上两条说明会摆反 —— 两段都是通顺的中文，最看不出来。
  textMutant('天赋说明取第一个 entry 的（二选一节点会摆反）', BIS,
    '        var d = talentDesc(e[3]);',
    '        var d = talentDesc((n[5] || [])[0] && (n[5] || [])[0][3]);',
    '的提示里没有这个天赋的说明'),

  // 说明被截断（怕提示太长）。
  textMutant('天赋说明被截断', BIS,
    "            if (ln) tip.push('　　' + ln);",
    "            if (ln) tip.push('　　' + ln.slice(0, 20));",
    '的提示里没有这个天赋的说明')
];

console.log('=== SimC 默认配置那一组断言的变异测试 ===');

var base = run();
if (base.status !== 0) {
  console.log('基线就是红的，变异测试没有意义。先把套件修绿。');
  console.log(base.out.split('\n').slice(-12).join('\n'));
  process.exit(1);
}
var baseGen = runGen();
if (baseGen.status !== 0) {
  console.log('生成器 + 校验器的基线就是红的（用缓存重生成产物失败，或者校验不过）。');
  console.log(baseGen.out.split('\n').slice(-12).join('\n'));
  process.exit(1);
}
console.log('基线通过。');

var caught = 0, missed = [], dead = [], wrong = [];

MUTANTS.forEach(function (m) {
  var restore = m.apply();
  if (!restore) {
    dead.push(m.desc);
    console.log('  锚点失效  ' + m.desc);
    return;
  }
  var r;
  try { r = m.gen ? runGen() : run(); } finally { restore(); }
  if (r.status === 0) {
    missed.push(m.desc);
    console.log('  漏了  ' + m.desc);
  } else if (r.out.indexOf(m.want) < 0) {
    wrong.push(m.desc + '（没出现「' + m.want + '」）');
    console.log('  串了  ' + m.desc + '：输出里没有「' + m.want + '」');
  } else {
    caught++;
    console.log('  抓到  ' + m.desc + '　→「' + m.want + '」');
  }
});

var after = run();
console.log('\n变异 ' + MUTANTS.length + '，抓到 ' + caught + '，漏 ' + missed.length
  + '，串 ' + wrong.length + '，锚点失效 ' + dead.length
  + '；还原后套件 ' + (after.status === 0 ? '仍然通过' : '没恢复（有问题）'));
missed.forEach(function (s) { console.log('  · 漏：' + s); });
wrong.forEach(function (s) { console.log('  · 串：' + s); });
dead.forEach(function (s) { console.log('  · 锚点失效：' + s); });
process.exit(missed.length + wrong.length + dead.length || after.status !== 0 ? 1 : 0);
