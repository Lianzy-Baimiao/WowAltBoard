/*
 * WowAltBoard - tools/run-tests.js
 *
 * 命令行跑全部测试。tests.html 需要开浏览器点一下，这个不用：
 *
 *     node tools\run-tests.js
 *
 * 跑五件事：
 *   1. app/parser-tests.js  解析器
 *   2. app/model-tests.js   数据模型（要 data/data.js，没有就跳过并说明）
 *   3. app/bis-tests.js     毕业装备数据
 *   4. 渲染检查             把每个专精每种视图都真画一遍，检查图标进没进 DOM
 *   5. 数据格式             跑两个校验器：
 *                             tools\verify-bis-data.js    验 app/bis-data.js
 *                             tools\verify-talent-tree.js 验 app/talent-tree.js
 *                             （后者顺带交叉验证 app/talent-data.js）
 *
 * 第 4、5 项是命令行独有的 —— 浏览器里没法检查 app/icons/ 下的文件在不在，
 * 也没法跑另一个 Node 脚本。
 *
 * 退出码非 0 = 有失败。
 *
 * 为什么渲染检查里的断言写得那么死（占位块必须是 0、img 数必须过 5000）
 * ------------------------------------------------------------------
 * 第一版只统计不断言。我把 AE_ITEM_ICONS 换成 {} 做变异测试，占位块从 0 涨到
 * 3963，它照样打印「通过」—— 一个永远通过的检查等于没有检查。所以这些数字是
 * 硬门槛，数据变了要连带改这里，那正是希望发生的事。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var stub = require('./dom-stub.js');

// 变异测试会**在磁盘上真的改源文件**。它和这个套件并行跑，读数全是垃圾。
// 这一句必须在 makeEnv / load 之前 —— 一旦开始读文件就已经晚了。
require('./mutate-lock.js').assertNotMutating();

// 天赋串解码器。这里只用它的 toBits() 读串头里那 16 位 specID ——
// 用来验「面板显示的串，头里写的专精和当前专精一致」。
// 自己在这里重写一遍 base64→位 的转换是不行的：那样验的是我的第二份实现，
// 而不是产品里那份。
var DEC = require('./decode-talent-string.js');

var ROOT = stub.ROOT;
var env = stub.makeEnv(['bis', 'bis-sub', 'bis-body']);
var g = env.g;
var doc = env.doc;

// 现有断言全部按中文写。Node 24 自带 navigator，系统语言不是 zh 时会让
// i18n 解析成英文；force 钩子把语言钉死，和系统/浏览器设置无关。
g.__AE_FORCE_LANG = 'zh';

function load(f) {
  var p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return false;
  env.load(f);
  return true;
}

// 顺序照抄 tests.html。data/ 下两个是扫描产物，可能不存在。
// class-names.js 必须在 labels.js 前面：labels.js 的 classLabel / specLabel
// 读 window.AE_DB2_NAMES。缺了它会静默退回旧的兜底表（4 个职业显英文、
// 死骑冰霜显 FROST），测试照样全绿 —— 所以它是硬依赖，不是可选项。
['app/i18n.js', 'app/i18n-en.js',
 'app/class-names.js', 'app/lua-parser.js', 'app/parser-tests.js', 'app/labels.js',
 'app/model.js',
 'app/settings.js', 'app/columns.js', 'app/layouts.js', 'app/model-tests.js',
 'app/export.js', 'app/talent-decode.js',
 // history.js 在这个名单里是为了验「周趋势和主表同口径」那条（它导出了 distill）。
 // 之前它一次都没被加载过 —— 也就是趋势那一整块在 node 套件里零覆盖。
 'app/history.js',
 'app/bis.js', 'app/bis-tests.js'].forEach(function (f) {
  if (!load(f)) throw new Error('缺文件：' + f);
});

// 数据文件。bis-data / talent-data / item-icons 在浏览器里是懒加载的，但测试里
// 必须显式加载 —— 「因为没数据所以跳过」的测试报成通过，是最难发现的假绿。
// rio-data.js 也在这里：它是**入库的产物**，不是可选下载物。缺了它就该红，
// 而不是让「实战分布」视角悄悄不渲染 —— 那正是「跳过报成通过」的假绿。
// simc-data.js 同理。以前加一个视角时它的数据文件**没**在这个名单里，于是那个
// 视角在测试里从来没被画过，而套件照样全绿（渲染次数 163 一个都没涨）——
// 又一次「跳过报成通过」。数字没动就是没跑，这条读数救了一次。
['app/bis-data.js', 'app/talent-data.js', 'app/talent-tree.js',
 'app/item-icons.js', 'app/rio-data.js', 'app/simc-data.js',
 // 天赋说明（第 19 轮）。**必须显式加载** —— 它在浏览器里是懒加载的，
 // 不加载的话「悬停提示带说明」那条断言会一次都跑不到，然后报「通过」。
 'app/talent-desc.js',
 // 团本天赋串（第 20 轮，Warcraft Logs）。同理必须显式加载 ——
 // 不加载的话「团本 / 大秘境两类」那一组断言全部跳过，而摘要照样印「通过」。
 'app/wcl-data.js'].forEach(function (f) {
  if (!load(f)) throw new Error('缺文件：' + f + '（先跑对应的 tools\\gen-*.js / fetch-*.js）');
});
var haveScan = load('data/data.js');
load('data/bagsync.js');

g.AE.openPanel = function () {};
g.AE.closeAllPanels = function () {};
g.AE.saveSettings = function () {};
g.AE.toast = function () {};

// 复制到剪贴板的桩：把真正交出去的那串记下来，而不是丢掉。
// 记下来才能断言「按钮复制的就是屏幕上显示的那串」——这是天赋导入串唯一
// 会致命的失败方式：显示对、复制错，用户粘进游戏得到「无效」，而界面上
// 一切正常。丢掉参数的桩会让这种 bug 永远测不出来。
//
// 这个桩本身也坑过我一次：我一度写了两份声明，后一份只存字符串、把前一份
// 存对象的覆盖掉，于是 copied[0].text 恒为 undefined，43 个专精全报
// 「复制出去的串和框里显示的不是同一串」。看着像面板错了，其实是**桩错了**。
// 所以这里只留一份，字段名写死成 text/label。
var copied = [];
g.AE.copyWithToast = function (text, label) { copied.push({ text: text, label: label }); };

var settings = g.AE.defaultSettings ? g.AE.defaultSettings() : {};
var model = { characters: [] };
if (haveScan && g.AE.buildModel && g.AE_DATA) {
  try { model = g.AE.buildModel(g.AE_DATA, settings) || model; } catch (e) { /* 模型测试自己会报 */ }
}
g.AE.state = { settings: settings, model: model };

// ----------------------------------------------------------------- 跑测试套件

var total = { pass: 0, fail: 0 };
var failures = [];

function suite(name, fn) {
  if (!fn) { console.log(pad(name) + '没有这个套件'); return; }
  var r = fn();
  if (r.skipped) {
    console.log(pad(name) + '跳过（' + (r.reason || '缺数据') + '）');
    return;
  }
  total.pass += r.pass;
  total.fail += r.fail;
  console.log(pad(name) + r.pass + ' 通过' + (r.fail ? '，' + r.fail + ' 失败' : ''));
  (r.results || []).forEach(function (x) {
    if (!x.ok) failures.push(name + '：' + x.name + (x.detail ? ' —— ' + x.detail : ''));
  });
}

function pad(s) { return (s + '　　　　　　').slice(0, 12); }

console.log('');
suite('解析器', g.AE.runParserTests);
suite('数据模型', g.AE.runModelTests);
suite('毕业装备', g.AE.runBisTests);

// ------------------------------------------------------------------- 渲染检查

function walk(node, fn) {
  fn(node);
  node.children.forEach(function (c) { walk(c, fn); });
}

var B = g.AE_BIS;
var specKeys = Object.keys(B.specs);
var problems = [];
/**
 * 「这数是从哪个插件来的」在界面文案里的痕迹。见下面 checkA11y 里那段注释。
 *
 * 三类一起查：
 *   · 产品名本身（GearInsight）；
 *   · 泛称 +「参照表 / 自带 / 统计 / 数据」（「插件参照表」「插件自带的统计」）；
 *   · 「来自插件」「插件那份」这类指代。
 * 「插件」两个字本身不禁 —— 面板别处要告诉用户去装哪个扫描插件，那是操作说明，
 * 不是数据出处。
 */
var SRC_LEAK = /GearInsight|插件(自带|那份|那条|参照表)|来自插件|插件的(统计|数据|参照表)/i;

var stats = { renders: 0, imgs: 0, ph: 0, badSrc: 0, trk: 0, trkBad: 0, cov: 0, covBad: 0, slots: 0,
              sock: 0, sockBad: 0,
              pairCase: 0, pairBad: 0,
              swapCases: 0, swapBad: 0,
              // rioRenders 数的是**所有**画过 rio 视角的渲染（专精循环 + 视角迁移
              // + 对照角色那三组都算），mainRio 只数专精循环那一轮。
              // 下面「每个专精各一次」那条断言必须用 mainRio：用总数的话，
              // 后面任何一组多画一次 rio 都会把它顶红，而那不是缺陷。
              sn: 0, snBad: 0, rioRenders: 0, mainRio: 0, rioSlots: 0,
              sim: 0, simBad: 0, simHave: 0, simNone: 0,
              // 天赋树
              tgrids: 0, tnodes: 0, tnodeOn: 0, tedges: 0, tedgeOn: 0,
              tnoName: 0, tnoCJK: 0, tRank: 0, tRankBad: 0, tspecs: 0, tEmpty: 0,
              trenders: 0, tdup: 0, tnoId: 0, tgeo: 0, tSpill: 0, tOverlap: 0, thero: 0, theroEn: 0,
              tico: 0, tnoIco: 0, ticoBad: 0, ticoNoCls: 0, ticoMismatch: 0, ticoPair: 0,
              // 第 19 轮：天赋节点的悬停提示里带「这个天赋原本的说明」
              tDesc: 0, tDescBad: 0, tDescNo: 0,
              ticoLazy: 0, ticoEager: 0,
              tmaxCol: 0, tmaxRow: 0, tCluster: 0,
              // 天赋导入串。loSpecs 是**去重后的专精数**，loRenders 是渲染次数 ——
              // 两者不同（40 个专精 + 3 次切类别 = 43 次渲染），混用会得到一条
              // 永远不可能满足的断言。第一版正是把渲染次数当专精数，断言
              // 「=== 40」于是恒报 43。
              loSpecs: 0, loRenders: 0, loBoxes: 0, loCopy: 0, loPicks: 0,
              loSpec: 0, loExact: 0,
              // 第 20 轮：团本 / 大秘境两类
              loKindBtn: 0, loKindOn: 0, loRaid: 0, loKindSw: 0, loSorted: 0, loKindSaved: 0, loHead: 0, loResetIdx: 0,
              loWarnOk: 0, loNoSim: 0,
              // SimC 天赋配置。和上面那组分开数：那组盯 raider.io / WCL 的官方串，
              // 这组盯 SimC 的配置 —— 核心是「画出来的树 == 高亮那一份」和
              // 「给出去的串 == 产物那一条，而且能导入」。
              simtSpecs: 0, simtRenders: 0, simtBox: 0, simtTree: 0, simtBtns: 0,
              simtName: 0, simtSpec: 0, simtDecl: 0, simtGameOk: 0, simtCopyClick: 0,
              simtPts: 0, simtPtsSplit: 0, simtHeadSum: 0, simtShort: 0, simtShortSeen: 0,
              simtSubBar: 0, simtBundle: 0, simtBuildSw: 0, simtSubSw: 0,
              // 点一下之后位置有没有丢（滚动 / 折叠块展开状态）
              // 第 18 轮：块顺序（rio 在上）/ 树列顺序（英雄在前）
              ordChecked: 0, ordRio: 0, ordCols: 0, ordHero: 0,
              posChecked: 0, posScroll: 0, posSec: 0, posSecShut: 0,
              switchChecked: 0, switchReset: 0,
              // 视角迁移（第 16 轮撤掉 GearInsight 那两个视角）
              vmChecked: 0, vmMigrated: 0, vmWrote: 0, staleKey: 0,
              // 装等（SimC 配置给的为主，定不出的几格从本机两份实测数据借）+ 装等差距
              ivGi: 0, ivRio: 0, ivSim: 0, ivNone: 0, ivZero: 0, ivBorrow: 0,
              gapBadge: 0, gapBad: 0, gapMath: 0, gapTop: 0, gapTopBad: 0,
              gapSum: 0, gapChars: 0, gapSlots: 0,
              // 跨职业对照（选了死骑、切到法师专精）
              xcChecked: 0, xcNoGap: 0, xcNote: 0, heroLate: 0,
              // 无障碍
              imgLazy: 0, imgEager: 0,
              // 「更新这些数据」入口（第 22 轮）：每次渲染该画一个
              upd: 0,
              // 来源插件的名字漏进界面（第 17 轮：只说「插件参照表」）
              srcLeak: 0,
              a11yImg: 0, a11yBtn: 0, a11yBtnBad: 0, a11yTip: 0, a11yTipBad: 0,
              a11yCanvas: 0, a11yCanvasBad: 0 };
var missingFiles = {};
var loSeen = {};
var simSeen = {};
var body = doc.getElementById('bis-body');

/**
 * 导入串的问题登记，**按种类限流**：同一种问题最多留 2 条。
 *
 * 为什么不直接 problems.push：这一组要跑 43 次渲染，一个真实缺陷会一次性
 * 灌进 43 条同样的消息，而末尾只打印前 20 条 —— 于是**后面所有种类的问题
 * 都被挤出屏幕**。变异测试里这件事真的发生了：「真值恒为空」那个变异体
 * 断言确实触发了，但消息排在第 44 条，输出里看不见，被判成「串了」。
 *
 * 限流按种类而不是按总数，保证每一类至少有一条能被看见。
 */
var loKinds = {};
function loNote(kind, msg) {
  loKinds[kind] = (loKinds[kind] || 0) + 1;
  if (loKinds[kind] <= 2) problems.push(msg);
}

// 无障碍检查。这一组和渲染检查分开数，因为它们盯的是不同的东西：
// 渲染检查问「画出来了吗」，这一组问「画出来的东西，看不见屏幕的人能不能用」。
//
// 之前这里一条都没有，而且我第一次量的时候被自己的桩骗了：
// `img.alt = ''` 是**属性赋值**，桩当时不把属性映射到 attrs，于是 621 张图
// 全被报成「没有 alt」。桩已经补上映射（见 dom-stub.js 的 REFLECT），
// 这几条断言才有意义 —— 否则它们量的是桩，不是应用。
function checkA11y(n, label) {
  // 「更新这些数据」入口：装备 / 天赋两条渲染路都该画（checkRender 和
  // checkTalents 的 walk 都过这里，所以计数放这一处两边都吃）。
  if (n.classList && n.classList.contains('bis-upd')) stats.upd++;
  if (n.tagName === 'IMG') {
    // 装备图标是装饰性的（旁边就是装备中文名），所以正确写法是 alt=""，
    // 也就是「有这个属性、值为空」。缺属性和 alt="" 是两件事：
    // 缺属性时读屏软件会去念文件名。
    if (n.attrs.alt == null) {
      stats.a11yImg++;
      if (stats.a11yImg < 4) problems.push(label + ' <img> 没有 alt 属性：' + (n.attrs.src || '?'));
    }
  }
  if (n.tagName === 'BUTTON') {
    stats.a11yBtn++;
    if (!n.textContent && !n.attrs['aria-label']) {
      stats.a11yBtnBad++;
      if (stats.a11yBtnBad < 4) problems.push(label + ' <button> 既没文字也没 aria-label');
    }
  }
  // data-tip 是补充信息，不是元素的名字 —— 所以带 data-tip 的元素自己必须有
  // 可见文字。实测 2386/2386 都有，写成硬断言把这一点钉住：
  // 哪天有人把某处的可见文字换成「只有 tooltip」，读屏用户就什么都读不到。
  if (n.attrs['data-tip'] != null) {
    stats.a11yTip++;
    if (!n.textContent && !n.attrs['aria-label']) {
      stats.a11yTipBad++;
      if (stats.a11yTipBad < 4) {
        problems.push(label + ' 带 data-tip 但自己没有可见文字：' + n.attrs['data-tip'].split('\n')[0]);
      }
    }
  }
  // 数据是从哪个插件来的，**不许出现在界面上**（用户第 17 轮定的）。
  // 这一条盯的是**回归**：那个名字原先散在 4 处文案里（装等来源、查不到装等、
  // 升级轨道、属性权重借用说明）+ 脚注一句，实测 1280 次渲染下有 13 种不同的串；
  // 改成不点名之后又剩 2 处泛称（「插件参照表」「插件自带的」）—— 泛称也算漏，
  // 用户不关心数字是哪个插件测的，他要的是数字本身。
  //
  // 所以判据是 SRC_LEAK：**产品名 + 泛称一起查**。只查产品名的话，
  // 下次写「来自插件的统计」照样过；两个都查，才逼着文案去说这数是什么，
  // 而不是它从哪来。
  //
  // 只查**用户看得见的**两处：可见文字和 data-tip。源码注释里留着是对的 ——
  // 那是给维护者看的出处说明，不是界面文案。
  if (n.attrs['data-tip'] != null && SRC_LEAK.test(n.attrs['data-tip'])) {
    stats.srcLeak++;
    if (stats.srcLeak < 4) {
      problems.push(label + ' 的 data-tip 里在说数据来自哪个插件：'
        + n.attrs['data-tip'].split('\n')[0]);
    }
  }
  if (!n.children.length && n.textContent && SRC_LEAK.test(n.textContent)) {
    stats.srcLeak++;
    if (stats.srcLeak < 4) {
      problems.push(label + ' 界面文字里在说数据来自哪个插件：' + String(n.textContent).slice(0, 60));
    }
  }
  // 天赋树画布是一堆绝对定位的 div 拼出来的图。没有 role 和说明的话，
  // 读屏软件只会念到一串互不相干的天赋名，读不出「这是一棵树、点了多少」。
  if (n.classList && n.classList.contains('tree-canvas')) {
    stats.a11yCanvas++;
    if (n.attrs.role !== 'group' || !n.attrs['aria-label']) {
      stats.a11yCanvasBad++;
      if (stats.a11yCanvasBad < 4) {
        problems.push(label + ' 天赋树画布没有 role=group + aria-label');
      }
    }
  }
}

function checkRender(label) {
  stats.renders++;
  var isRio = /\/rio$/.test(label);
  if (isRio) stats.rioRenders++;
  var sawItem = false;
  walk(body, function (n) {
    checkA11y(n, label);
    if (n.classList && n.classList.contains('item')) sawItem = true;
    if (n.tagName === 'IMG') {
      stats.imgs++;
      // **懒加载必须都带上。** 面板每点一下整块重建，一次天赋页要造 99 个图标
      // <img>、装备页 79 个，而三棵树里通常只有第一棵在视口内。少了这个属性，
      // 浏览器每次重建都要把全部图标处理一遍（file:// 下每张一次文件读取 + 解码）
      // —— 那正是「点一下就卡」的来源，而它在测试里没有任何别的表现。
      if ((n.attrs && n.attrs.loading) === 'lazy') stats.imgLazy++;
      else {
        stats.imgEager++;
        if (stats.imgEager < 3) {
          problems.push(label + ' 有 <img> 没写 loading="lazy"：' + (n.attrs && n.attrs.src));
        }
      }
      var src = n.attrs.src || n.src || '';
      if (!src) { stats.badSrc++; problems.push(label + ' img 没有 src'); return; }
      if (src.indexOf('app/icons/') !== 0) {
        problems.push(label + ' img src 不指向本地图标：' + src);
        return;
      }
      if (!fs.existsSync(path.join(ROOT, src))) missingFiles[src] = 1;
    }
    if (n.classList && n.classList.contains('ph')) stats.ph++;
    // 轨道徽章。数据里有轨道码不等于画出来了 —— 这一条盯的是渲染。
    if (n.classList && n.classList.contains('trk')) {
      stats.trk++;
      // 形如「英雄 6/6」：中文轨道名 + 空格 + 等级/6
      if (!/^\S+ [1-6]\/6$/.test(n.textContent)) {
        stats.trkBad++;
        if (stats.trkBad < 4) problems.push(label + ' 轨道徽章文字不对：' + n.textContent);
      }
    }
    /*
     * 插槽徽章。**这一条盯的是「印出来的数是插槽数，不是热门度」**。
     * 第 20 轮真踩过：面板拿 rio 的 sock（有多少个角色在这件上镶过宝石）当插槽数，
     * 印出「插槽 ×1349」，而游戏里插槽上限是 3。现在用的是 gmax（单件上见过
     * 最多几颗宝石），所以文字只可能是「插槽」或「插槽 ×2」/「插槽 ×3」。
     */
    if (n.classList && n.classList.contains('sock')) {
      stats.sock++;
      if (!/^插槽( ×[23])?$/.test(n.textContent)) {
        stats.sockBad++;
        if (stats.sockBad < 4) {
          problems.push(label + ' 插槽徽章文字不对：「' + n.textContent
            + '」—— 只能是「插槽」或「插槽 ×2」/「插槽 ×3」（游戏里插槽上限 3）。'
            + '出现更大的数说明它印的是 sock（多少人镶过），不是 gmax（插槽数）');
        }
      }
    }
    // 部位头上的徽章有**三种**，按 class 分开验，不能共用一条正则：
    //   · cov（BisData 视角）「记录 95.9%」—— 列表被截断，只能说覆盖率；
    //   · cov sn（rio 视角）「N=97」—— 有真实样本量；
    //   · cov sim（模拟配装视角）「SimC」—— **既没有样本量也没有覆盖率**，
    //     它是模拟器的默认配置，那两个量在这份数据里不存在。
    // 共用一条正则的话三边都验不住：要么 N= 被判不合格，要么正则松到什么都能过。
    if (n.classList && n.classList.contains('slot-head')) {
      stats.slots++;
      if (isRio) stats.rioSlots++;
    }
    // ---- 装等那一格（.sub2）。**这一条是一个真 bug 的回归。**
    //
    // 以前有一版视角每一行的装等都写着「0」：从 rio 的物品池里取 ri.ilvl，
    // 而那个池子只有 {n, i, q, sock}，没有 ilvl 这个字段 —— 取到
    // undefined，`(undefined) || 0` 得 0，然后 String(0) 印成「0」。
    // 判据是「装等那一格不许出现 0 或空」：装等是正整数，或者干脆不画那一格
    // （查不到时画的是「装等 ?」，走 iv-none 那一支）。
    if (n.classList && n.classList.contains('sub2')
      && n.parentNode && n.parentNode.classList
      && n.parentNode.classList.contains('im')) {
      var t = n.textContent.replace(/(榜单均值|实测最高|配置装等)$/, '');
      if (n.classList.contains('iv-none')) {
        stats.ivNone++;
        if (t !== '装等 ?') {
          problems.push(label + ' 查不到装等那一格的文字是「' + t + '」，该是「装等 ?」');
        }
      } else {
        if (n.classList.contains('iv-rio')) stats.ivRio++;
        else if (n.classList.contains('iv-gi')) stats.ivGi++;
        else if (n.classList.contains('iv-sim')) stats.ivSim++;
        // 形如「703」或「690→703」。0 一律不合格 —— 那正是上一版的样子。
        //
        // **允许一位数**，第 20 轮换赛季时被真实数据教育了一次：原来写的是
        // `\d{1,3}`（至少两位），换到 season-mn-2 之后报「装等那一格是『5』」。
        // 查了一下 —— itemId 88710「纳特的帽子」，一顶 5 级的钓鱼帽子，
        // 榜上真有一个人抓 profile 那一刻头上戴着它。那是真数据，不是 bug。
        // 这条断言要防的是「印成 0」（字段不存在），不是「装等太低」。
        if (!/^[1-9]\d{0,3}(→[1-9]\d{0,3})?$/.test(t)) {
          stats.ivZero++;
          if (stats.ivZero < 4) {
            problems.push(label + ' 装等那一格是「' + t + '」—— 装等该是正整数，'
              + '查不到就别画（0 是「取了个不存在的字段」的样子）');
          }
        }
      }
    }
    // ---- 装等差距徽章。形如「289 → 331　差 42」，三种状态各有 class。
    if (n.classList && n.classList.contains('gap')
      && n.classList.contains('tag')) {
      stats.gapBadge++;
      var gt = n.textContent;
      // 前半截是两个原始装等（第 16 轮加的：做决定要看的数字不该只在悬停提示里），
      // 后半截是差值。两截都要验，而且要互相对得上。
      var m2 = /^([0-9]+) → ([0-9]+)　(差 [1-9][0-9]{0,2}|高 [1-9][0-9]{0,2}|持平)$/.exec(gt);
      var okTxt = !!m2;
      var tail = m2 ? m2[3] : '';
      // 文字和 class 必须**互相对得上**。只验文字的话「差 14」配 ahead 这种
      // 反着来的组合照样过 —— 而那正是「颜色对不上数字」的样子：
      // 落后画成淡色、领先画成警告色，用户会照着颜色做反的决定。
      var cls = n.classList.contains('behind') ? 'behind'
        : n.classList.contains('ahead') ? 'ahead'
          : n.classList.contains('even') ? 'even' : '';
      var wantCls = tail.indexOf('差 ') === 0 ? 'behind'
        : tail.indexOf('高 ') === 0 ? 'ahead' : 'even';
      if (!okTxt || cls !== wantCls) {
        stats.gapBad++;
        if (stats.gapBad < 4) {
          problems.push(label + ' 装等差距徽章「' + gt + '」配的是 class「' + cls
            + '」，该是「' + wantCls + '」');
        }
      }
      // ---- 差值本身对不对：**拿提示里的两个数自己减一遍**。
      //
      // 上面那条只验「文字和颜色一致」，抓不到**符号反了**：把 want - mine 写成
      // mine - want，文字变「高 14」、class 跟着变 ahead，两者依然一致 ——
      // 而界面上「你落后 14」就变成了「你领先 14」，正好指向反的行动。
      // 提示里写的是「你 689.4　首选那件 703（…）」，两个数都是原始量，
      // 所以这里能独立算出差值，再和徽章上那个数比。
      var tip = n.attrs && n.attrs['data-tip'] || '';
      var nums = tip.match(/你 ([\d.]+)　首选那件 (\d+)/);
      if (!nums) {
        stats.gapBad++;
        if (stats.gapBad < 4) {
          problems.push(label + ' 装等差距徽章的提示里没有「你 X　首选那件 Y」，'
            + '差值就没法独立复核了：' + tip.slice(0, 60));
        }
      } else {
        var want = Math.round(Number(nums[2]) - Number(nums[1]));
        var shown = tail === '持平' ? 0
          : (tail.indexOf('差 ') === 0 ? 1 : -1) * Number(tail.slice(2));
        // 徽章上印的两个装等必须**就是**提示里那两个。不然徽章是一套数、提示是
        // 另一套，两边各自自洽而用户看到的是矛盾的读数。
        if (m2 && (Math.round(Number(nums[1])) !== Number(m2[1])
          || Number(nums[2]) !== Number(m2[2]))) {
          stats.gapBad++;
          if (stats.gapBad < 4) {
            problems.push(label + ' 装等差距徽章上印的是 ' + m2[1] + ' → ' + m2[2]
              + '，提示里却是 ' + nums[1] + ' → ' + nums[2]);
          }
        }
        if (want !== shown) {
          stats.gapBad++;
          if (stats.gapBad < 4) {
            problems.push(label + ' 装等差距徽章写「' + gt + '」，但提示里两个数（你 '
              + nums[1] + '，首选 ' + nums[2] + '）算出来是 ' + want
              + ' —— 符号或算式反了');
          }
        } else {
          stats.gapMath++;
        }
      }
    }
    if (n.classList && n.classList.contains('gap-sum')) stats.gapSum++;
    if (n.classList && n.classList.contains('cov')) {
      if (n.classList.contains('sim')) {
        stats.sim++;
        if (n.textContent !== 'SimC') {
          stats.simBad++;
          if (stats.simBad < 4) problems.push(label + ' 模拟配装徽章文字不对：' + n.textContent);
        }
      } else if (n.classList.contains('sn')) {
        stats.sn++;
        if (!/^N=\d+$/.test(n.textContent)) {
          stats.snBad++;
          if (stats.snBad < 4) problems.push(label + ' 样本量徽章文字不对：' + n.textContent);
        }
      } else {
        stats.cov++;
        if (!/^记录 \d+(\.\d)?%$/.test(n.textContent)) {
          stats.covBad++;
          if (stats.covBad < 4) problems.push(label + ' 覆盖率徽章文字不对：' + n.textContent);
        }
      }
    }
  });
  if (!sawItem) problems.push(label + ' 一件装备都没画出来');
  checkSlotGapTarget(label);

  /*
   * 更新入口的复制按钮（第 22 轮）：页面自己不能联网（file:// 禁 fetch），
   * 这个按钮的全部价值就是交给用户一条能跑的命令 —— 复制错了等于没有。
   * 只在第一次渲染点一次：按钮每次渲染都是新的，点一次就能验出命令对不对。
   */
  if (stats.renders === 1) {
    var updBtn = null;
    walk(body, function (n) {
      if (updBtn || !n.classList || !n.classList.contains('mini')) return;
      if (/复制全量命令/.test(n.textContent || '')) updBtn = n;
    });
    if (!updBtn) {
      problems.push(label + ' 没找到「更新这些数据」的复制按钮 —— 入口画了但命令给不出');
    } else {
      updBtn.click();
      var lastCmd = copied[copied.length - 1];
      if (!lastCmd || !lastCmd.text || lastCmd.text.indexOf('update-bis-data.ps1') < 0) {
        problems.push(label + ' 复制出来的更新命令不含 update-bis-data.ps1：'
          + (lastCmd && lastCmd.text));
      }
    }
    // 在线拉取按钮只验**存在**，不点击：它会把 gearLoading 置起并等待
    // 远端 <script>，而桩不会触发 onload —— 点了后面 246 次渲染全部早退。
    // 真点的那条在「主表易用性」⑤（那里是套件的尾巴）。
    var onlineBtn = null;
    walk(body, function (n) {
      if (onlineBtn || !n.classList || !n.classList.contains('mini')) return;
      if (/重新加载远端副本/.test(n.textContent || '')) onlineBtn = n;
    });
    if (!onlineBtn) {
      problems.push(label + ' 没有「重新加载远端副本」按钮（第 22 轮用户要的：点击才联网）');
    }
  }
}

/**
 * 装等差距**比的是哪一件**：必须是这一格实际推荐的那一件。
 *
 * 为什么单独一条：徽章文字、颜色、提示里的两个数全都出自同一个 `top`，
 * 所以「把 rows[0] 写成 rows[rows.length-1]」这种改动**处处自洽** ——
 * 提示里写「首选那件 312」，徽章按 312 算，三者一致，只是那 312 是列表末尾
 * 那件「可刷替代」的装等。实测这么改一下差距会凭空缩小，用户以为自己快毕业了。
 *
 * 「实际推荐的那一件」不是分布的第一行：戒指/饰品成对去重之后（renderGear
 * 的 pickFor），第二格推荐的是第二件，而完整分布的第一行仍然是第一件。
 * 判据跟着 **.top** 走 —— renderItem 给 i === pickIdx 的那行加 top 类，
 * flat 和折叠两种摆法都加。第一版这条拿「第一行」当判据，修 pi 顺序 bug
 * 之前它永远过（徽章和第一行都读 rows[0]），等于没在验这一条。
 */
function checkSlotGapTarget(label) {
  walk(body, function (n) {
    if (!n.classList || !n.classList.contains('slot')) return;
    var head = null, topItem = null;
    n.children.forEach(function (c) {
      if (!c.classList) return;
      if (!head && c.classList.contains('slot-head')) head = c;
    });
    // 部位组里的装备行：第 21 轮改成角色栈之后，行被包进 .slot > .slot-list 里
    // （默认折起来，点格子头展开），所以不能假设它们是 .slot 的直接子节点。
    // 用 walk 找带 top 的 .item —— 两种结构都吃得住。
    walk(n, function (c) {
      if (!topItem && c.classList && c.classList.contains('item')
          && c.classList.contains('top')) topItem = c;
    });
    if (!head || !topItem) return;

    var tip = '';
    walk(head, function (h) {
      if (h.classList && h.classList.contains('gap') && h.classList.contains('tag')) {
        tip = (h.attrs && h.attrs['data-tip']) || '';
      }
    });
    if (!tip) return;                       // 这个部位没画差距徽章
    var m = tip.match(/首选那件 (\d+)/);
    if (!m) return;                         // 提示格式那条断言已经在管了

    var shownIlvl = null;
    walk(topItem, function (x) {
      if (shownIlvl === null && x.classList && x.classList.contains('sub2')
        && !x.classList.contains('iv-none')) {
        var t = (x.textContent || '').match(/^(\d+)/);
        if (t) shownIlvl = Number(t[1]);
      }
    });
    if (shownIlvl === null) return;         // 推荐件没画装等（两份数据都查不到）

    stats.gapTop++;
    if (Number(m[1]) !== shownIlvl) {
      stats.gapTopBad++;
      if (stats.gapTopBad < 4) {
        problems.push(label + ' 装等差距说「首选那件 ' + m[1]
          + '」，但这一格推荐的是 ' + shownIlvl
          + ' —— 比的不是本格实际推荐的那一件');
      }
    }
  });
}

// openBis() 只在第一次调用时读设置（之后 gearLoaded 为真就直接 render），
// 所以每换一个组合都要重新 eval bis.js，否则 80 次渲染画的是同一个专精。
//
// **只走界面上真有的两个视角。** 第 16 轮撤掉了 GearInsight 的「团本视角 /
// 大秘境视角」两个按钮，而有一版这个循环还在跑 'raid' / 'mplus' ——
// openBis() 把这两个旧值迁到默认视角，于是那两轮画的都是默认视角，
// 渲染次数一字不差、套件全绿，**但等于同一个视角画了三遍**。
// 旧视角迁移单独验（见下面 checkViewMigration），不混在这里。
//
// SimC 没有配置的专精（治疗等 11 个），选「模拟配装」画出来的是实战分布 ——
// 标签按**真正画的视角**写（…/simc-none/rio），不然下面按标签认 rio 渲染的那几条会数错。
function hasSim(key) {
  var s = B.specs[key];
  return !!(s && g.AE_SIMC && g.AE_SIMC.specs[String(s.specId)]);
}
specKeys.forEach(function (key) {
  ['simc', 'rio'].forEach(function (view) {
    settings.bisTab = 'gear';
    settings.bisSpec = key;
    settings.bisView = view;
    settings.bisChar = '';
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();
    checkRender(key + '/' + (view === 'simc' && !hasSim(key) ? 'simc-none/rio' : view));
    if (view === 'rio') stats.mainRio++;
    if (view === 'simc') checkSimFallback(key);
  });
});

/**
 * 选了「模拟配装」、但这个专精 SimC 没有配置：必须退到实战分布、高亮实战分布、并且**说出来**。
 * 不说的话「模拟配装」按钮凭空不见了，看着像功能坏了；高亮按 state.view 判的话一个按钮都不亮。
 */
function checkSimFallback(key) {
  var on = [], note = 0, simBtn = 0;
  walk(body, function (n) {
    if (n.tagName === 'BUTTON' && n.parentNode && n.parentNode.classList
      && n.parentNode.classList.contains('seg') && !n.parentNode.classList.contains('sim-pick')
      && n.parentNode.parentNode && n.parentNode.parentNode.classList
      && n.parentNode.parentNode.classList.contains('bis-bar')) {
      if (n.textContent === '模拟配装') simBtn++;
      if (n.classList.contains('on')) on.push(n.textContent);
    }
    if (n.classList && n.classList.contains('sim-none')) note++;
  });
  if (hasSim(key)) {
    stats.simHave++;
    if (!simBtn || on.join() !== '模拟配装') problems.push(key + ' 有 SimC 配置，但「模拟配装」没画出来或没高亮（高亮的是 ' + on.join('/') + '）');
    if (note) problems.push(key + ' 有 SimC 配置，却画了「SimC 没有默认配置」那句');
  } else {
    stats.simNone++;
    if (simBtn) problems.push(key + ' 没有 SimC 配置，却画了「模拟配装」按钮（点了没东西）');
    if (on.join() !== '实战分布') problems.push(key + ' 没有 SimC 配置，退到实战分布时高亮的是「' + on.join('/') + '」');
    if (note !== 1) problems.push(key + ' 没有 SimC 配置，「SimC 没有默认配置」那句画了 ' + note + ' 次（该是 1 次）');
  }
}

// ---- 撤掉的两个视角：按钮没了，老设置要迁走
//
// 这一条盯的是**升级上来的用户**：设置里存着 bisView='raid'，而界面上已经没有
// 那个按钮了。不迁的话面板会停在一个渲染一切正常、却切不回去的视角里 ——
// 界面自洽，谁也看不出为什么。所以判据有两条，都得成立：
//   · 视角按钮**正好两个**，且没有「团本视角 / 大秘境视角」；
//   · 存着旧值进来，画出来的必须是模拟配装（认 SimC 的徽章「SimC」）。
// 'retired-view' 代表任何一个已经撤掉的视角名（v1.21.0 换过默认视角的数据源）：
// 迁移按「不是现存的两个就迁」判，不按名字一个个列。
(function checkViewMigration() {
  var VIEW_LABELS = ['模拟配装', '实战分布'];
  var GONE = ['团本视角', '大秘境视角'];
  ['raid', 'mplus', 'retired-view', 'simc', 'rio'].forEach(function (saved) {
    settings.bisTab = 'gear';
    settings.bisSpec = specKeys[0];
    settings.bisView = saved;
    settings.bisChar = '';
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();

    var labels = [], simBadge = 0, snBadge = 0, on = [];
    walk(body, function (n) {
      // 视角按钮那一组（.seg），**不含**同一行里「按英雄天赋各一份」的配置开关（.sim-pick）。
      if (n.tagName === 'BUTTON' && n.parentNode && n.parentNode.classList
        && n.parentNode.classList.contains('seg') && !n.parentNode.classList.contains('sim-pick')
        && n.parentNode.parentNode && n.parentNode.parentNode.classList
        && n.parentNode.parentNode.classList.contains('bis-bar')) {
        labels.push(n.textContent);
        if (n.classList.contains('on')) on.push(n.textContent);
      }
      if (n.classList && n.classList.contains('cov')) {
        if (n.classList.contains('sim')) simBadge++;
        else if (n.classList.contains('sn')) snBadge++;
      }
    });
    stats.vmChecked++;

    GONE.forEach(function (t) {
      if (labels.indexOf(t) >= 0) {
        problems.push('视角切换器里还有「' + t + '」按钮 —— 第 16 轮撤掉了它');
      }
    });
    if (labels.length !== VIEW_LABELS.length) {
      problems.push('视角按钮 ' + labels.length + ' 个（' + labels.join('/')
        + '），应该正好 ' + VIEW_LABELS.length + ' 个：' + VIEW_LABELS.join('/'));
    }
    // 迁移：旧值和 simc 都该落在模拟配装上（高亮 + SimC 的徽章）。
    var wantSim = (saved !== 'rio');
    if (wantSim) {
      if (on.indexOf('模拟配装') < 0) {
        problems.push('设置里存着 bisView=' + saved + '，高亮却在「' + on.join('/')
          + '」—— 撤掉的视角没迁到「模拟配装」，用户会卡在一个没有按钮的视角里');
      }
      if (!simBadge) {
        problems.push('设置里存着 bisView=' + saved + '，但一个 SimC 徽章都没画出来');
      }
      stats.vmMigrated++;
    } else if (!snBadge) {
      problems.push('设置里存着 bisView=rio，却没画出样本量徽章');
    }
    // 迁移必须**写回设置**。只改 state.view 的话那段代码是死的：state.view 的
    // 初值本来就是 'simc'，删掉整段行为一模一样 —— 没有这一条，
    // 「迁移」这个功能是不是真的存在，测试分不出来。
    if (saved !== 'simc' && saved !== 'rio') {
      if (settings.bisView !== 'simc') {
        problems.push('设置里存着 bisView=' + saved + '（已撤掉的视角），'
          + '读完设置后它还是「' + settings.bisView + '」—— 迁移没写回存档，'
          + '下次打开又是这个不存在的视角');
      } else {
        stats.vmWrote++;
      }
    }
  });
})();

// ---- 存档里的专精 key 换了英雄天赋：要落在同一个专精上，不是退回第一个
//
// key 是「职业/专精/英雄天赋」，第三段跟着 BisData 走。v1.19.0 换数据时 40 个
// 专精里 25 个的热门英雄天赋变了；原来对不上就退回 firstKey()（鲜血死骑），
// 升级上来的火法用户打开面板看到的是死骑，界面一切正常。判据：高亮的专精按钮
// 必须属于存档里那个「职业/专精」，而且只有一个。
(function checkStaleSpecKey() {
  var tried = 0;
  specKeys.forEach(function (key) {
    var parts = key.split('/');
    if (parts.length < 3 || key === specKeys[0]) return;
    if (tried >= 3) return;
    tried++;
    settings.bisTab = 'gear';
    settings.bisSpec = parts[0] + '/' + parts[1] + '/Not A Hero Talent';
    settings.bisView = 'simc';
    settings.bisChar = '';
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();
    var lit = [];
    walk(body, function (n) {
      if (n.tagName === 'BUTTON' && n.classList && n.classList.contains('spec')
        && n.classList.contains('on')) lit.push(n.getAttribute('data-tip') || '');
    });
    stats.staleKey++;
    if (lit.length !== 1 || lit[0].indexOf(parts[0] + '/' + parts[1]) !== 0) {
      problems.push('存档专精 ' + settings.bisSpec + '（英雄天赋换过名）打开后高亮的是「'
        + lit.join(' / ') + '」—— 应该还是 ' + parts[0] + '/' + parts[1]);
    }
  });
})();

// ---- 对照角色：装等差距那一组只有选了角色才画得出来
//
// 上面那些渲染全是 bisChar='' —— **一个装等差距徽章都不会出现**。
// 这一组真的选上本机存档里的角色，按「职业对得上」挑，因为对着别的职业的
// 毕业表比装等没有意义（面板自己也会画一条「职业不是本专精所属职业」的警告）。
//
// 判据分两层：徽章本身的文字/class 在 checkRender 里逐个验；这里验**下界** ——
// 一个都没画出来说明这条路没走到，而上面那条「文字必须合格」在 0 个徽章的
// 情况下照样成立（空集合上的全称命题恒真，这是本仓库反复踩到的假绿形状）。
(function checkGearGap() {
  var chars = (model.characters || []).filter(function (c) {
    return c.equipment && Object.keys(c.equipment).length >= 10
      && c.ilvl && c.ilvl.value > 50;
  });
  if (!chars.length) {
    // 没有可用存档不算失败（克隆下来没有 data/data.js 的人也要能跑），
    // 但要显式记 0，让摘要里那句「对照过 0 个角色」自己说出来。
    stats.gapChars = 0;
    return;
  }
  // 每个职业挑一个装备最全的，最多 6 个 —— 再多只是重复同一条路。
  var byCls = {};
  chars.forEach(function (c) {
    var cur = byCls[c.classFile];
    if (!cur || Object.keys(c.equipment).length > Object.keys(cur.equipment).length) {
      byCls[c.classFile] = c;
    }
  });
  var picks = Object.keys(byCls).map(function (k) { return byCls[k]; }).slice(0, 6);

  picks.forEach(function (c) {
    // 找一个同职业的专精 key，这样对照才有意义。
    var key = null;
    for (var i = 0; i < specKeys.length; i++) {
      if (specKeys[i].split('/')[0] === c.classFile) { key = specKeys[i]; break; }
    }
    if (!key) return;
    ['simc', 'rio'].forEach(function (view) {
      settings.bisTab = 'gear';
      settings.bisSpec = key;
      settings.bisView = view;
      settings.bisChar = c.key;
      body.children.length = 0;
      load('app/bis.js');
      g.AE.openBis();
      // 标签按真正画的视角写（见上面专精循环那段）：这个职业的第一个专精可能没有 SimC 配置。
      var shown = view === 'simc' && !hasSim(key) ? 'simc-none/rio' : view;
      checkRender('对照/' + c.name + '/' + shown);
      checkPairedSlots('对照/' + c.name + '/' + shown);
      stats.gapSlots++;
    });
    stats.gapChars++;
  });
})();

/**
 * **戒指 / 饰品按一对判**（第 20 轮用户定的）。
 *
 * 游戏里两个戒指格、两个饰品格是等价的，一件戒指戴在哪个孔是玩家插进去的顺序；
 * 而推荐数据是按孔位存的。按孔位逐格比会画出自相矛盾的界面：同一枚戒指在
 * 「戒指1」的替代表里没有已拥有底色（像你没这件），同时在「戒指2」头上被写成
 * 「你身上这件不在推荐列表里」。
 *
 * 这条断言**只看画出来的东西**，不重算推荐列表（重算等于把面板的逻辑抄一遍，
 * 那是恒等式）。不变量是：
 *   如果「戒指1」戴的那件出现在「戒指2」列出来的行里，那么
 *     ① 「戒指1」头上必须是 ✓（对上），
 *     ② 「戒指2」里那一行必须有已拥有底色（have）。
 * 反过来同理。饰品 13/14 一样。
 */
function checkPairedSlots(label) {
  var blocks = {};
  walk(body, function (n) {
    if (!n.classList || !n.classList.contains('slot')) return;
    var name = '', mineName = '', ok = false, rows = [], have = {};
    walk(n, function (m) {
      if (!m.classList) return;
      if (m.classList.contains('slot-head')) {
        (m.children || []).forEach(function (c2) {
          if (c2.tagName === 'B' && !name) name = String(c2.textContent || '');
          if (c2.classList && c2.classList.contains('mine')) {
            ok = c2.classList.contains('ok');
            // **名字要从那个没有 class 的 span 里取**，不是整块的 textContent：
            // 那一块是「✓ 」+ 名字 + 装等（`.sub`），拿整块文字会带上装等，
            // 和下面行里的名字永远配不上 —— 第一版就是这样让 pairCase 恒为 0 的。
            (c2.children || []).forEach(function (c3) {
              if (!mineName && c3.tagName === 'SPAN' && !c3.className) {
                mineName = String(c3.textContent || '');
              }
            });
          }
        });
      }
      if (m.classList.contains('item')) {
        var t = '';
        walk(m, function (x) {
          if (!t && x.tagName === 'B' && x.textContent) t = String(x.textContent);
        });
        if (t) { rows.push(t); if (m.classList.contains('have')) have[t] = 1; }
      }
    });
    if (name) blocks[name] = { mine: mineName, ok: ok, rows: rows, have: have };
  });

  [['戒指1', '戒指2'], ['饰品1', '饰品2']].forEach(function (pr) {
    [[pr[0], pr[1]], [pr[1], pr[0]]].forEach(function (ab) {
      var A = blocks[ab[0]], Bk = blocks[ab[1]];
      if (!A || !Bk || !A.mine) return;
      // 「装等更高的同名替代品」在两边的行名相同，所以按名字比就够了。
      if (Bk.rows.indexOf(A.mine) < 0) return;
      stats.pairCase++;
      if (!A.ok) {
        stats.pairBad++;
        if (stats.pairBad < 4) {
          problems.push(label + ' ' + ab[0] + '「' + A.mine + '」在' + ab[1]
            + '的推荐列表里，头上却是「·」—— 戒指/饰品两个格子在游戏里等价，'
            + '按孔位逐格比会把同一件既算成「没有」又算成「不推荐」');
        }
      }
      if (!Bk.have[A.mine]) {
        stats.pairBad++;
        if (stats.pairBad < 4) {
          problems.push(label + ' ' + ab[1] + '里那行「' + A.mine
            + '」没有已拥有底色，而这件正戴在' + ab[0]);
        }
      }
    });
  });
}

/**
 * **两只戒指调个位置，「对上 N 件」不许变。**
 *
 * 这是「戒指/饰品按一对判」最硬的判据，而且**不用重算推荐列表**：游戏里两个戒指格
 * 等价，所以把 A、B 两枚戒指换个孔戴，结论必须完全一样。按孔位逐格比的话这个数会跳
 * （两个孔的推荐列表几乎从来不一样），所以这条断言正对着那个 bug。
 *
 * 造样本的办法是**克隆一个真角色再把两只戒指的物品链接对调**，不是凭空编一个角色 ——
 * 编的角色装备形状容易和真数据不一样，测出来的东西就不算数。
 */
(function checkRingSwap() {
  var SW = [['FINGER0SLOT', 'FINGER1SLOT'], ['TRINKET0SLOT', 'TRINKET1SLOT']];
  function idOf(it) {
    var m = it && it.link ? /item:(\d+)/.exec(it.link) : null;
    return m ? m[1] : '';
  }
  var cands = (model.characters || []).filter(function (c) {
    if (!c.equipment) return false;
    return SW.some(function (p) {
      var a = c.equipment[p[0]], b = c.equipment[p[1]];
      return a && b && idOf(a) && idOf(b) && idOf(a) !== idOf(b);
    });
  });
  if (!cands.length) {
    problems.push('戒指调位：本机找不到一个「两只戒指/饰品不同」的角色 —— 这一条在验空气');
    return;
  }

  function matchedOf() {
    var out = null;
    walk(body, function (n) {
      if (out || !n.classList || !n.classList.contains('bis-sum')) return;
      // 两个视角用词不同（实战分布说「榜上见过 / 没见过」，模拟配装说「对上 / 差」）——
      // 两种都要认，不然 rio 那一半抓不到这一行，断言会静默变成「没数据」。
      var m = /(?:对上|榜上见过) (\d+) 件，(?:差|没见过) (\d+) 件/.exec(String(n.textContent || ''));
      if (m) out = m[1] + '/' + m[2];
    });
    return out;
  }

  cands.slice(0, 3).forEach(function (c) {
    var key = null;
    for (var i = 0; i < specKeys.length; i++) {
      if (specKeys[i].split('/')[0] === c.classFile) { key = specKeys[i]; break; }
    }
    if (!key) return;
    // 克隆 + 对调。克隆体挂在 model.characters 上，用一个不会撞的 key。
    var twin = JSON.parse(JSON.stringify(c));
    twin.key = c.key + '#swap';
    twin.name = c.name + '（对调）';
    SW.forEach(function (p) {
      var a = twin.equipment[p[0]], b = twin.equipment[p[1]];
      if (a && b) { twin.equipment[p[0]] = b; twin.equipment[p[1]] = a; }
    });
    model.characters.push(twin);

    /*
     * 再造一个**「戒指戴反了」**的样本：从这个专精 rio 榜单里挑一件
     * **只在戒指2 出现、戒指1 没有**的戒指，塞进克隆体的戒指1 孔。
     *
     * 为什么要专门造：本机真实装备里一组都没有这种局面（pairCase 一直是 0），
     * 而它正是这次要修的那个 bug 的形状 —— 不造出来，上面那条 DOM 不变量就是空转。
     */
    var planted = null;
    var sid = (B.specs[key] || {}).specId;
    var RS = g.AE_RIO && g.AE_RIO.specs && g.AE_RIO.specs[String(sid)];
    if (RS && RS.slots && RS.slots['11'] && RS.slots['12']) {
      var in11 = {};
      RS.slots['11'].d.forEach(function (r) { in11[r[0]] = 1; });
      for (var j = 0; j < RS.slots['12'].d.length; j++) {
        var id12 = RS.slots['12'].d[j][0];
        if (in11[id12]) continue;
        var meta = g.AE_RIO.items[String(id12)];
        var slotIt = twin.equipment.FINGER0SLOT;
        if (!meta || !meta.n || !slotIt || !slotIt.link) break;
        planted = JSON.parse(JSON.stringify(twin));
        planted.key = c.key + '#planted';
        planted.name = c.name + '（戴反）';
        planted.equipment.FINGER0SLOT = {
          link: slotIt.link.replace(/item:\d+/, 'item:' + id12),
          name: meta.n, itemLevel: slotIt.itemLevel, quality: meta.q
        };
        model.characters.push(planted);
        break;
      }
    }

    ['simc', 'rio'].forEach(function (view) {
      function renderFor(charKey) {
        settings.bisTab = 'gear';
        settings.bisSpec = key;
        settings.bisView = view;
        settings.bisChar = charKey;
        body.children.length = 0;
        load('app/bis.js');
        g.AE.openBis();
        // 顺手让上面那条 DOM 不变量也跑在**对调后**的样本上 —— 原始装备里
        // 「戴在另一个孔的推荐件」本机一组都没有（pairCase=0），而对调过的样本
        // 天然会造出这种局面，断言这才不是空转的。
        checkPairedSlots('戒指调位/' + charKey + '/' + view);
        return matchedOf();
      }
      var before2 = renderFor(c.key);
      var after = renderFor(twin.key);
      // 「戴反了」那个样本只在 rio 视角有意义（挑件是从 rio 榜单里挑的）。
      if (planted && view === 'rio') renderFor(planted.key);
      stats.swapCases++;
      if (before2 == null || after == null) {
        problems.push('戒指调位：' + c.name + '/' + view + ' 没抓到「对上 N 件」那一行');
        return;
      }
      if (before2 !== after) {
        stats.swapBad++;
        problems.push('戒指调位：' + c.name + '/' + view + ' 把两只戒指/饰品换个孔之后，'
          + '「对上/差」从 ' + before2 + ' 变成了 ' + after
          + ' —— 两个戒指格在游戏里等价，换个孔不该改变结论（说明还在按孔位逐格比）');
      }
    });
    // 用完就摘掉，别让克隆体污染后面的断言。
    [twin, planted].forEach(function (x) {
      var ix = x ? model.characters.indexOf(x) : -1;
      if (ix >= 0) model.characters.splice(ix, 1);
    });
  });
  if (stats.swapCases < 2) {
    problems.push('戒指调位：只跑了 ' + stats.swapCases + ' 组，这一条没跑起来');
  }
})();

/**
 * **跨职业对照**：选了死骑，切到法师专精。
 *
 * 上面那个驱动**故意挑同职业的专精**，所以这条路它一次都走不到 —— 而这正是
 * bisChar 持久化带来的那个坑：选完一个角色再换专精，设置还在。
 *
 * 判据不是「有没有警告」，而是**那些没有意义的数字一个都不许画出来**：
 * 跨护甲类型比装备，「对上 0 件 / 差 13 件」和「装等差距」都是算得出来、
 * 长得和真数字一模一样、却没有任何含义的东西。旧版是「照算 + 最下面一行警告」，
 * 那等于把错的数摆在显眼处、把话说在角落里。
 *
 * 三条一起立，少一条就能被绕过：
 *   ① 装等差距徽章 0 个（照算的话这里会有十几个）；
 *   ② 「对上 N 件」那句不出现（它的分母是跨职业算出来的）；
 *   ③ 但**必须**有一句说明，而且得说出那个角色的名字 ——
 *      静默什么都不画会让用户以为功能坏了。
 */
(function checkCrossClassChar() {
  var chars = (model.characters || []).filter(function (c) {
    return c.equipment && Object.keys(c.equipment).length >= 10
      && c.ilvl && c.ilvl.value > 50;
  });
  if (!chars.length) { stats.xcChecked = 0; return; }

  chars.slice(0, 8).forEach(function (c) {
    // 找一个**别的职业**的专精 key
    var key = null;
    for (var i = 0; i < specKeys.length; i++) {
      if (specKeys[i].split('/')[0] !== c.classFile) { key = specKeys[i]; break; }
    }
    if (!key) return;
    settings.bisTab = 'gear';
    settings.bisSpec = key;
    settings.bisView = 'simc';
    settings.bisChar = c.key;
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();
    stats.xcChecked++;

    var gaps = 0, sums = [], notes = 0;
    walk(body, function (n) {
      if (n.classList && n.classList.contains('gap')) gaps++;
      if (n.classList && n.classList.contains('bis-sum')) sums.push(n.textContent || '');
    });
    var label = '跨职业对照/' + c.name + '→' + key;
    if (gaps) {
      problems.push(label + ' 画了 ' + gaps + ' 个装等差距徽章 —— '
        + '跨职业比装备算不出有意义的数，一个都不该画');
    } else stats.xcNoGap++;

    sums.forEach(function (t) {
      if (/对上 \d+ 件/.test(t)) {
        problems.push(label + ' 还在印「' + t.slice(0, 40) + '」—— '
          + '那个分母是拿别的职业的装备算出来的');
      }
      // 说明里必须点出角色名，否则用户不知道是哪个角色被挡下了
      if (t.indexOf(c.name) >= 0 && /不是|没有拿他对照/.test(t)) notes++;
    });
    if (!notes) {
      problems.push(label + ' 一句说明都没有 —— '
        + '对照痕迹凭空消失，用户会以为功能坏了（该说「' + c.name + ' 是XX，不是本专精所属职业」）');
    } else stats.xcNote++;
  });
})();

// ---- 首屏兜底：默认视角是模拟配装，而 app/simc-data.js 是**懒加载**的。
//
// 上面那些渲染全是「数据已经在」的情况，所以它们**验不到**这条路。
// 真实首屏是另一回事：state.view 已经是 'simc'，但 AE_SIMC 还没到，
// simPick() 恒为 null。没有 effectiveView() 兜底的话面板会空一下，
// 而「空一下」和「这个专精真没数据」在界面上分不出来。
//
// 这里把 AE_SIMC 临时藏起来，重新走一次完整渲染，要求**照样画出装备**，
// 而且**不许**说「SimC 没有这个专精的配置」—— 那是「加载完了确实没有」的说法，不是「还没到」。
(function checkFirstPaintFallback() {
  var saved = g.AE_SIMC;
  delete g.AE_SIMC;
  var before = problems.length;
  var sample = specKeys.slice(0, 3);
  sample.forEach(function (key) {
    settings.bisTab = 'gear';
    settings.bisSpec = key;
    settings.bisView = 'simc';      // 用户选的是模拟配装
    settings.bisChar = '';
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();
    // checkRender 里那条「一件装备都没画出来」就是这次要验的东西
    checkRender('首屏兜底/' + key);
    walk(body, function (n) {
      if (n.classList && n.classList.contains('sim-none')) {
        problems.push('首屏兜底/' + key + '：SimC 数据还没到，却说「这个专精 SimC 没有默认配置」');
      }
    });
  });
  g.AE_SIMC = saved;
  if (problems.length > before) {
    problems.push('SimC 数据没加载时首屏画不出装备 —— effectiveView() 的兜底失效了');
  }
  stats.fallbackChecked = sample.length;
})();

/*
 * ---- 借来的装等：三条分支都必须真的画到。
 *
 * SimC 配置定不出装等的格子（多是制造装备）借本机实测：GearInsight 有就用它的「最高」，
 * 没有再退到 raider.io 的「榜上均值」，两边都没有画「装等 ?」。MID2 的默认配置里，
 * 借的格子**恰好全部**在 GearInsight 里查得到 —— 于是后两条分支在真数据上一次都走不到，
 * 而「文字必须合格」那些断言在空集合上恒真。所以这里造三格：把一份配置里的一格换成
 * 「没写装等」的三种物品，真值**独立算**（不调 bis.js 的 measuredGear）。
 */
(function checkBorrowedIlvl() {
  var S0 = g.AE_SIMC, R = g.AE_RIO;
  var key = specKeys.filter(hasSim)[0];
  if (!S0 || !R || !key) { problems.push('借来的装等：缺 SimC / rio 数据，这一组在验空气'); return; }
  var GI = {}, RA = {};
  Object.keys(B.specs).forEach(function (k) {
    ['raid', 'mplus'].forEach(function (v) {
      var slots = B.specs[k][v] || {};
      Object.keys(slots).forEach(function (sn) {
        (slots[sn] || []).forEach(function (r) { if (r[1] && !(GI[r[0]] >= r[1])) GI[r[0]] = r[1]; });
      });
    });
  });
  Object.keys(R.specs).forEach(function (sid) {
    var sl = R.specs[sid].slots || {};
    Object.keys(sl).forEach(function (sn) {
      (sl[sn].d || []).forEach(function (r) {
        if (!r[2]) return;
        var a = RA[r[0]] || (RA[r[0]] = { w: 0, n: 0 });
        a.w += r[2] * r[1]; a.n += r[1];
      });
    });
  });
  var both = Object.keys(GI).filter(function (id) { return RA[id]; })[0];
  var rioOnly = Object.keys(RA).filter(function (id) { return !GI[id]; })[0];
  var CASES = [
    ['两边都有，取 GearInsight 的「最高」', both, 'iv-gi', both && GI[both]],
    ['只有 raider.io，取「榜上均值」', rioOnly, 'iv-rio', rioOnly && Math.round(RA[rioOnly].w / RA[rioOnly].n)],
    ['两边都没有，画「装等 ?」', '1', 'iv-none', null]
  ];
  var prof = S0.specs[String(B.specs[key].specId)].profiles[0];
  var saved = prof.slots['1'];
  CASES.forEach(function (c) {
    if (!c[1]) { problems.push('借来的装等：' + c[0] + ' —— 数据里找不到这样的物品'); return; }
    prof.slots['1'] = { i: Number(c[1]) };
    settings.bisTab = 'gear'; settings.bisSpec = key; settings.bisView = 'simc'; settings.bisChar = '';
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();
    // 这三次渲染也过一遍通用的渲染检查。真数据里每一行都定得出装等，「查不到就画
    // 『装等 ?』、别印成 0」那几条断言只有这里造的样本喂得到。
    // 塞进来的三件都不在 SimC 的物品池里（假物品 1、只在 raider.io 出现的旧装备），
    // 图标查不到画成占位块是对的，不算进「查不到图标」那个计数 —— 那个计数管的是真数据。
    var ph0 = stats.ph;
    checkRender('借来的装等/' + key + '/' + c[2]);
    stats.ph = ph0;
    var sub = null;
    walk(body, function (n) {
      if (sub || !n.classList || !n.classList.contains('item')) return;
      if (!/(^|\n)itemID (\d+)(\n|$)/.test(n.attrs['data-tip'] || '') || RegExp.$2 !== String(c[1])) return;
      walk(n, function (m) { if (!sub && m.classList && m.classList.contains('sub2')) sub = m; });
    });
    var cls = !sub ? '（没画装等那一格）' : ['iv-gi', 'iv-rio', 'iv-none', 'iv-sim'].filter(function (k) {
      return sub.classList.contains(k);
    })[0] || '（没有来源 class）';
    var num = sub && /^(\d+)/.exec(sub.textContent || '');
    if (cls !== c[2] || (c[3] != null && (!num || Number(num[1]) !== c[3]))) {
      problems.push('借来的装等：' + c[0] + '，画出来的是 ' + cls + ' ' + (num ? num[1] : '')
        + '，该是 ' + c[2] + (c[3] != null ? ' ' + c[3] : ''));
    } else stats.ivBorrow++;
  });
  prof.slots['1'] = saved;
})();
if (stats.ivBorrow !== 3) {
  problems.push('借来的装等三条分支只验成 ' + stats.ivBorrow + '/3（GearInsight 最高 / raider.io 均值 / 装等 ?）');
}

// .tnode 的方块尺寸从 style.css 里读，不写死在这里。
// 写死的话改了 CSS 而忘了改这里，几何检查就会拿着旧尺寸算，算出来的「不重叠」
// 是假的。从样式表里读等于让这一条自动跟着 CSS 走。
var NODE_BOX = (function () {
  var css = fs.readFileSync(path.join(ROOT, 'app', 'style.css'), 'utf8');
  var m = /\.tnode\s*\{[^}]*?width:\s*(\d+)px;\s*height:\s*(\d+)px/.exec(css);
  if (!m) throw new Error('style.css 里读不到 .tnode 的宽高，几何检查没法做');
  return { w: Number(m[1]), h: Number(m[2]) };
})();

// 聚类容差。bis.js 里是 GRID_TOL = 100，这里**独立写一遍**而不是从那边读 ——
// 从被测代码里读参数，等于用被测代码验证自己，改成 0 也照样「一致」。
// 写死在这里的效果是：谁改了 bis.js 的容差，这一条就会红，逼他明确决定。
var GRID_TOL_EXPECT = 100;
var TREE = g.AE_TALENT_TREE || null;

// ------------------------------------------------------- 天赋导入串（照原样取）

/**
 * app/rio-data.js 里这个专精的官方导入串，按人数聚合降序。
 *
 * 这是**独立算的真值**，不是调 app/bis.js 里的 rioLoadouts() ——
 * 拿被测代码算真值再去验被测代码，是个恒等式，永远通过。
 * 排序规则必须和面板一致（人数降序，同人数按串本身），否则「#1」指的不是同一串。
 */
function rioLoadoutTruth(specId) {
  return loadoutTruth(g.AE_RIO, specId);
}

/**
 * 一个专精的天赋串真值，两家共用（第 20 轮起产物形状统一了）：
 * `loadouts: [[串, 多少人用]…]`，人数降序、同人数按串本身，最多 30 种。
 *
 * 这里除了读出来，还**独立排一遍**存进 sorted —— 面板不重排（顺序是产物的
 * 责任），所以「产物到底排对了没有」必须在这里判，否则那条规则没人管。
 */
function loadoutTruth(D, specId) {
  if (!D || !D.specs) return null;
  var sp = D.specs[String(specId)];
  if (!sp || !sp.loadouts || !sp.loadouts.length) return null;
  var count = Object.create(null), list = [];
  sp.loadouts.forEach(function (row) {
    if (!row || !row[0]) return;
    count[row[0]] = row[1] || 1;
    list.push(row[0]);
  });
  if (!list.length) return null;
  var sorted = list.slice().sort(function (a, b) {
    if (count[b] !== count[a]) return count[b] - count[a];
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  return {
    list: list, sorted: sorted, count: count,
    total: sp.n || list.length,
    uniq: sp.loUniq || sp.uniq || list.length
  };
}

/**
 * WCL 里这个专精的团本导入串真值。
 *
 * **独立算一遍**，不调 app/bis.js 的 wclLoadouts() —— 拿被测代码算真值是恒等式。
 * 产物里已经是 [[串, 人数]…] 且排好序了，所以这里的活是「按同一条规则再排一次
 * 并核对顺序没被面板改动」：人数降序，同人数按串本身。
 *
 * total 取产物的 n（真实采样人数），不是 count 之和 —— 产物只留前 30 种，
 * 拿截断后的和当分母，界面上的百分比会偏高。
 */
function wclLoadoutTruth(specId) {
  return loadoutTruth(g.AE_WCL, specId);
}

/**
 * 串头里的 specID。头是 8 位版本 + 16 位 specID，base64 每字符 6 位、低位在前。
 * 8 个字符 = 48 位，取头 24 位够了。
 */
function headerSpec(s) {
  var bits = DEC.toBits(String(s).slice(0, 8));
  if (!bits) return null;
  var v = 0;
  for (var i = 0; i < 16; i++) v |= (bits[8 + i] || 0) << i;
  return v;
}

/**
 * 导入串这一块。这一组盯的是「显示的串和数据里的串是不是同一串」——
 * 面板不编码、不改字符，所以这里能用最硬的判据：**字节相等**。
 */
function checkLoadouts(label, specId, boxes, texts, copies, picks, kindBtns, headTxt) {
  // ---- 第 20 轮：这一块分「团本 / 大秘境」两类，来源是两家
  //      （大秘境 raider.io，团本 Warcraft Logs）。
  //
  // 真值选哪一份，**看界面上哪个按钮是高亮的**，不看 state ——
  // 拿被测代码的内部状态去挑真值，就没法抓「高亮在团本、显示的却是大秘境那串」
  // 这种错，而那正是分两类之后新出现的、界面完全自洽的失败方式。
  var mplusTruth = rioLoadoutTruth(specId);
  var raidTruth = wclLoadoutTruth(specId);
  var have = [];
  if (mplusTruth) have.push('大秘境');
  if (raidTruth) have.push('团本');

  var onKind = null;
  (kindBtns || []).forEach(function (b) {
    if (b.classList && b.classList.contains('on')) {
      onKind = /团本/.test(b.textContent) ? 'raid' : 'mplus';
    }
  });
  var truth = onKind === 'raid' ? raidTruth : mplusTruth;

  if (!mplusTruth && !raidTruth) {
    // 两边都没真值 = 这个专精一条串都没有，那面板就**不该**画这一块。
    // 这一条反着抓：画出一个空框比不画更糟（用户会去复制一个空串）。
    if (boxes.length) loNote('画了空框', label + ' 两家都没有导入串，却画出了导入串块');
    return;
  }
  if (!truth) {
    loNote('高亮的类没数据', label + ' 界面高亮的是「'
      + (onKind === 'raid' ? '团本' : '大秘境') + '」，但那一类没有真值');
    return;
  }
  // 按钮条：有几类数据就该有几个按钮，一个不多一个不少。
  // 多画一个（比如那一类其实没数据）用户点下去会看到空白；
  // 少画一个（团本有数据却不给按钮）等于这一半功能没上。
  if (boxes.length) {
    if ((kindBtns || []).length !== have.length) {
      loNote('类按钮数', label + ' 团本/大秘境按钮 ' + (kindBtns || []).length
        + ' 个，产物里有数据的是 ' + have.length + ' 类（' + have.join('、') + '）');
    } else {
      stats.loKindBtn += kindBtns.length;
      if (onKind) stats.loKindOn++;
    }
  }
  stats.loRenders++;
  // 按 specId 去重。第一版这里写的是 loSpecs++，然后断言「loSpecs === 40」——
  // 结果报 43，因为天赋树要额外画 3 次「切类别」（同一个专精换 raid/冲分/割草）。
  // 数渲染次数和数专精是两件事，混用会让一条本来正确的断言报假错。
  loSeen[String(specId)] = 1;
  stats.loSpecs = Object.keys(loSeen).length;
  if (boxes.length !== 1 || texts.length !== 1 || copies.length !== 1) {
    loNote('块数不对', label + ' 导入串块 ' + boxes.length + ' 个 / 串框 ' + texts.length
      + ' 个 / 复制按钮 ' + copies.length + ' 个，各应正好 1 个');
    return;
  }
  stats.loBoxes++;

  var shown = texts[0].value;

  // 串头里的 specID 必须就是这个专精。导错专精游戏会直接拒绝，
  // 而这种错在界面上完全看不出来 —— 串长、字符集、人数全都正常。
  //
  // **这一条必须排在「字节相等」之前，而且不能提前 return。**
  // 第一版把它放在后面，于是「显示了另一个专精的串」这个变异体先撞上字节不等、
  // 带着 return 走掉 —— specID 这条一次都没执行过。变异测试报的是「串了」：
  // 抓到了，但不是它抓的。被更强的断言遮住的断言，等于没有被证明。
  var hs = headerSpec(shown);
  if (hs !== Number(specId)) {
    loNote('专精不符', label + ' 导入串头里的 specID 是 ' + hs + '，不是本专精 ' + specId);
  } else {
    stats.loSpec++;
  }

  // 核心断言：显示的串必须和数据里那条**一个字节都不差**。
  if (shown !== truth.list[0]) {
    loNote('串不一致', label + ' 显示的导入串和' + (onKind === 'raid' ? ' WCL 团本' : ' rio 大秘境')
      + '数据里的第一条不一致：显示 ' + shown.length + ' 字符，数据 '
      + truth.list[0].length + ' 字符');
  } else {
    stats.loExact++;
    if (onKind === 'raid') stats.loRaid++;
  }
  // 产物的顺序必须已经是「人数降序」。面板不重排（重排会把产物排错这件事藏起来），
  // 所以这里对着独立排过的一份核对 —— 只有 WCL 那份需要，rio 那份是面板现算的。
  if (truth.sorted && truth.list.join('|') !== truth.sorted.join('|')) {
    loNote('产物没排序', label + ' '
      + (onKind === 'raid' ? 'app/wcl-data.js' : 'app/rio-data.js')
      + ' 里这个专精的 loadouts 不是人数降序 —— 面板不重排，所以产物必须自己排好');
  } else {
    stats.loSorted++;
  }
  // 「和下面 SimC 的配置不是同一套」这句和 **SimC 那一块本身**必须同时在、同时不在。
  // 治疗等 11 个专精 SimC 没有配置，那些专精页面上没有配置列表 —— 那句话就指向空白。
  // 用户第 19 轮报过同一类 bug（版面调过之后「上面」变成了「下面」），
  // 所以这里钉死：**方位词和它指的东西必须一起判断**。
  if (boxes.length) {
    var sameWarn = (headTxt || '').indexOf('和下面 SimC 的配置不是同一套') >= 0;
    var hasSimT = !!simTalentTruth(specId);
    if (sameWarn !== hasSimT) {
      loNote('方位词指空', label + ' 导入串标题里'
        + (sameWarn ? '写着「和下面 SimC 的配置不是同一套」，但这个专精没有 SimC 配置'
                    : '没写「和下面 SimC 的配置不是同一套」，但下面确实有 SimC 配置'));
    } else {
      stats.loWarnOk++;
      if (!hasSimT) stats.loNoSim++;
    }
  }
  // 标题里那两个数：「N 名玩家共 M 种」。**必须对着产物的 n / loUniq 验** ——
  // 分母写错了每个数看起来都很合理，只有百分比悄悄偏高。真踩过的形状是
  // 拿「留下来那 30 种的人数之和」当 total：团本奥法 1537 人只留 30 种，
  // 和可能只有几百，于是「占 12%」变成「占 30%」。
  if (headTxt) {
    var wantHead = truth.total + ' 名玩家共 ' + truth.uniq + ' 种';
    if (headTxt.indexOf(wantHead) < 0) {
      loNote('标题人数不对', label + ' 导入串标题里该写「' + wantHead + '」，实际：'
        + headTxt.replace(/s+/g, ' ').slice(0, 70));
    } else {
      stats.loHead++;
    }
  }
  // 只读。用户在框里改一个字符再复制，导进游戏只会说「无效」，
  // 而他会以为是这个面板给错了。
  if (!texts[0].readOnly) {
    loNote('可写', label + ' 导入串框不是只读的');
  }
  // 选串按钮：最多 6 个，有几种就画几个。
  var wantPicks = Math.min(6, truth.list.length);
  if (picks !== wantPicks) {
    loNote('按钮数', label + ' 选串按钮 ' + picks + ' 个，应该是 ' + wantPicks + ' 个');
  } else {
    stats.loPicks += picks;
  }
  // 真点一次「复制」。这一条才是用户实际用到的路径：
  // 前面全都在验 DOM 里的文字，而复制走的是另一个参数。
  copied.length = 0;
  copies[0].click();
  if (copied.length !== 1) {
    loNote('没调用', label + ' 点了复制按钮，copyWithToast 被调用 ' + copied.length + ' 次');
  } else if (copied[0].text !== shown) {
    loNote('复制不符', label + ' 复制出去的串和框里显示的不是同一串');
  } else {
    stats.loCopy++;
  }
}

// SimC 那批天赋配置的真值：产物里 specs[specId].profiles。顺序就是面板的顺序
// （profiles[0] 是默认那份），下标对不上的话「第几份」就错位，而错位看起来像数据错。
var SC = g.AE_SIMC;
var ORDER = DEC.loadOrder();
function simTalentTruth(specId) {
  var sp = SC && SC.specs ? SC.specs[String(specId)] : null;
  return sp && sp.profiles && sp.profiles.length ? sp.profiles : null;
}

/**
 * 独立解一遍这条串，返回验证用的一切：{err} 或 {pts, subs, base, per, sel, off}。
 *
 * 用 tools/decode-talent-string.js 而不是 app/talent-decode.js：那份是面板正在用的，
 * 拿它来验自己等于什么都没验。这里要的是「产物里那两个**声明**字段和串本身一致」，
 * 以及「画出来的那棵树点亮的就是这条串点的节点」—— 面板的配置列表直接显示 p 和 h，
 * 它们错了界面上完全看不出来。
 *
 * 只算**本专精自己的**节点（rec.inSpec）：nodeOrder 是按整个职业排的，
 * 位流里混着同职业别的专精的节点，算进去点数会多 6~23 点（实测）。
 *
 * sel 收的是「位流里选了的」节点（买的 + 系统白给的），因为面板画高亮用的就是这个集合；
 * base / per 只算买的，那是点数的判据。off 是买了但不画在三棵树里的点数
 * （选「哪一条英雄天赋」那一下），三棵树表头相加天生比「共 N 点」少这么多。
 */
function simDecode(specId, s) {
  var out;
  try { out = DEC.decode(s, ORDER); } catch (e) { return { err: '解码抛错：' + e.message }; }
  if (!out || out.err) return { err: '解不开：' + ((out && out.err) || '?') };
  if (out.spec !== Number(specId)) return { err: '串头 specID ' + out.spec + ' != ' + specId };
  var pts = 0, subs = {}, base = 0, per = {}, sel = {}, off = 0, inTree = {};
  var spDef = TREE && TREE.specs ? TREE.specs[String(specId)] : null;
  if (spDef) {
    [].concat(spDef.classNodes || [], spDef.specNodes || [], spDef.heroNodes || [])
      .forEach(function (id) { inTree[id] = 1; });
  }
  out.nodes.forEach(function (n) {
    if (!n.inSpec) return;
    sel[String(n.id)] = 1;
    if (!n.purchased) return;              // 白给的不占点数
    var r = (typeof n.rank === 'number' ? n.rank : 1);
    pts += r;
    if (!inTree[n.id]) off += r;
    var row = TREE && TREE.nodes ? TREE.nodes[n.id] : null;
    var sub = row && row[6];
    if (sub) { subs[sub] = 1; per[sub] = (per[sub] || 0) + r; }
    else base += r;
  });
  return { pts: pts, base: base, per: per, sel: sel, off: off, ver: out.ver, hash: out.hash,
    subs: Object.keys(subs).map(Number).sort(function (a, b) { return a - b; }) };
}
/**
 * 「画出来的树 == 高亮那一份」的判据。lit = 树上点亮节点的 id 集合。
 *
 * 分三段，各有各的判法：
 *   · 职业树 + 专精树：两条英雄树共用，所以必须**完全等于**串里选中的那些；
 *   · 英雄树：面板只画选中的那一条，所以点亮的必须恰好是「某一条子树 ∩ 串」；
 *   · 多余的：既不在这三棵树的节点集合里，又亮着 —— 那是取错了节点集合。
 * 「选中」包含系统白给的节点，点数才只算买的 —— 两个集合不是一回事。
 */
function simTreeLitOk(specId, p, d, lit) {
  var sp = TREE && TREE.specs ? TREE.specs[String(specId)] : null;
  if (!sp) return '天赋树数据里没有这个专精';
  var cs = {}, hero = {};
  (sp.classNodes || []).forEach(function (id) { cs[String(id)] = 1; });
  (sp.specNodes || []).forEach(function (id) { cs[String(id)] = 1; });
  (sp.heroNodes || []).forEach(function (id) { hero[String(id)] = 1; });
  var litCs = [], litHero = [], litElse = [];
  Object.keys(lit).forEach(function (id) {
    if (cs[id]) litCs.push(id);
    else if (hero[id]) litHero.push(id);
    else litElse.push(id);
  });
  if (litElse.length) {
    return '有 ' + litElse.length + ' 个点亮的节点不属于这个专精的三棵树（' + litElse.slice(0, 3).join(',') + '）';
  }
  var wantCs = Object.keys(cs).filter(function (id) { return d.sel[id]; });
  var missCs = wantCs.filter(function (id) { return !lit[id]; });
  var extraCs = litCs.filter(function (id) { return !d.sel[id]; });
  if (missCs.length || extraCs.length) {
    return '职业树 + 专精树点亮 ' + litCs.length + ' 个，串里是 ' + wantCs.length
      + ' 个（少 ' + missCs.length + '，多 ' + extraCs.length + '）';
  }
  var ok = false, want = [];
  (p.h || []).forEach(function (sid) {
    var ids = Object.keys(hero).filter(function (id) {
      var row = TREE.nodes[id];
      return row && row[6] === sid && d.sel[id];
    });
    want.push(sid + ' 条 ' + ids.length + ' 个');
    if (ids.length !== litHero.length) return;
    var all = true;
    ids.forEach(function (id) { if (!lit[id]) all = false; });
    if (all) ok = true;
  });
  if (!ok) return '英雄树点亮 ' + litHero.length + ' 个，和这一份的任一条子树都不吻合（' + want.join('、') + '）';
  return null;
}
/**
 * SimC 天赋这一块。核心判据：**高亮的那一行和画出来的那棵树必须是同一份**。
 * 配置列表是竖着一排按钮，高亮错一行，用户就在照着别的配置点天赋，
 * 而树、点数、名字各自都自洽。所以对着**树上点亮的节点**验（见 simTreeLitOk），
 * 再验给出去的串：框里显示的、复制出去的、产物里的，三者逐字节相同，而且能导进游戏。
 */
function checkSimTalents(label, specId, boxes, btns, subBtns, lit, taVals) {
  var truth = simTalentTruth(specId);
  if (!truth) {
    // 没配置（治疗等 11 个专精）就该整块不画，退回插件那份统计。画个空框比不画更糟。
    if (boxes.length) loNote('sim 空框', label + ' SimC 没有这个专精的配置，却画出了配置列表');
    return;
  }
  stats.simtRenders++;
  simSeen[String(specId)] = 1;
  stats.simtSpecs = Object.keys(simSeen).length;
  var loads = [], copy = [];
  walk(body, function (n) {
    if (!n.classList) return;
    if (n.classList.contains('sim-loadout')) loads.push(n);
    if (n.classList.contains('sim-copy')) copy.push(n);
  });
  if (boxes.length !== 1 || loads.length !== 1 || copy.length !== 1) {
    loNote('sim 块数', label + ' 配置列表 ' + boxes.length + ' 个 / 导入串块 ' + loads.length
      + ' 个 / 复制按钮 ' + copy.length + ' 个，各应正好 1 个');
    return;
  }
  stats.simtBox++;
  if (btns.length !== truth.length) {
    loNote('sim 按钮数', label + ' 配置按钮 ' + btns.length + ' 个，产物里有 ' + truth.length + ' 份');
    return;
  }
  stats.simtBtns += btns.length;
  var on = [];
  btns.forEach(function (b, i) { if (b.classList.contains('on')) on.push(i); });
  if (on.length !== 1) {
    loNote('sim 高亮', label + ' 高亮的配置有 ' + on.length + ' 个，应该正好 1 个');
    return;
  }
  var idx = on[0], p = truth[idx], d = simDecode(specId, p.s);
  // 提示的第一行必须是**这一份的文件名** —— 那是照着能在 SimC 仓库里翻到原文件的东西。
  var tip0 = String((btns[idx].attrs && btns[idx].attrs['data-tip']) || '').split('\n')[0];
  if (tip0 !== p.f) loNote('sim 文件名', label + ' 高亮配置的提示第一行是「' + tip0 + '」，产物里是 ' + p.f);
  else stats.simtName++;
  if (headerSpec(p.s) !== Number(specId)) {
    loNote('sim 专精不符', label + ' 串头里的 specID 是 ' + headerSpec(p.s) + '，不是本专精 ' + specId);
  } else stats.simtSpec++;
  // 产物声明的点数 / 英雄子树 vs 独立解码
  if (d.err) loNote('sim 声明不符', label + ' 第 ' + idx + ' 份：' + d.err);
  else if (d.pts !== p.p || d.subs.join(',') !== (p.h || []).join(',')) {
    loNote('sim 声明不符', label + ' 第 ' + idx + ' 份：声明 ' + p.p + ' 点 / 子树 [' + (p.h || []).join(',')
      + ']，现解出 ' + d.pts + ' 点 / [' + d.subs.join(',') + ']');
  } else stats.simtDecl++;
  // 核心断言：画出来的树点亮的就是**高亮那一份**点的节点。树来源切到「榜上」时画的是那一串
  // （由 tree-src 那一组断言管），所以按 .tree-current 的 data-source 认现在画的是谁。
  var curSrc = null;
  walk(body, function (n) {
    if (!curSrc && n.classList && n.classList.contains('tree-current')) curSrc = n.attrs['data-source'];
  });
  if (curSrc === 'sim') {
    var why = d.err ? d.err : simTreeLitOk(specId, p, d, lit);
    if (why) loNote('sim 树不符', label + ' 高亮的是第 ' + idx + ' 份 ' + p.f + '，但画出来的树和它不一致：' + why);
    else stats.simtTree++;
  }
  // 印出来的点数必须是**游戏里配得出来的**那个数：两条英雄树都点了的串，产物里 p 是两条
  // 加起来的（野德 95），而游戏里一个角色只能选一条 —— 印 95 等于给了一个永远点不出来的点数。
  var ems = [];
  btns[idx].children.forEach(function (c) {
    if (c.classList && c.classList.contains('mt')) c.children.forEach(function (e) { if (e.tagName === 'EM') ems.push(e); });
  });
  var legal = {};
  if (!d.err) (p.h && p.h.length ? p.h : [0]).forEach(function (sid) { legal[d.base + (d.per[sid] || 0)] = 1; });
  var ptsEm = null, shortEm = null;
  ems.forEach(function (e) {
    if (e.classList && e.classList.contains('short')) { shortEm = e; return; }
    if (!ptsEm && !(e.classList && e.classList.contains('hero')) && /^\d+( \/ \d+)* 点$/.test(e.textContent)) ptsEm = e;
  });
  if (Object.keys(legal).length) {
    if (!ptsEm) loNote('sim 点数没画', label + ' 高亮那一行没印点数');
    else {
      var bad2 = ptsEm.textContent.replace(' 点', '').split(' / ').filter(function (x) { return !legal[Number(x)]; });
      if (bad2.length) {
        loNote('sim 点数不合法', label + ' 印的是 ' + ptsEm.textContent + '，游戏里配得出来的只有 '
          + Object.keys(legal).join(' / ') + ' 点（产物声明 ' + p.p + ' 点）');
      } else {
        stats.simtPts++;
        if ((p.h || []).length > 1) stats.simtPtsSplit++;
      }
    }
  }
  // 三棵树的表头相加 + 不画在树里的那一下，必须等于这一份配得出来的点数（同样用 legal 判）。
  // 只在树画的是这一份时判 —— 切到「榜上」时表头是那一串的。
  if (Object.keys(legal).length && curSrc === 'sim') {
    var headSum = 0, heads = 0;
    walk(body, function (n) {
      if (!n.classList || !n.classList.contains('tree-grid-head')) return;
      (n.children || []).forEach(function (c) {
        var mm = /^(\d+) 点$/.exec(String(c.textContent || ''));
        if (mm) { headSum += Number(mm[1]); heads++; }
      });
    });
    if (heads < 2) loNote('树表头点数没画', label + ' 只找到 ' + heads + ' 个树表头点数');
    else if (!legal[headSum + (d.off || 0)]) {
      loNote('树表头点数加不起来', label + ' 三棵树的表头相加是 ' + headSum + ' 点，加上不画在树里的 '
        + (d.off || 0) + ' 点还是配不出 ' + Object.keys(legal).join(' / ') + ' 点');
    } else stats.simtHeadSum++;
  }
  // 没点满的必须说出来（MID2 实测冰霜死骑两份），点满的不许乱说。
  var wantShort = p.p < SC.fullPts;
  if (wantShort) {
    stats.simtShortSeen++;
    if (!shortEm || shortEm.textContent !== '少 ' + (SC.fullPts - p.p) + ' 点') {
      loNote('sim 没点满没说', label + ' 这份只点了 ' + p.p + '/' + SC.fullPts + ' 点，界面上'
        + (shortEm ? '写的是「' + shortEm.textContent + '」' : '没说'));
    } else stats.simtShort++;
  } else if (shortEm) {
    loNote('sim 没点满乱说', label + ' 这份点满了 ' + p.p + ' 点，却写了「' + shortEm.textContent + '」');
  }
  // 两条英雄树都点了的必须给出选择条（游戏里只能选一条）；只有一条的**不该**画 ——
  // 一个只有一个选项的选择器是在骗人。树来源切到「榜上」时英雄条是那一串的，不算在这里。
  if (curSrc === 'sim') {
    if ((p.h || []).length > 1) {
      stats.simtBundle++;
      if (subBtns !== p.h.length) {
        loNote('sim 英雄条', label + ' 这份点了 ' + p.h.length + ' 条英雄天赋，英雄天赋选择条画了 ' + subBtns + ' 个按钮');
      } else stats.simtSubBar++;
    } else if (subBtns) {
      loNote('sim 英雄条', label + ' 这份只有 1 条英雄天赋，却画了 ' + subBtns + ' 个选择按钮');
    }
  }
  // **给出去的串必须就是产物那一条，而且是游戏认的格式。**
  // 框里显示的、真点「复制」交出去的、产物里的，三者逐字节相同；再拿独立解码器验串头：
  // 版本字节 2（别的版本游戏直接拒）、specID 是当前专精（上面 headerSpec 那条）。
  // treeHash **不验**：SimC 的串原样转发，MID2 实测野德那条 treeHash 不是 0 —— 面板没改它，
  // 也就不替它担保。
  if (taVals.indexOf(p.s) < 0) loNote('sim 没给串', label + ' 导入串块的输入框里没有产物那条串');
  var shownS = null;
  walk(loads[0], function (n) { if (n.tagName === 'TEXTAREA' || n.tagName === 'INPUT') shownS = n.value; });
  copied.length = 0;
  copy[0].click();
  if (copied.length !== 1) loNote('sim 没调用', label + ' 点了 SimC 的复制按钮，copyWithToast 被调用 ' + copied.length + ' 次');
  else if (copied[0].text !== shownS || shownS !== p.s) {
    loNote('sim 复制不符', label + ' 复制出去的串、框里显示的串、产物里的串不是同一条');
  } else stats.simtCopyClick++;
  if (!d.err) {
    if (d.ver !== 2) loNote('sim 串版本', label + ' 串的版本字节是 ' + d.ver + '，游戏只认 2');
    else stats.simtGameOk++;
  }
}


// 天赋树的渲染检查。以前这里只 renders++、什么都不断言 —— 那是假绿：
// 树画不出来照样通过。现在每个专精都画一遍，并数出节点 / 连线 / 中文名。
function checkTalents(label, specId) {
  // specId 必传：下面要拿它去 AE_RIO 里取「这个专精真实的导入串集合」。
  // 漏传的话每个专精都会取到 undefined，导入串那一组断言会全部静默跳过 ——
  // 而「因为取不到数据所以跳过」报成通过，正是这个项目反复踩的假绿。
  // 所以少参数硬抛：这是调用者的 bug，不是一种数据情况。
  if (specId === undefined) throw new Error('checkTalents(label, specId)：specId 必传');
  stats.renders++;
  stats.trenders++;
  var nodes = 0, grids = 0, seen = {}, dup = 0, canvases = [];
  var loBoxes = [], loTexts = [], loCopies = [], loPicks = 0, loKindBtns = [];
  var loHead = '';
  // SimC 那一块的元素。类名故意和 lo-* 分开（.sim-builds / .simb / .sim-loadout），
  // 共用的话「导入串块正好 1 个」那条断言会被两块互相喂饱。
  // simLit 是树上点亮的节点，checkSimTalents 拿它验「画的树就是高亮那一份」；
  // taVals 是页面上所有输入框里的字，用来验「给出去的串就是产物那一条」。
  var simBoxes = [], simBtns = [], simSubBtns = 0, simLit = {}, taVals = [];
  // 第 18 轮定的顺序：raider.io 那一块在最上面，SimC 在下面；三棵树里
  // 英雄天赋那一列在最前。**顺序是用户明确要求的东西，所以要有断言钉住** ——
  // 光有「这些块都画出来了」的断言，把 appendChild 挪个位置照样全绿。
  // walk() 是深度优先前序，所以 push 的次序就是文档次序。
  var order = [], colOrder = [];
  walk(body, function (n) {
    checkA11y(n, label);
    if (n.tagName === 'TEXTAREA' || n.tagName === 'INPUT') taVals.push(n.value);
    if (!n.classList) return;
    if (n.classList.contains('tree-canvas')) canvases.push(n);
    if (n.classList.contains('bis-loadout')) { loBoxes.push(n); order.push('rio'); }
    if (n.classList.contains('sim-builds')) order.push('sim');
    // 树列的表头。第一个子元素是 <b>，里面是「英雄天赋：…」/「职业天赋」/「专精天赋」。
    if (n.classList.contains('tree-grid-head')) {
      var hb = n.children[0];
      if (hb && hb.textContent) colOrder.push(hb.textContent.split('：')[0]);
    }
    // .lo-head 两块都在用（SimC 那块带 sim-lo-head），这里只要 rio 那块的。
    if (n.classList.contains('lo-head') && !n.classList.contains('sim-lo-head')) {
      loHead = n.textContent;
    }
    if (n.classList.contains('lo-text')) loTexts.push(n);
    if (n.classList.contains('lo-copy')) loCopies.push(n);
    if (n.classList.contains('lo-pick')) loPicks += n.children.length;
    // 团本 / 大秘境那一排（第 20 轮）。**按 .lo-kind 认，不按 .lo-pick** ——
    // 两排都是按钮，共用一个类的话「选串按钮 6 个」那条断言会被多喂两个。
    if (n.classList.contains('lo-kind')) {
      n.children.forEach(function (c) { loKindBtns.push(c); });
    }
    if (n.classList.contains('sim-builds')) simBoxes.push(n);
    // 注意：order 里 'sim' 是在上面那个 bis-loadout 分支旁边 push 的，
    // 和这里分开写 —— 两个 if 都命中同一个节点是不可能的（类名互斥），
    // 但放在一起会让「谁先 push」依赖于 if 的书写顺序，而不是文档顺序。
    if (n.classList.contains('simb')) simBtns.push(n);
    // 英雄天赋选择条。.tree-pick 这个类名两条路都在用（插件那条是「套路」），
    // 所以按 .lb 的字认，不按类名 —— 认错的话「只有一条也画了选择条」那条
    // 断言会被插件那条路的按钮喂饱，永远不报。
    if (n.classList.contains('tree-pick')) {
      var lb = null;
      n.children.forEach(function (c) {
        if (c.classList && c.classList.contains('lb')) lb = c;
      });
      if (lb && lb.textContent === '英雄天赋') simSubBtns += n.children.length - 1;
    }
    if (n.classList.contains('tree-grid')) { grids++; stats.tgrids++; }
    if (n.classList.contains('tree-edge')) {
      stats.tedges++;
      if (n.classList.contains('on')) stats.tedgeOn++;
    }
    if (n.classList.contains('tnode')) {
      nodes++;
      stats.tnodes++;
      if (n.classList.contains('on')) stats.tnodeOn++;
      if (n.classList.contains('on') && n.attrs['data-node']) {
        simLit[String(n.attrs['data-node'])] = 1;
      }
      // 三棵树的节点必须互不相同。这一条比数总数强：把专精树错画成职业树时
      // 总数依然合理（职业树画了两遍），但节点 ID 会重复。
      var nid = n.attrs['data-node'];
      if (!nid) { stats.tnoId++; }
      else if (seen[nid]) { dup++; stats.tdup++; }
      else seen[nid] = 1;
      // ---- 悬停提示里的「天赋原本说明」（第 19 轮用户要的）----
      //
      // 判据是**逐字节等于 app/talent-desc.js 里那一条**，不是「有汉字就算」：
      // 说明取错了 entry（二选一节点两条说明摆反）用「有汉字」是查不出来的，
      // 而那正是最容易发生、又最看不出来的错 —— 界面上两段都是通顺的中文。
      var upD = TREE && TREE.nodes ? TREE.nodes[nid] : null;
      var DESC = g.AE_TALENT_DESC;
      if (upD && DESC && DESC.desc) {
        var tipTxt = n.attrs['data-tip'] || '';
        (upD[5] || []).forEach(function (e) {
          var want = DESC.desc[e[3]];
          if (!want) { stats.tDescNo++; return; }
          // 面板把说明按行缩进两格挂在名字下面，所以按行找。
          var lines = want.split('\n').filter(Boolean).map(function (l) { return '　　' + l; });
          var ok = lines.every(function (l) { return tipTxt.indexOf(l) >= 0; });
          if (ok) stats.tDesc++;
          else {
            stats.tDescBad++;
            if (stats.tDescBad < 4) {
              problems.push(label + ' 节点 ' + nid + ' 的提示里没有这个天赋的说明'
                + '（spellId ' + e[3] + '，产物里 ' + want.length + ' 字）'
                + ' —— 说明是原样挂上去的，不许加工');
            }
          }
        });
      }
      // 节点上必须有中文名。图标是认天赋的主要手段，但名字是唯一的**文字**信息，
      // 读屏软件和「图挂了」的情况都只剩它。
      var nm = null, ico = null;
      n.children.forEach(function (c) {
        if (c.classList && c.classList.contains('nm')) nm = c;
        if (c.tagName === 'IMG') ico = c;
      });
      if (!nm || !nm.textContent) {
        stats.tnoName++;
        if (stats.tnoName < 4) problems.push(label + ' 天赋节点没有名字');
      } else if (!/[\u4e00-\u9fff]/.test(nm.textContent)) {
        stats.tnoCJK++;
        if (stats.tnoCJK < 4) problems.push(label + ' 天赋节点名不是中文：' + nm.textContent);
      }
      // 天赋图标。这一段是新加的，而且是**被一次假通过逼出来的**：
      // 图标接上之后套件依然报「7947 个图标」——和一张天赋图都没有的时候一模一样。
      // 原因是天赋渲染走 checkTalents，而数图标的代码只在 checkRender 里。
      // 4304 个节点、2094 张图，全都没有被任何断言看过一眼。
      if (!ico) {
        stats.tnoIco++;
        if (stats.tnoIco < 4) problems.push(label + ' 天赋节点 ' + nid + ' 没有图标');
      } else {
        stats.tico++;
        // 懒加载。**这一条差点又栽在同一个坑里**：上面那段注释说的就是
        // 「数图标的代码只在 checkRender 里，而天赋树走 checkTalents」——
        // 我加完 loading="lazy" 的断言后，把天赋树那 99 个图标的属性去掉，
        // 摘要里的 19398 一个都没变，套件全绿。同一个形状，第二次。
        if ((ico.attrs && ico.attrs.loading) === 'lazy') stats.ticoLazy++;
        else {
          stats.ticoEager++;
          if (stats.ticoEager < 3) {
            problems.push(label + ' 天赋图标没写 loading="lazy" —— 一棵树 ~33 个，'
              + '三棵 99 个，而面板每点一下都整块重建');
          }
        }
        var isrc = ico.attrs.src || ico.src || '';
        if (isrc.indexOf('app/talent-icons/') !== 0) {
          stats.ticoBad++;
          if (stats.ticoBad < 4) {
            problems.push(label + ' 天赋图标 src 不指向 app/talent-icons/：' + isrc);
          }
        } else if (!fs.existsSync(path.join(ROOT, isrc))) {
          missingFiles[isrc] = 1;
        }
        // 图标必须有 class=ti，否则 style.css 里那一整段（24px、压暗未点的）全落空。
        // 实测漏过一次：img 建出来了、图也在，但没设 class，样式一条没生效。
        if (!ico.classList || !ico.classList.contains('ti')) {
          stats.ticoNoCls++;
          if (stats.ticoNoCls < 4) {
            problems.push(label + ' 天赋图标没有 class=ti，style.css 那段样式会全部落空');
          }
        }
        // **图标和名字必须来自同一个 entry。**
        //
        // 上面三条加起来仍然抓不住「图标取错了 entry」：把 icons[ent[2]] 写成
        // icons[ent[1]]（名字下标当图标下标用）照样得到一个存在的图标名、
        // 存在的文件、正确的路径前缀 —— 三条全过，而二选一节点会图文不符。
        // 所以这里对着上游数据反查：显示的名字属于哪个 entry，图标就必须是
        // 那个 entry 的图标。同名 entry 存在（同一天赋的多个 rank），所以
        // 收成集合再判定。
        var up2 = TREE && TREE.nodes ? TREE.nodes[nid] : null;
        if (up2 && nm && nm.textContent) {
          var wantIco = {}, nWant = 0;
          (up2[5] || []).forEach(function (e) {
            if (TREE.names[e[1]] !== nm.textContent) return;
            var inm = TREE.icons[e[2]];
            if (inm) { wantIco[inm] = 1; nWant++; }
          });
          var got = isrc.replace(/^.*\//, '').replace(/\.jpg$/, '');
          if (nWant && !wantIco[got]) {
            stats.ticoMismatch++;
            if (stats.ticoMismatch < 4) {
              problems.push(label + ' 节点 ' + nid + ' 图文不符：名字「' + nm.textContent
                + '」对应图标 ' + Object.keys(wantIco).join('/') + '，画出来的却是 ' + got);
            }
          } else if (nWant) {
            stats.ticoPair++;
          }
        }
      }
    }
    // 英雄天赋名。talent-data.js 里存的是英文（那份数据来自插件），面板要靠
    // 子树表的「英文名 → 中文名」翻过来。这里盯的就是那一跳有没有生效。
    if (n.classList.contains('hero')) {
      n.children.forEach(function (c) {
        if (c.tagName !== 'B') return;
        stats.thero++;
        if (!/[\u4e00-\u9fff]/.test(c.textContent)) {
          stats.theroEn++;
          if (stats.theroEn < 4) problems.push(label + ' 英雄天赋名还是英文：' + c.textContent);
        }
      });
    }
    // 点数徽章，形如「2/3」
    if (n.classList.contains('r') && n.parentNode
        && n.parentNode.classList && n.parentNode.classList.contains('tnode')) {
      stats.tRank++;
      if (!/^\d+\/\d+$/.test(n.textContent)) {
        stats.tRankBad++;
        if (stats.tRankBad < 4) problems.push(label + ' 点数徽章文字不对：' + n.textContent);
      }
    }
  });
  checkLoadouts(label, specId, loBoxes, loTexts, loCopies, loPicks, loKindBtns, loHead);
  checkSimTalents(label, specId, simBoxes, simBtns, simSubBtns, simLit, taVals);

  // ---- 第 18 轮的顺序。两条断言，各自有独立的失败方式。
  //
  // ① raider.io 在 SimC 上面。只在**两块都画了**的时候判 ——
  //    插件那条路上 SimC 那块压根不存在，拿「rio 必须是第 0 个」去判会
  //    把它误报（那条路上 rio 前面还有一段解释文字，但那不是这两块之一）。
  if (order.indexOf('rio') >= 0 && order.indexOf('sim') >= 0) {
    stats.ordChecked++;
    if (order.indexOf('rio') > order.indexOf('sim')) {
      loNote('顺序 rio', label + ' raider.io 那一块画在 SimC 下面了（第 18 轮定的是放最上面）');
    } else stats.ordRio++;
  }
  // ② 英雄天赋那一列在最前。三棵树的表头次序必须是 英雄 → 职业 → 专精。
  //    这一条和「画出 3 棵树」是两件事：挪个顺序那条照样过。
  if (colOrder.length === 3) {
    stats.ordCols++;
    if (colOrder[0] !== '英雄天赋') {
      loNote('顺序 英雄树', label + ' 三棵树的次序是 ' + colOrder.join(' → ')
        + '，英雄天赋该在最前（第 18 轮定的）');
    } else stats.ordHero++;
  }

  // 一个专精应该画出三棵（职业 / 专精 / 英雄）
  if (grids !== 3) problems.push(label + ' 只画出 ' + grids + ' 棵树，应该是 3 棵');
  if (!nodes) { stats.tEmpty++; problems.push(label + ' 一个天赋节点都没画出来'); }

  // 几何检查。上面那些断言全是「DOM 里有没有这个元素」，而这棵树的位置完全靠
  // CSS 绝对定位 —— 方块两两叠在一起、或者跑到画布外面，上面每一条都照样通过。
  // 桩不算布局，所以按 CSS 的尺寸自己算。
  canvases.forEach(function (cv) {
    var boxes = [];
    cv.children.forEach(function (c) {
      if (!c.classList || !c.classList.contains('tnode')) return;
      var up = TREE && TREE.nodes ? TREE.nodes[c.attrs['data-node']] : null;
      boxes.push({
        id: c.attrs['data-node'],
        x: parseFloat(c.style.left), y: parseFloat(c.style.top),
        ux: up ? up[0] : null, uy: up ? up[1] : null
      });
    });
    var cw = parseFloat(cv.style.width), chh = parseFloat(cv.style.height);
    // 列数 / 行数。这一条抓的是「不重叠但摆错」：把聚类容差调成 0，
    // 相差 10 的近重复坐标会各占一列，树被拉宽、节点整体错位 —— 没有重叠、
    // 没有溢出，前面每条断言都过。本机实测最多 9 列 × 11 行（容差 50~250 都一样）。
    var xs = {}, ys = {};
    boxes.forEach(function (b) { xs[b.x] = 1; ys[b.y] = 1; });
    var nc = Object.keys(xs).length, nr2 = Object.keys(ys).length;
    if (nc > stats.tmaxCol) stats.tmaxCol = nc;
    if (nr2 > stats.tmaxRow) stats.tmaxRow = nr2;

    // 聚类契约，直接对着**上游坐标**验，而不是重复面板的算法：
    // 上游相差 ≤ GRID_TOL 的两个节点必须落在同一列（行），相差更多必须落在不同列。
    // 这一条才是把容差调成 0 时唯一会破的东西 —— 那时相差 10 的近重复坐标
    // 各占一列，既不重叠也不溢出，列数也还是 ≤ 9，前面每条断言都过。
    // 本机实测同一棵树内相邻坐标差要么 ≤20 要么 ≥250，所以不存在
    // 「链式合并」的歧义（100 + 100 + 100 连成一片）。
    for (var gi = 0; gi < boxes.length; gi++) {
      for (var gj = gi + 1; gj < boxes.length; gj++) {
        var p = boxes[gi], q = boxes[gj];
        if (p.ux === null || q.ux === null) continue;
        [['列', Math.abs(p.ux - q.ux), p.x === q.x],
         ['行', Math.abs(p.uy - q.uy), p.y === q.y]].forEach(function (t) {
          var gap = t[1], same = t[2];
          if (gap <= GRID_TOL_EXPECT && !same) {
            stats.tCluster++;
            if (stats.tCluster < 4) {
              problems.push(label + ' 节点 ' + p.id + ' 和 ' + q.id + ' 上游' + t[0]
                + '坐标只差 ' + gap + '，却被摆进了不同' + t[0]);
            }
          } else if (gap > GRID_TOL_EXPECT && same) {
            stats.tCluster++;
            if (stats.tCluster < 4) {
              problems.push(label + ' 节点 ' + p.id + ' 和 ' + q.id + ' 上游' + t[0]
                + '坐标差 ' + gap + '，却被摆进了同一' + t[0]);
            }
          }
        });
      }
    }
    boxes.forEach(function (b) {
      stats.tgeo++;
      if (!(b.x >= 0 && b.y >= 0 && b.x + NODE_BOX.w <= cw && b.y + NODE_BOX.h <= chh)) {
        stats.tSpill++;
        if (stats.tSpill < 4) {
          problems.push(label + ' 节点 ' + b.id + ' 超出画布：' + b.x + ',' + b.y
            + ' 方块 ' + NODE_BOX.w + '×' + NODE_BOX.h + '，画布 ' + cw + '×' + chh);
        }
      }
    });
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) {
        var a = boxes[i], b2 = boxes[j];
        if (Math.abs(a.x - b2.x) < NODE_BOX.w && Math.abs(a.y - b2.y) < NODE_BOX.h) {
          stats.tOverlap++;
          if (stats.tOverlap < 4) {
            problems.push(label + ' 节点 ' + a.id + ' 和 ' + b2.id + ' 重叠');
          }
        }
      }
    }
  });
  if (dup && stats.tdup <= 3) {
    problems.push(label + ' 有 ' + dup + ' 个节点被画了两次（哪棵树取错了节点集合？）');
  }
}

// 每个专精都画一次天赋树（团本类别）
specKeys.forEach(function (key) {
  settings.bisTab = 'talents';
  settings.bisSpec = key;
  settings.bisTalentCat = 'raid';
  body.children.length = 0;
  load('app/bis.js');
  g.AE.openBis();
  stats.tspecs++;
  checkTalents('天赋 ' + key, B.specs[key].specId);
});

// 三个类别各画一次，确认切类别不会崩
['raid', 'mplusHigh', 'mplusFarm'].forEach(function (cat) {
  settings.bisTab = 'talents';
  settings.bisSpec = specKeys[0];
  settings.bisTalentCat = cat;
  body.children.length = 0;
  load('app/bis.js');
  g.AE.openBis();
  checkTalents('天赋 ' + specKeys[0] + '/' + cat, B.specs[specKeys[0]].specId);
});

// ---- SimC 天赋页的两个开关：换配置 / 换英雄树 -----------------------------
//
// 上面那 43 次渲染**一次都没按过它们**：state.simIdx / simSub 都不持久化，
// 每次 load 都从「第 0 份 第 0 条英雄树」开始。于是「换配置」这条路
// 在测试里从来没被走过，而套件照样全绿 —— 又一次「没跑报成通过」。
// 所以这里真去点：点完重新走一遍 checkTalents，让上面每条断言在**换过之后**
// 的界面上再验一次（尤其是「高亮那一行和显示的串是同一套」）。
function findBtns(cls) {
  var out = [];
  walk(body, function (n) {
    if (n.classList && n.classList.contains(cls)) out.push(n);
  });
  return out;
}
function findSubPickBtns() {
  var out = [];
  walk(body, function (n) {
    if (!n.classList || !n.classList.contains('tree-pick')) return;
    var lb = null;
    n.children.forEach(function (c) {
      if (c.classList && c.classList.contains('lb')) lb = c;
    });
    if (lb && lb.textContent === '英雄天赋') {
      n.children.forEach(function (c) { if (c !== lb) out.push(c); });
    }
  });
  return out;
}
function findKindBtn(text) {
  var out = null;
  walk(body, function (n) {
    if (out || !n.classList || !n.classList.contains('seg')) return;
    n.children.forEach(function (c) {
      if (!out && c.textContent === text && !c.classList.contains('on')) out = c;
    });
  });
  return out;
}
specKeys.forEach(function (key) {
  var specId = B.specs[key].specId;
  settings.bisTab = 'talents';
  settings.bisSpec = key;
  settings.bisTalentCat = 'raid';
  // **每个专精都从默认状态开始**：清掉导入串那一块的类型（它是持久化的）——
  // 不清的话第一个专精点完团本，后面 39 个进来就已经是团本了，
  // 「点一下团本」这条路只被走过 1 次。
  settings.bisLoKind = '';
  body.children.length = 0;
  load('app/bis.js');
  g.AE.openBis();
  // 没有 SimC 配置的专精（插件兜底那条路）跳过 SimC 的两个开关，
  // 但下面「榜上热门天赋串」的团本开关照样要点 —— 那一块两条路上都有。
  var simPath = !!simTalentTruth(specId) && findBtns('sim-builds').length > 0;

  // ---- 点一下会不会把用户的位置弄丢（第 16 轮的两条友好度修复）----
  //
  // render() 是整块重建（textContent = '' 再画一遍），所以两件东西天然会丢：
  //   · **滚动位置**：#bis-body 是滚动容器，清空内容 = scrollTop 回 0。
  //     面板很长（三棵天赋树 + 两块说明），用户在底下点一个方案按钮，
  //     视线被扔回顶部，然后得重新滚下来找刚点的那个。
  //   · **折叠块的展开状态**：展开「各首领说明」看到一半，点一下别的方案就合上了。
  //     用户点那一下要的只是换方案，没让面板把他打开的东西收起来。
  //
  // 这两条都**只在真去点一下之后**才看得出来，所以断言必须放在这里。
  (function checkPositionKept() {
    var bs0 = findBtns('simb');
    if (bs0.length < 2) return;             // 只有一份，点不出重建

    // 先把一个折叠块展开，并把滚动位置挪到中间
    var sec = null;
    walk(body, function (n) {
      if (!sec && n.tagName === 'DETAILS') sec = n;
    });
    if (sec) {
      sec.setAttribute('open', 'open');
      // 桩不会自己发 toggle，手动发一次 —— 浏览器里是用户点 <summary> 时发的
      if (sec.dispatch) sec.dispatch('toggle');
    }
    body.scrollTop = 500;

    findBtns('simb')[1].click();

    stats.posChecked++;
    if (body.scrollTop !== 500) {
      problems.push('天赋 ' + key + ' 点了一下方案，滚动位置从 500 变成 '
        + body.scrollTop + ' —— 面板重建时没还原，用户会被扔回顶部');
    } else {
      stats.posScroll++;
    }
    if (sec) {
      var still = null;
      walk(body, function (n) {
        if (!still && n.tagName === 'DETAILS') still = n;
      });
      if (!still) {
        problems.push('天赋 ' + key + ' 重建后一个折叠块都没了');
      } else if (still.getAttribute('open') == null) {
        problems.push('天赋 ' + key + ' 展开的折叠块在点了一下方案之后合上了'
          + ' —— 展开状态没跨重建保住');
      } else {
        stats.posSec++;
      }
      /*
       * **反方向也要验：收起来的块不许自己弹回去。**
       * 只验「展开状态保住」抓不到这个 bug：默认写死 `open` 的块（插件兜底那条路上的
       * 「热门英雄天赋」）收起来之后，下一次重建又被硬置成打开，因为记状态那段
       * 只有「记着是开的就打开」，没有反向的 removeAttribute，而关掉时还 delete 了键。
       */
      still.removeAttribute('open');
      if (still.dispatch) still.dispatch('toggle');
      findBtns('simb')[0].click();
      var again = null;
      walk(body, function (n) {
        if (!again && n.tagName === 'DETAILS') again = n;
      });
      if (!again) {
        problems.push('天赋 ' + key + ' 收起折叠块之后重建，块没了');
      } else if (again.getAttribute('open') != null) {
        problems.push('天赋 ' + key + ' 收起来的折叠块在点了一下方案之后又自己打开了'
          + ' —— 「收起来」这个动作活不过一次重建');
      } else {
        stats.posSecShut++;
      }
    }
    // 复位，别影响后面那些断言
    body.scrollTop = 0;
  })();

  // 换配置：点第 2 份。只有 1 份的跳过（没有第 2 份可点，不是缺陷）。
  //
  // 点完必须**确认高亮真的挪过去了**。只点不看的话「按钮的 onClick 写死成
  // state.simIdx = 0」这种接线错完全测不出来：界面自洽（高亮第 0 份、串是第 0 份），
  // 只是按钮不管用 —— 而按钮不管用正是用户第一眼就会撞上的东西。
  var bs = findBtns('simb');
  if (bs.length > 1) {
    bs[1].click();
    var on2 = -1;
    findBtns('simb').forEach(function (b, i) { if (b.classList.contains('on')) on2 = i; });
    if (on2 !== 1) {
      loNote('sim 换配置没生效', '天赋 ' + key + ' 点了第 2 份，高亮却在第 ' + on2 + ' 份');
    } else {
      stats.simtBuildSw++;
    }
    checkTalents('天赋 ' + key + '/第2份', specId);
    findBtns('simb')[0].click();          // 回到默认那份，下面的英雄树开关在它上面点
  }
  // 换英雄树：串里两条英雄树都点了的才有这一条。
  var subs = simPath ? findSubPickBtns() : [];
  if (subs.length > 1) {
    subs[1].click();
    var sub2 = findSubPickBtns();
    if (!sub2[1] || !sub2[1].classList.contains('on')) {
      loNote('sim 换英雄树没生效', '天赋 ' + key + ' 点了第 2 条英雄天赋，它没有变成高亮');
    } else {
      stats.simtSubSw++;
    }
    checkTalents('天赋 ' + key + '/换英雄树', specId);
  }

  // ---- 第 20 轮：「榜上热门天赋串」的团本 / 大秘境开关 ----
  //
  // 换的是导入串那一块的数据来源（大秘境 = raider.io，团本 = Warcraft Logs）。
  // 按容器类名（.lo-kind）找 —— 页面上别处也有叫「团本」的按钮（插件统计那一排），
  // 混在一起找的话点到的是哪一个全看 walk 的顺序。
  var lk = null;
  walk(body, function (n) {
    if (lk || !n.classList || !n.classList.contains('lo-kind')) return;
    n.children.forEach(function (c) {
      if (!lk && /团本/.test(c.textContent) && !c.classList.contains('on')) lk = c;
    });
  });
  if (lk) {
    // **先挑一个非 #1 的串再换类。** 不这么做的话 state.loadout 本来就是 0，
    // 「换类要回到 #1」那条代码是死的也测不出来 —— 变异测试里那个变异体
    // 一开始就是「漏」，因为测试从没让下标离开过 0。
    var pickBtns = [];
    walk(body, function (n) {
      if (!n.classList || !n.classList.contains('lo-pick')) return;
      n.children.forEach(function (c) { pickBtns.push(c); });
    });
    var movedTo = -1;
    if (pickBtns.length > 2) { pickBtns[2].click(); movedTo = 2; }
    lk.click();
    // 点完必须真的换过去：那一排里高亮的应该是「团本」了。
    var onTxt = '';
    walk(body, function (n) {
      if (!n.classList || !n.classList.contains('lo-kind')) return;
      n.children.forEach(function (c) {
        if (c.classList && c.classList.contains('on')) onTxt = c.textContent;
      });
    });
    if (!/团本/.test(onTxt)) {
      loNote('lo 换类没生效', '天赋 ' + key + ' 点了导入串那块的「团本」，高亮却是：' + onTxt);
    } else {
      stats.loKindSw++;
    }
    // 换类之后必须回到 #1。换过去那一类的串种类数可能更少，留着旧下标要么
    // 越界被夹回 0（看起来没坏），要么**不越界** —— 那时显示的是新类里的
    // 第 3 条，而用户以为自己点的是「换个类看最热门那条」。
    if (movedTo >= 0) {
      var onPick = -1;
      walk(body, function (n) {
        if (!n.classList || !n.classList.contains('lo-pick')) return;
        n.children.forEach(function (c, ci) {
          if (c.classList && c.classList.contains('on')) onPick = ci;
        });
      });
      if (onPick !== 0) {
        loNote('换类没回 #1', '天赋 ' + key + ' 换类前选的是 #' + (movedTo + 1)
          + '，换完高亮还在 #' + (onPick + 1) + ' —— 换类应该回到最热门那条');
      } else {
        stats.loResetIdx++;
      }
    }
    // 持久化：它是两个固定的字，一个人在准备打团本，每次打开都该落在团本那一份。
    if (settings.bisLoKind !== 'raid') {
      loNote('lo 类型没存', '天赋 ' + key + ' 点了导入串的「团本」，'
        + '设置里 bisLoKind 还是「' + settings.bisLoKind + '」');
    } else {
      stats.loKindSaved++;
    }
    // **换完之后整组断言再走一遍。** checkLoadouts 会按「界面上高亮哪一类」
    // 挑真值，所以这一遍验的是「高亮团本时显示的就是团本那份数据」——
    // 那是分两类之后新出现的、界面完全自洽的失败方式。
    checkTalents('天赋 ' + key + '/串团本', specId);
  }
});

var IC = g.AE_ITEM_ICONS || {};
var gearIds = Object.keys(B.items);
var haveIcon = gearIds.filter(function (id) { return IC[id]; });
var haveFile = haveIcon.filter(function (id) {
  return fs.existsSync(path.join(ROOT, 'app', 'icons', IC[id] + '.jpg'));
});

var mf = Object.keys(missingFiles);
if (stats.renders < 80) problems.push('渲染次数只有 ' + stats.renders + '，harness 没跑起来');
if (stats.imgs < 5000) problems.push('<img> 只有 ' + stats.imgs + ' 个，图标没接上');
if (stats.ph > 0) problems.push('出现 ' + stats.ph + ' 个占位块，说明有 itemId 查不到图标');
if (stats.imgEager > 0) {
  problems.push(stats.imgEager + ' 个 <img> 没写 loading="lazy" —— '
    + '面板每点一下都整块重建，不懒加载的话每次都要把全部图标重新处理一遍');
}
if (stats.imgLazy !== stats.imgs) {
  problems.push('懒加载 ' + stats.imgLazy + ' / 图标 ' + stats.imgs + '，不是全覆盖');
}
if (stats.badSrc > 0) problems.push(stats.badSrc + ' 个 <img> 没有 src');
if (mf.length) problems.push('引用了 ' + mf.length + ' 个不存在的图标文件：' + mf.slice(0, 5).join(', '));
if (haveIcon.length !== gearIds.length) {
  problems.push('装备图标名覆盖 ' + haveIcon.length + '/' + gearIds.length + '，不是全覆盖');
}
if (haveFile.length !== gearIds.length) {
  problems.push('装备图标文件覆盖 ' + haveFile.length + '/' + gearIds.length + '，不是全覆盖');
}
// 轨道徽章：数据里有 3601 行能解出轨道，但「数据对」不等于「画出来了」。
// 轨道只出自 GearInsight 那份实测：模拟配装视角里是借实测装等的那几格（轨道跟着那次测量走，
// SimC 配置自己的装等不配轨道 —— 不同测量的数字不拼在一起），再加首屏兜底那 3 次。
// 所以只要求量级对（实测 134）。
if (stats.trk < 50) problems.push('轨道徽章只画了 ' + stats.trk + ' 个，太少');
if (stats.trkBad > 0) {
  problems.push(stats.trkBad + ' 个轨道徽章文字不合格式，例如 ' + stats.trkSample);
}
// 徽章：每个部位组头上**恰好一个**，两种加起来必须等于部位组数。
// 写成相等而不是「> 0」—— 「至少有一个」那种断言在只有一个部位画出来的时候也能过。
// 两种分开数再求和，才能同时抓住「rio 视角忘了给徽章」和「BisData 视角多给一个」。
if (stats.cov + stats.sn + stats.sim !== stats.slots) {
  problems.push('覆盖率徽章 ' + stats.cov + ' + 样本量徽章 ' + stats.sn
    + ' + SimC 徽章 ' + stats.sim + ' = ' + (stats.cov + stats.sn + stats.sim)
    + '，部位组 ' + stats.slots + ' 个，不一一对应');
}
if (stats.covBad > 0) problems.push(stats.covBad + ' 个覆盖率徽章文字不合格式');
if (stats.snBad > 0) problems.push(stats.snBad + ' 个样本量徽章文字不合格式');
if (stats.simBad > 0) problems.push(stats.simBad + ' 个 SimC 徽章文字不合格式');
// 空转守卫：三种徽章都必须真的出现过。少了一种说明那条路没被画到，
// 而上面那条求和等式在「某条路整个缺席」时照样成立 —— 加视角那一轮
// 就是这么假绿的（渲染次数一个都没涨，套件却全绿）。
if (stats.sim < 1) problems.push('一个 SimC 徽章都没画出来，「模拟配装」视角没被渲染');
if (stats.sn < 1) problems.push('一个样本量徽章都没画出来，「实战分布」视角没被渲染');
// 覆盖率徽章现在**只**出自 GearInsight 兜底那条路（第 16 轮撤掉了那两个视角按钮，
// 但 SimC 懒加载没到时还得靠它画）。所以这一条不再是「BisData 视角没渲染」，
// 而是「首屏兜底没被走到」—— 全部来自 checkFirstPaintFallback 那 3 次兜底渲染。
if (stats.cov < 1) {
  problems.push('一个覆盖率徽章都没画出来 —— GearInsight 兜底那条路没被渲染'
    + '（它只在 SimC 数据还没加载时出现，见 checkFirstPaintFallback）');
}
// 「模拟配装」那一组：有配置的专精和没配置的专精都必须真的走到过 —— 只走一边的话，
// 「没配置时退到实战分布并说明」那半条在空集合上恒真。
var SIM_SPECS = specKeys.filter(hasSim).length;
if (stats.simHave !== SIM_SPECS || stats.simNone !== specKeys.length - SIM_SPECS) {
  problems.push('模拟配装：有配置的专精验了 ' + stats.simHave + '/' + SIM_SPECS + '，没配置的验了 '
    + stats.simNone + '/' + (specKeys.length - SIM_SPECS));
}
if (SIM_SPECS < 20 || stats.simNone < 5) {
  problems.push('模拟配装：有 SimC 配置的专精 ' + SIM_SPECS + ' 个、没有的 ' + stats.simNone
    + ' 个（MID2 实测 29 / 11）—— 产物或取数路径不对');
}
if (stats.slots < 1000) problems.push('只画了 ' + stats.slots + ' 个部位组，太少');

// ---- 英雄天赋的中文名：树后到也得能补上（第 20 轮的真 bug）
//
// app/talent-tree.js 是**懒加载**的，而英雄天赋的中文名只在它的子树表里。
// heroName() 原来是「第一次调用就把表建好并永久缓存」—— 装备页首屏那一刻树
// 还没到，表建成空的 {} 然后被缓存住，这一整个会话里都返回英文。
// 症状：装备页写「英雄天赋 San'layn」，天赋页写「萨莱因」，同一个东西两个名字。
//
// 这一条**必须模拟懒加载的先后**才能抓到 —— 上面所有渲染都是树已经在的状态，
// 那时表建得好好的，断言再多也照样全绿。
(function () {
  var keep = g.AE_TALENT_TREE;
  if (!keep) { problems.push('英雄天赋中文名那条：树没加载，这一组在验空气'); return; }
  var key = null;
  Object.keys(B.specs).forEach(function (k) {
    if (!key && B.specs[k].hero) key = k;
  });
  if (!key) { problems.push('英雄天赋中文名那条：找不到带 hero 的专精'); return; }
  var en = B.specs[key].hero;

  function heroCellText() {
    var txt = null;
    walk(body, function (n) {
      if (txt || !n.classList || !n.classList.contains('mcell')) return;
      var t = n.textContent || '';
      if (t.indexOf('英雄天赋') === 0) txt = t;
    });
    return txt;
  }

  settings.bisTab = 'gear';
  settings.bisSpec = key;
  settings.bisView = 'simc';
  settings.bisChar = '';

  // 第一趟：**树不在**（模拟首屏）。这时显示英文是对的。
  g.AE_TALENT_TREE = null;
  body.children.length = 0;
  load('app/bis.js');
  g.AE.openBis();
  var first = heroCellText();

  // 第二趟：树到了，**同一个 bis.js 实例**再画一次。
  // 不重新 load —— 重新 load 会把模块作用域里的缓存也重置掉，
  // 那就绕过了要测的东西（缓存有没有被错误地固化）。
  g.AE_TALENT_TREE = keep;
  body.children.length = 0;
  g.AE.rerenderBis();
  var second = heroCellText();

  if (!first || !second) {
    problems.push('英雄天赋中文名那条：找不到「英雄天赋」那一格（第一趟 '
      + JSON.stringify(first) + '，第二趟 ' + JSON.stringify(second) + '）');
  } else if (!/[一-鿿]/.test(second.replace('英雄天赋', ''))) {
    problems.push('树加载完之后英雄天赋那一格还是英文：「' + second + '」（'
      + en + ' 该显示中文）—— heroName() 把树缺失时建的空表缓存住了');
  } else {
    stats.heroLate++;
  }
}());
if (!stats.heroLate) {
  problems.push('「树后到也能补上英雄天赋中文名」这条一次都没验成 —— 空转');
}

// ---- 视角迁移（第 16 轮撤掉 GearInsight 那两个视角按钮，v1.21.0 换掉默认视角的数据源）
if (stats.vmChecked !== 5) {
  problems.push('视角迁移只验了 ' + stats.vmChecked + ' 个存档值，应该是 5 个'
    + '（raid / mplus / retired-view / simc / rio）');
}
if (stats.vmMigrated !== 4) {
  problems.push('只有 ' + stats.vmMigrated + ' 个存档值落在「模拟配装」上，'
    + '应该是 4 个（raid / mplus / retired-view 迁过来，加上 simc 自己）');
}
if (stats.staleKey !== 3) {
  problems.push('「英雄天赋换过名的存档专精」只验了 ' + stats.staleKey + ' 次，应该是 3 次');
}
if (stats.vmWrote !== 3) {
  problems.push('只有 ' + stats.vmWrote + ' 个撤掉的视角名被写回成 simc，'
    + '应该是 3 个（raid / mplus / retired-view）—— 迁移只改了内存没落盘');
}

// ---- 装等那一格：一个真 bug 的回归
//
// 模拟配装视角的装等多数是 SimC 配置给的（配置写明 / bonus_id 查表），定不出的几格
// 从本机两份实测数据借（见 app/bis.js 的 simSlots / measuredGear）。
// 每条路都必须真的画出来过，否则「文字必须合格」那条在空集合上恒真。
if (stats.ivZero > 0) {
  problems.push(stats.ivZero + ' 行装等印成了 0 或别的非正整数 —— '
    + '以前就是这样（从 rio 物品池取 ilvl，而那个字段不存在）');
}
if (stats.ivSim < 400) {
  problems.push('只有 ' + stats.ivSim + ' 行装等标着 SimC 配置来源，太少'
    + '（实测 502：29 个专精的默认配置，加上对照那几组）—— 装等那一格没画出来，或者来源标记丢了');
}
// 下面两条是**小样本下界**：借来的那几格（多是制造装备）真的会被画到，而且标着是借的。
// 换赛季重抓后如果 SimC 恰好每一格都写了装等，这两条会误红 ——
// 那时把数字改成 0 并在这里记一句「本版本配置没有定不出装等的格子」，别把断言删掉。
if (stats.ivGi + stats.ivRio < 1) {
  problems.push('没有一行装等是借本机实测数据的 —— SimC 定不出装等那条分支没被画到'
    + '（MID2 实测 52 格，多是制造装备）');
}

// ---- 装等差距
//
// 这一组只有**选了对照角色**才画得出来，所以下界是必须的：上面所有渲染
// bisChar 都是空的，一个差距徽章都不会出现，而「徽章文字必须合格」那条
// 在 0 个徽章时照样成立。
if (stats.gapBad > 0) {
  problems.push(stats.gapBad + ' 个装等差距徽章的文字和 class 对不上'
    + '（「差 N」必须配 behind、「高 N」配 ahead、「持平」配 even）');
}
if (stats.gapChars > 0) {
  // 有存档的机器上才验下界。克隆下来没有 data/data.js 的人跑到的是 0，
  // 那不是缺陷 —— 摘要里会写「对照过 0 个角色」，看得见。
  if (stats.gapBadge < 100) {
    problems.push('装等差距徽章只画了 ' + stats.gapBadge + ' 个，太少'
      + '（实测 ' + stats.gapChars + ' 个角色 × 2 个视角 = 183 个）');
  }
  // 复核过的必须**等于**画出来的：写成「> 0」的话，183 个徽章里只有 1 个
  // 被复核也能过，而那意味着另外 182 个的差值从没验过。
  if (stats.gapMath !== stats.gapBadge) {
    problems.push('装等差距徽章 ' + stats.gapBadge + ' 个，差值独立复核过的只有 '
      + stats.gapMath + ' 个，不一一对应');
  }
  if (stats.gapTopBad > 0) {
    problems.push(stats.gapTopBad + ' 个装等差距比的不是这个部位首选那一件');
  }
  if (stats.gapTop < 100) {
    problems.push('只有 ' + stats.gapTop + ' 个装等差距复核过「比的是首选那一件」，太少');
  }
  if (stats.gapSum !== stats.gapSlots) {
    problems.push('装等差距汇总行 ' + stats.gapSum + ' 条，对照渲染 ' + stats.gapSlots
      + ' 次，不一一对应 —— 每次对照渲染都该有一条汇总');
  }
}

// 跨职业那一组的下界。上面三条断言都是「不许出现 X」的形式，在**一次都没跑**
// 的情况下全部自动成立 —— 所以必须钉住「真的跑过」和「每次都给了说明」。
if (stats.xcChecked > 0) {
  if (stats.xcNoGap !== stats.xcChecked) {
    problems.push('跨职业对照验了 ' + stats.xcChecked + ' 次，其中只有 ' + stats.xcNoGap
      + ' 次没画装等差距 —— 剩下那些在拿别的职业的装备算差距');
  }
  if (stats.xcNote !== stats.xcChecked) {
    problems.push('跨职业对照验了 ' + stats.xcChecked + ' 次，只有 ' + stats.xcNote
      + ' 次说清了「这个角色职业不对，没拿他对照」');
  }
}

// ---- 「实战分布」视角（rio）
// 这一组是**独立的**，不能靠上面的总量断言兜着：rio 视角要是一个部位都没画，
// 总量只会从 1264 掉到 1264 —— 因为它本来就没被算进去过。
// 本轮加这个视角时正是这样：套件全绿，渲染次数一字未变，等于新代码从没跑过。
if (stats.mainRio !== specKeys.length) {
  problems.push('实战分布视角在专精循环里只渲染了 ' + stats.mainRio + ' 次，应该是 '
    + specKeys.length + ' 个专精各一次');
}
// rio 的 40 个专精每个 15~17 个部位（副手/衬衫不是人人有），实测 636 组。
if (stats.rioSlots < 600) {
  problems.push('实战分布视角只画了 ' + stats.rioSlots + ' 个部位组，太少');
}
// 样本量徽章只在 rio 视角出，所以它的个数必须**正好等于** rio 的部位组数。
if (stats.sn !== stats.rioSlots) {
  problems.push('样本量徽章 ' + stats.sn + ' 个，实战分布部位组 ' + stats.rioSlots
    + ' 个，不一一对应');
}

// ---- 天赋树渲染的总量断言
// 本机实测（40 个专精 + 3 个类别 = 43 次渲染）：树 129，节点 4304，点亮 3198，
// 连线 6377，点亮 3990，点数徽章 412。下面的门槛都是从这些数压出来的。
if (stats.tspecs !== specKeys.length) {
  problems.push('天赋树只画了 ' + stats.tspecs + ' 个专精，应该是 ' + specKeys.length + ' 个');
}
// 每次渲染必须是三棵（职业 / 专精 / 英雄），不多不少。和「覆盖率徽章 === 部位组」
// 一个套路：写成相等，才能同时抓住「少画一棵」和「多画一棵」。
if (stats.tgrids !== stats.trenders * 3) {
  problems.push('天赋树 ' + stats.tgrids + ' 棵，渲染 ' + stats.trenders
    + ' 次，不是每次 3 棵');
}
if (stats.tEmpty > 0) problems.push(stats.tEmpty + ' 个专精一个天赋节点都没画出来');
if (stats.ticoEager > 0) {
  problems.push(stats.ticoEager + ' 个天赋图标没写 loading="lazy"');
}
if (stats.ticoLazy !== stats.tico) {
  problems.push('天赋图标懒加载 ' + stats.ticoLazy + ' / ' + stats.tico + '，不是全覆盖');
}
if (stats.tnodes < 4000) problems.push('天赋节点只画了 ' + stats.tnodes + ' 个，太少');
if (stats.tedges < 6000) problems.push('天赋连线只画了 ' + stats.tedges + ' 条，太少');
// 名字是这棵树的全部可读性 —— 不带图标，名字空一个都不行。
if (stats.tnoName > 0) problems.push(stats.tnoName + ' 个天赋节点没有名字');
if (stats.tnoCJK > 0) problems.push(stats.tnoCJK + ' 个天赋节点名不是中文（中文名连接坏了）');
if (stats.tRankBad > 0) problems.push(stats.tRankBad + ' 个点数徽章文字不合格式');
// 英雄天赋名：不允许任何一个是英文。本机实测 39/39 都能从 TraitSubTree
// 拉到中文名，所以这里写成 0 而不是一个比例。
if (stats.theroEn > 0) {
  problems.push(stats.theroEn + ' 个英雄天赋名没翻成中文');
}
if (stats.thero < 40) problems.push('只画了 ' + stats.thero + ' 个英雄天赋名，太少');
if (stats.tnoId > 0) problems.push(stats.tnoId + ' 个天赋节点没有 data-node');
if (stats.tdup > 0) problems.push('天赋节点重复画了 ' + stats.tdup + ' 次');
if (stats.tRank < 200) problems.push('点数徽章只画了 ' + stats.tRank + ' 个，太少');
// 点亮的比例。全灭 = 套路没解开；全亮 = 高亮逻辑失效，两种都是真 bug，
// 而它们都能在「节点数够多」的断言下蒙混过关。
var litPct = stats.tnodes ? stats.tnodeOn / stats.tnodes * 100 : 0;
if (litPct < 40 || litPct > 95) {
  problems.push('点亮的天赋节点占 ' + litPct.toFixed(1) + '%（' + stats.tnodeOn + '/'
    + stats.tnodes + '），不在 40~95% 之间');
}
if (stats.tedgeOn < 1000) problems.push('点亮的连线只有 ' + stats.tedgeOn + ' 条，太少');
// 列数 / 行数的上界。这一条不是为了「好看」，是为了抓住聚类容差被改坏：
// 上游坐标里有「相差 10」的近重复值，容差调成 0 会让它们各占一列 ——
// 那样既不重叠也不出界（画布跟着变宽），只是网格被悄悄拉歪了。
// 本机独立量过两次（tools 外的一次性脚本 + 这里）：最大 9 列 × 11 行，
// 且容差 50~250 之间结果不变，所以这个界是稳的。
// 聚类契约：上游坐标相差 <= 100 的两个节点必须落在同一列/行，> 100 必须不同。
// 这一条比「列数不超过 9」强 —— 容差被改成 0 时列数依然 <= 9（不同坐标值本来
// 就只有 9 种），但相差 10 的近重复坐标会各占一列，整棵树错位。
if (stats.tCluster > 0) {
  problems.push('天赋树有 ' + stats.tCluster + ' 处不满足聚类契约（容差 '
    + GRID_TOL_EXPECT + '），坐标摆错了');
}
if (stats.tmaxCol > 9 || stats.tmaxRow > 11) {
  problems.push('天赋树网格最大 ' + stats.tmaxCol + ' 列 × ' + stats.tmaxRow
    + ' 行，超出实测上界 9 × 11（坐标聚类的容差是不是被改了？）');
}
// 几何：这三条是 CSS 独有的失效模式。上面所有断言都只看「DOM 里有没有这个元素」，
// 而节点位置全靠绝对定位 —— 两个方块叠在一起、或者跑到画布外面，DOM 结构完全正常。
// 本机实测 4007 个方块（40 个专精）重叠 0、超出 0、最小间隙 12px。
if (stats.tgeo < 4000) problems.push('只量到 ' + stats.tgeo + ' 个节点方块，几何检查没跑起来');
if (stats.tSpill > 0) problems.push(stats.tSpill + ' 个天赋节点跑到画布外面了');
if (stats.tOverlap > 0) problems.push(stats.tOverlap + ' 对天赋节点互相重叠（网格算错了）');
// 天赋图标。写成「一个都不许少」而不是一个比例：图标名字典是全覆盖的
// （2094/2094 张文件都在），所以每个节点都该有图。
// 这一组的门槛是实测压出来的：4304 个节点 → 4304 张图标。
if (stats.tnoIco > 0) {
  problems.push(stats.tnoIco + ' 个天赋节点没有图标（图标名字典或 nodeEntry 坏了）');
}
if (stats.ticoBad > 0) problems.push(stats.ticoBad + ' 个天赋图标 src 不指向 app/talent-icons/');
// 图文不符一个都不允许。并且要求反查真的跑过足够多次 ——
// 如果 wantIco 永远是空（比如 TREE.names 取不到），上面那条会一直是 0，
// 看起来像「全对」，实际上一次都没比。本机实测能配上名字的节点 4304 中的大部分。
// 天赋说明（第 19 轮）。**下界必须有** —— app/talent-desc.js 丢了、或者
// renderTreeGrid 那几行被删掉，提示里就只剩名字，而上面每条断言都照样通过。
if (stats.tDesc < 5000) {
  problems.push('天赋说明只逐条核对过 ' + stats.tDesc + ' 次，太少'
    + '（产物 app/talent-desc.js 里 3242 条，345 棵树画下来该有上万次）'
    + ' —— 要么那份文件没加载，要么提示里没挂说明');
}
if (stats.tDescBad > 0) {
  problems.push(stats.tDescBad + ' 个节点的提示里，天赋说明和产物对不上');
}
if (stats.ticoPair < 3000) {
  problems.push('图文配对只查了 ' + stats.ticoPair + ' 次，太少（反查没真跑）');
}
if (stats.ticoMismatch > 0) {
  problems.push(stats.ticoMismatch + ' 个天赋节点图文不符（图标和名字取了不同的 entry）');
}
if (stats.ticoNoCls > 0) {
  problems.push(stats.ticoNoCls + ' 个天赋图标没有 class=ti（style.css 那段样式全部落空）');
}
// 数量必须和节点数相等。写成「> 4000」的话，「只有一半节点有图」也能过。
if (stats.tico !== stats.tnodes) {
  problems.push('天赋图标 ' + stats.tico + ' 个，节点 ' + stats.tnodes + ' 个，不一一对应');
}

if (stats.upd !== stats.renders) {
  problems.push('「更新这些数据」入口只画了 ' + stats.upd + ' 次，渲染了 '
    + stats.renders + ' 次 —— renderFootnote 挂了它，哪次渲染都该有');
}

console.log(pad('渲染检查') + (problems.length ? problems.length + ' 个问题' : '通过')
  + '（' + stats.renders + ' 次渲染，' + stats.imgs + ' 个图标，占位块 ' + stats.ph
  + '，轨道徽章 ' + stats.trk + '，部位组 ' + stats.slots
  + '，插槽徽章 ' + stats.sock + '（文字不对 ' + stats.sockBad + '）'
  + '，图标全部懒加载 ' + stats.imgLazy + '）');
// 这一行必须打印：装等和差距是第 16 轮加的，而「加了计数器、写了断言、
// 既不打印也没下界」在本仓库出过一次 —— 那次整块功能没被画过，套件照样全绿。
// **判词自己算，不许写死「通过」。** 下面那条「跨职业对照」的注释早就写了这句，
// 而它上面这一行一直是硬写的 '通过' —— 第 20 轮验戒指配对的变异体时当场看到：
// 判错 30 个、swap 变了 1 组，这一行照样印「通过」，问题只出现在下面的清单里。
// 一行印着通过、一行印着问题，是最容易让人只看前一行的形状。
var gapPass = !stats.gapBad && !stats.gapTopBad && !stats.pairBad && !stats.swapBad
  && stats.gapMath === stats.gapBadge && stats.gapSum === stats.gapSlots;
console.log(pad('装等 / 差距') + (gapPass ? '通过' : '有问题') + '（视角按钮 2 个，旧视角 '
  + stats.vmMigrated + ' 个存档值迁到「模拟配装」；没有 SimC 配置的 ' + stats.simNone
  + ' 个专精退到实战分布并说明；装等来源 SimC 配置 ' + stats.ivSim + ' 行、借 GearInsight '
  + stats.ivGi + ' 行、raider.io ' + stats.ivRio + ' 行、查不到 ' + stats.ivNone
  + ' 行、印成 0 的 ' + stats.ivZero + ' 行（借装等的三条分支造样本验过 ' + stats.ivBorrow
  + '/3）；对照 ' + stats.gapChars
  + ' 个角色 × 2 个视角，差距徽章 ' + stats.gapBadge + ' 个（文字与颜色不符 '
  + stats.gapBad + '，差值拿提示里的两个数独立复核 ' + stats.gapMath
  + '，比的是首选那一件 ' + stats.gapTop + '（不符 ' + stats.gapTopBad
  + '）），汇总行 ' + stats.gapSum
  + '，戒指/饰品按一对判：' + stats.pairCase + ' 组「戴在另一个孔」的命中'
  + '（判错 ' + stats.pairBad + '），两只调个位置结论不变 ' + stats.swapCases + ' 组'
  + '（变了 ' + stats.swapBad + '））');
// 判词必须**自己算**，不能写死「通过」：变异测试里这一行在 0/8 的情况下
// 照样印了「通过」，问题只出现在下面的问题清单里。一行印着通过、
// 一行印着问题，是最容易让人只看前一行的形状。
console.log(pad('　跨职业对照')
  + (stats.xcChecked && (stats.xcNoGap !== stats.xcChecked || stats.xcNote !== stats.xcChecked)
    ? '有问题' : '通过')
  + '（' + stats.xcChecked
  + ' 次「选了别的职业的角色」：没画差距徽章 ' + stats.xcNoGap
  + '，说清了原因 ' + stats.xcNote + '）');
console.log(pad('天赋树渲染') + (stats.tEmpty ? stats.tEmpty + ' 个专精是空的' : '通过')
  + '（' + stats.tspecs + ' 个专精，' + stats.tgrids + ' 棵树，节点 ' + stats.tnodes
  + '，点亮 ' + stats.tnodeOn + '，连线 ' + stats.tedges + '，点亮 ' + stats.tedgeOn
  + '，点数徽章 ' + stats.tRank + '，英雄天赋名 ' + stats.thero
  + '，图标 ' + stats.tico + '（全部懒加载 ' + stats.ticoLazy
  + '，没图标 ' + stats.tnoIco + '，路径错 ' + stats.ticoBad
  + '，缺 class ' + stats.ticoNoCls + '，图文配对 ' + stats.ticoPair
  + '，图文不符 ' + stats.ticoMismatch + '）'
  + '，方块 ' + stats.tgeo + '（重叠 ' + stats.tOverlap + '，超出 ' + stats.tSpill + '）'
  + '，方块尺寸 ' + NODE_BOX.w + '×' + NODE_BOX.h + '（读自 style.css）'
  + '，最大 ' + stats.tmaxCol + ' 列 × ' + stats.tmaxRow + ' 行，聚类越界 '
  + stats.tCluster
  + '，天赋说明逐条对过 ' + stats.tDesc + ' 次（对不上 ' + stats.tDescBad
  + '，产物里没这条的 ' + stats.tDescNo + '））');

// ---- 天赋导入串（rio 的 talentLoadoutText，照原样显示 / 复制）
// 这一组必须有自己的下界，而且必须**打印出来**。上一版我把计数器加好了、
// 断言也写了，但既不打印也没有下界 —— 于是「一个专精都没画出导入串块」
// 会安静地全绿通过，因为 43 条断言全都在 truth 为空时提前 return 了。
// 这就是这个项目反复踩的同一个坑：跳过报成通过。
if (stats.loSpecs !== specKeys.length) {
  problems.push('导入串只检查了 ' + stats.loSpecs + ' 个专精，应该是 '
    + specKeys.length + ' 个（rio 里 40 个专精都有串）');
}
// 每一次渲染都必须真的画出一块，一个不少。基准是**渲染次数**而不是专精数：
// 切类别那三次也各画一次，拿专精数比会差 3。
if (stats.loBoxes !== stats.loRenders) {
  problems.push('导入串块 ' + stats.loBoxes + ' 个，渲染 ' + stats.loRenders
    + ' 次，不一一对应');
}
// 复制按钮必须每次渲染都真被点过一次、并且交出正确的串。
// 写成相等而不是「> 0」：点一个专精成功也能让「> 0」过。
if (stats.loCopy !== stats.loRenders) {
  problems.push('复制按钮验过 ' + stats.loCopy + ' 次，渲染 ' + stats.loRenders
    + ' 次，说明有渲染的复制路径没验到');
}
// 选串按钮：40 个专精 × 最多 6 个。实测每个专精都有 6 种以上不同的串，
// 所以这里是 240。写成下界是为了容忍某个专精种类不足 6。
if (stats.loPicks < specKeys.length * 3) {
  problems.push('选串按钮总共只画了 ' + stats.loPicks + ' 个，太少');
}
// 下面两条是给**打印行里那两句话**做背书的。
// 摘要里写着「复制内容与显示逐字节相同，串头 specID 全部与所属专精一致」——
// 如果这两个计数器没有下界，那两句话就只是我自己写的一句宣传语：
// 判定分支一次都没走到时它们照样是 0，摘要照样这么印。
if (stats.loSpec !== stats.loRenders) {
  problems.push('串头 specID 只验过 ' + stats.loSpec + ' 次，渲染 ' + stats.loRenders
    + ' 次，摘要里「specID 全部一致」这句话没有依据');
}
if (stats.loExact !== stats.loRenders) {
  problems.push('逐字节相等只验过 ' + stats.loExact + ' 次，渲染 ' + stats.loRenders
    + ' 次，摘要里「逐字节相同」这句话没有依据');
}
// ---- 第 20 轮：团本 / 大秘境两类。**每条都要有下界** ——
// 这四个计数器要是没有下界，「分了两类」这件事在测试里等于不存在：
// 团本那半一条都没画、按钮一次都没点，摘要照样这么印。
if (stats.loKindBtn < stats.loRenders) {
  problems.push('团本/大秘境按钮只数到 ' + stats.loKindBtn + ' 个，渲染 '
    + stats.loRenders + ' 次 —— 每次渲染至少该有一个（那一排同时是「这批数据'
    + '哪来的」的标签，不只是开关）');
}
if (stats.loKindOn !== stats.loRenders) {
  problems.push('只有 ' + stats.loKindOn + ' 次渲染里有一个类是高亮的，渲染 '
    + stats.loRenders + ' 次 —— 一个都不高亮的话用户不知道自己在看哪一类');
}
if (stats.loRaid < 30) {
  problems.push('团本那一类只逐字节验过 ' + stats.loRaid + ' 次，太少'
    + '（app/wcl-data.js 覆盖 40 个专精）—— 那一半可能根本没画出来');
}
if (stats.loKindSw < 20) {
  problems.push('「点一下团本」只真点过 ' + stats.loKindSw + ' 次，太少'
    + ' —— 这个开关的 state 不点就等于不存在');
}
if (stats.loKindSaved < stats.loKindSw) {
  problems.push('点了团本但只有 ' + stats.loKindSaved + '/' + stats.loKindSw
    + ' 次写回了设置 —— 换个专精又会跳回大秘境');
}
if (stats.loResetIdx < 20) {
  problems.push('「换类回到 #1」只验过 ' + stats.loResetIdx + ' 次，太少'
    + ' —— 测试得先挑一个非 #1 的串，否则那条代码是死的也测不出来');
}
if (stats.loWarnOk !== stats.loRenders) {
  problems.push('「不是同一套」那句和 SimC 块的在场一致性只核对过 '
    + stats.loWarnOk + ' 次，渲染 ' + stats.loRenders + ' 次');
}
// 下界：**必须真的碰到过没有 SimC 配置的专精**，否则那条断言只验了一半
// （永远是「两个都在」，「两个都不在」那一支一次都没走）。MID2 实测有 11 个。
if (stats.loNoSim < 5) {
  problems.push('只碰到 ' + stats.loNoSim + ' 次「这个专精没有 SimC 配置」，'
    + '实测有 11 个（治疗专精等）—— 那条断言的另一半没被验过');
}
if (stats.loHead !== stats.loRenders) {
  problems.push('导入串标题里的人数 / 种类数只核对过 ' + stats.loHead + ' 次，渲染 '
    + stats.loRenders + ' 次 —— 分母写错的话百分比会偏高，而每个数看起来都合理');
}
if (stats.loSorted !== stats.loRenders) {
  problems.push('产物顺序只核对过 ' + stats.loSorted + ' 次，渲染 ' + stats.loRenders
    + ' 次 —— 面板不重排，「#1 热门」是不是真的最热门全靠这一条');
}
console.log(pad('天赋导入串') + (stats.loSpecs === specKeys.length
    && stats.loCopy === stats.loRenders && stats.loSpec === stats.loRenders
    && stats.loExact === stats.loRenders ? '通过' : '有问题')
  + '（' + stats.loSpecs + ' 个专精 / ' + stats.loRenders + ' 次渲染，串框 ' + stats.loBoxes
  + '，选串按钮 ' + stats.loPicks + '，复制按钮真点过 ' + stats.loCopy
  + ' 次且复制内容与显示逐字节相同，串头 specID 全部与所属专精一致，'
  + '产物顺序独立复核 ' + stats.loSorted + '）');
// 第 20 轮那一行单独打。**必须打印** —— 加了计数器又不印，等于给自己看的。
console.log(pad('　团本/大秘境') + (stats.loRaid >= 30 && stats.loKindSw >= 20
    && stats.loKindOn === stats.loRenders ? '通过' : '有问题')
  + '（类按钮 ' + stats.loKindBtn + ' 个，每次渲染都有一类高亮 ' + stats.loKindOn
  + '，团本那类逐字节验过 ' + stats.loRaid + ' 次，真点过「团本」' + stats.loKindSw
  + ' 次（写回设置 ' + stats.loKindSaved + '，换类回到 #1 ' + stats.loResetIdx + '）'
  + '，标题人数对过 ' + stats.loHead + ' 次'
  + '　大秘境来自 raider.io，团本来自 Warcraft Logs）');

// ---- SimC 天赋配置
// 门槛全部写成「和渲染次数相等」，不是「> 0」：这一组的每条断言都在
// truth 为空时提前 return，只要一个下界写松，「整块没画出来」就会安静地全绿。
var SIMT_SPECS = 0, simtTotal = 0;
specKeys.forEach(function (k) {
  var t = simTalentTruth(B.specs[k].specId);
  if (t) { SIMT_SPECS++; simtTotal += t.length; }
});
// 绝对下界。上面每条断言都是「和渲染次数相等」——**真值恒为空的时候它们全是 0 = 0**，
// 整组会安静地全绿。所以先钉死「产物里确实有这么多专精有配置」。MID2 实测 29 个专精 / 47 份。
if (SIMT_SPECS < 20 || simtTotal < 30) {
  problems.push('产物里只有 ' + SIMT_SPECS + ' 个专精 / ' + simtTotal + ' 份 SimC 天赋配置（实测 29 / 47），取数路径不对');
}
if (stats.simtSpecs !== SIMT_SPECS) {
  problems.push('SimC 天赋只检查了 ' + stats.simtSpecs + ' 个专精，产物里有 ' + SIMT_SPECS
    + ' 个（有配置的专精必须都走到 SimC 那条路）');
}
['simtBox', 'simtName', 'simtSpec', 'simtDecl', 'simtPts', 'simtCopyClick', 'simtGameOk'].forEach(function (k) {
  if (stats[k] !== stats.simtRenders) {
    problems.push('SimC 天赋 ' + k + ' 只验过 ' + stats[k] + ' 次，渲染 ' + stats.simtRenders + ' 次，不一一对应');
  }
});
// 树和表头只在「树画的是这一份」时判（切到「榜上」的那几次不算），所以是下界不是全等。
if (stats.simtTree < SIMT_SPECS || stats.simtHeadSum < SIMT_SPECS) {
  problems.push('「画出来的树就是高亮那一份」验了 ' + stats.simtTree + ' 次、表头相加对上 '
    + stats.simtHeadSum + ' 次，少于有配置的专精数 ' + SIMT_SPECS);
}
// 两条英雄树都点了的配置（MID2：野德、射击猎）和没点满的配置（冰霜死骑）：
// 那才是「印 95 点」「导进去剩点数」的现场，一次都没走到等于这两条断言不存在。
if (stats.simtPtsSplit < 2 || stats.simtBundle < 2) {
  problems.push('两条英雄树都点了的配置，点数只复核过 ' + stats.simtPtsSplit + ' 次、英雄条遇到 '
    + stats.simtBundle + ' 次，太少（MID2 有 2 份）');
}
if (stats.simtSubBar !== stats.simtBundle) {
  problems.push('两条英雄树都点了的配置遇到 ' + stats.simtBundle + ' 次，选择条只对上 ' + stats.simtSubBar + ' 次');
}
if (stats.simtShortSeen < 1 || stats.simtShort !== stats.simtShortSeen) {
  problems.push('没点满的配置遇到 ' + stats.simtShortSeen + ' 次，界面上说对了 ' + stats.simtShort
    + ' 次（MID2 有冰霜死骑两份）');
}

// 第 18 轮的顺序：两条都是**下界 + 全等**。下界不写的话，把两块都不画
// 会让「顺序对」恒真（一个都没比过等于全对）；全等则钉住「比过的每一次都对」。
if (stats.ordChecked < 25) {
  problems.push('「raider.io 在 SimC 上面」只验过 ' + stats.ordChecked + ' 次，太少');
}
if (stats.ordRio !== stats.ordChecked) {
  problems.push('验了 ' + stats.ordChecked + ' 次两块的先后，只有 ' + stats.ordRio
    + ' 次 raider.io 在上面');
}
if (stats.ordCols < 30) {
  problems.push('「英雄天赋那一列在最前」只验过 ' + stats.ordCols + ' 次，太少');
}
if (stats.ordHero !== stats.ordCols) {
  problems.push('验了 ' + stats.ordCols + ' 次三棵树的次序，只有 ' + stats.ordHero
    + ' 次英雄天赋在最前');
}

// ---- 换专精之后会不会落在「别人的第 2 份」上（第 16 轮友好度修复）
//
// simIdx / simSub / loadout / build 都是**数组下标**，每个专精的数组各自不同。
// 不归零的话：在 A 专精选了第 2 份，切到 B 专精就落在 B 的第 2 份上 ——
// 那是用户没选过的一份配置，而界面上完全看不出异常（高亮、点数、树全自洽）。
//
// 判据：先在 A 专精点到第 2 份，再点 B 专精的按钮，B 的高亮必须回到第 1 份。
(function checkSpecSwitchResets() {
  // 找一个有 >=2 份 SimC 配置的专精，而且它同职业的另一个专精也有 >=2 份
  var cands = specKeys.filter(function (k) {
    var t = simTalentTruth(B.specs[k].specId);
    return t && t.length >= 2;
  });
  if (cands.length < 2) return;

  settings.bisTab = 'talents';
  settings.bisSpec = cands[0];
  body.children.length = 0;
  load('app/bis.js');
  g.AE.openBis();

  var bs = findBtns('simb');
  if (bs.length < 2) return;
  bs[1].click();                       // 在 A 专精选第 2 份

  // 找 B 专精的按钮并点它（专精按钮的 class 是 spec）
  var target = null;
  walk(body, function (n) {
    if (target || !n.classList || !n.classList.contains('spec')) return;
    if (n.classList.contains('on')) return;   // 跳过当前那个
    target = n;
  });
  if (!target) return;
  target.click();

  var after = findBtns('simb');
  if (!after.length) return;           // 换到的专精没走 SimC 那条路
  stats.switchChecked++;
  var on = -1;
  after.forEach(function (b, i) { if (b.classList.contains('on')) on = i; });
  if (on !== 0) {
    problems.push('在一个专精选了第 2 份，切到另一个专精后高亮落在第 ' + (on + 1)
      + ' 份 —— 换专精没把「第几份」归零，用户会看到一份他没选过的配置');
  } else {
    stats.switchReset++;
  }
})();

// 点一下之后位置有没有丢。**下界必须有** —— 上面那两条断言只在真去点了
// 之后才成立，一次都没点的话它们等于不存在。
if (stats.posChecked < 10) {
  problems.push('只在 ' + stats.posChecked + ' 个专精上验过「点一下会不会把位置弄丢」，太少');
}
if (stats.posScroll !== stats.posChecked) {
  problems.push('验过 ' + stats.posChecked + ' 次，滚动位置只保住了 ' + stats.posScroll + ' 次');
}
if (stats.switchChecked && stats.switchReset !== stats.switchChecked) {
  problems.push('换专精归零验过 ' + stats.switchChecked + ' 次，只成功 '
    + stats.switchReset + ' 次');
}
if (stats.posSec < 10) {
  problems.push('折叠块的展开状态只在 ' + stats.posSec + ' 个专精上保住，太少');
}
if (stats.posSecShut < 10) {
  problems.push('折叠块的**收起**状态只在 ' + stats.posSecShut + ' 个专精上保住，太少'
    + ' —— 这个方向是另一个 bug（默认写死 open 的块会自己弹回来）');
}

if (stats.simtBuildSw < 10) problems.push('「换配置」只点过 ' + stats.simtBuildSw + ' 次，太少');
if (stats.simtSubSw < 2) problems.push('「换英雄树」只点过 ' + stats.simtSubSw + ' 次，太少');
console.log(pad('SimC 天赋') + (stats.simtSpecs === SIMT_SPECS
    && stats.simtBox === stats.simtRenders && stats.simtDecl === stats.simtRenders
    && stats.simtPts === stats.simtRenders && stats.simtCopyClick === stats.simtRenders
    && stats.simtGameOk === stats.simtRenders ? '通过' : '有问题')
  + '（' + stats.simtSpecs + '/' + specKeys.length + ' 个专精 / ' + stats.simtRenders
  + ' 次渲染，配置按钮 ' + stats.simtBtns + '，画出来的树和高亮那一份同一份 ' + stats.simtTree
  + '，点数与英雄子树独立解码复核 ' + stats.simtDecl
  + '，三棵树表头相加 == 「共 N 点」 ' + stats.simtHeadSum
  + '，印的点数游戏里配得出来 ' + stats.simtPts + '（其中两条英雄树都点了的 ' + stats.simtPtsSplit + '）'
  + '，没点满的说清楚 ' + stats.simtShort + '/' + stats.simtShortSeen
  + '，两条英雄树都点了的 ' + stats.simtBundle + ' 次都给了选择条'
  + '，复制按钮真点过 ' + stats.simtCopyClick + ' 次且与框里、产物里逐字节相同'
  + '，导入串是游戏格式（版本 2 / specID 对）' + stats.simtGameOk
  + '，真点过：换配置 ' + stats.simtBuildSw + '、换英雄树 ' + stats.simtSubSw + '）');
// 单独一行：第 18 轮定的顺序。打印出来才看得见「验过几次」——
// 不打印的话下界失效时没人会注意到数字变成了 0。
console.log(pad('　页面顺序') + 'raider.io 在 SimC 上面 ' + stats.ordRio + '/' + stats.ordChecked
  + '，英雄天赋列在最前 ' + stats.ordHero + '/' + stats.ordCols);

console.log(pad('　点了不丢位置') + (stats.posScroll === stats.posChecked ? '通过' : '有问题')
  + '（' + stats.posChecked + ' 个专精上真点了一下：滚动位置保住 ' + stats.posScroll
  + '，折叠块展开状态保住 ' + stats.posSec
  + '、收起状态保住 ' + stats.posSecShut + '）');

/*
 * **默认写死 `open` 的折叠块收起来之后，不许自己弹回去。**
 *
 * 上面那条「收起状态保住」跑在 SimC 那条路上，而那边的块默认都是合着的 ——
 * 去掉反向还原的逻辑它照样全绿（实测过：变异体没被抓到）。真正会弹回来的是
 * 插件兜底那条路上的「热门英雄天赋」，它在源码里被硬置成 open，只出现在
 * SimC 没有配置的那些专精（治疗专精等）。所以这一组专门去那些专精上点。
 */
(function checkFallbackSecShut() {
  var done = 0, bad = 0, done2 = 0;
  specKeys.forEach(function (key) {
    if (done >= 2) return;
    var sid = (B.specs[key] || {}).specId;
    if (!sid || simTalentTruth(sid)) return;       // 有 SimC 配置的不走兜底那条路
    settings.bisTab = 'talents';
    settings.bisSpec = key;
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();

    function findHero() {
      var hit = null;
      walk(body, function (n) {
        if (hit || n.tagName !== 'DETAILS') return;
        (n.children || []).forEach(function (c) {
          if (c.tagName === 'SUMMARY' && /热门英雄天赋/.test(String(c.textContent || ''))) hit = n;
        });
      });
      return hit;
    }
    var sec = findHero();
    if (!sec) return;
    done++;
    if (sec.getAttribute('open') == null) {
      bad++;
      problems.push('兜底折叠块：' + key + ' 的「热门英雄天赋」默认该是展开的');
    }
    sec.removeAttribute('open');
    if (sec.dispatch) sec.dispatch('toggle');
    // 点一下「套路」里的按钮触发整块重建。
    var btn = null;
    walk(body, function (n) {
      if (btn || !n.classList || !n.classList.contains('tree-pick')) return;
      (n.children || []).forEach(function (c) { if (!btn && c.tagName === 'BUTTON') btn = c; });
    });
    if (!btn) { problems.push('兜底折叠块：' + key + ' 找不到「套路」按钮，这一条跑不动'); return; }
    btn.click();
    var again = findHero();
    if (!again) { problems.push('兜底折叠块：' + key + ' 重建后「热门英雄天赋」没了'); return; }
    if (again.getAttribute('open') != null) {
      bad++;
      problems.push('兜底折叠块：' + key + ' 的「热门英雄天赋」收起来之后，'
        + '点一下套路又自己打开了 —— 源码里那句写死的 open 会盖掉用户的动作');
    }

    /*
     * 顺带验这一页上的「人」到底是不是人。
     *
     * AE_TALENTS 的 p 是「人·首领」的记录（每个类别 8 个首领 × 5 人 = 40 行），
     * 同一个角色跨首领会反复出现。原来 chip 写「天神御师 40 人 100%」而真实只有
     * 12 个角色（3.3×），「热门套路」表头写「人数」填的也是条数。
     * 真值在这里**独立算一遍**（按 名字|服务器|大区 去重），不问面板。
     */
    // AE_TALENTS 的键是「职业/专精」，没有英雄那一段（bis 的 key 有三段），
    // 所以要按 app/bis.js 那边同样的规则退一步取（第一版直接用三段 key，
    // 一条都没匹配上，done2 恒为 0 —— 又一个印着「0 次」的空转）。
    var T2 = g.AE_TALENTS;
    var base2 = key.split('/').slice(0, 2).join('/');
    var tdData = T2 && T2.specs ? (T2.specs[key] || T2.specs[base2]) : null;
    var cat = (settings.bisTalentCat || 'raid');
    var encs = tdData && tdData.content ? (tdData.content[cat] || []) : [];
    var seen = {}, rowN = 0;
    encs.forEach(function (enc) {
      (enc.p || []).forEach(function (p) { rowN++; seen[p[2] + '|' + p[3] + '|' + p[4]] = 1; });
    });
    var truth = Object.keys(seen).length;
    if (truth) {
      var sumTxt = '';
      (again.children || []).forEach(function (c) {
        if (c.tagName === 'SUMMARY') sumTxt = String(c.textContent || '');
      });
      var m2 = /（(\d+) 个角色/.exec(sumTxt);
      if (!m2) {
        bad++;
        problems.push('兜底折叠块：' + key + ' 的「热门英雄天赋」标题没写角色数：' + sumTxt);
      } else if (Number(m2[1]) !== truth) {
        bad++;
        problems.push('兜底折叠块：' + key + ' 标题写「' + m2[1] + ' 个角色」，'
          + '独立去重算出来是 ' + truth + ' 个（' + rowN + ' 条「人·首领」记录）'
          + ' —— 这个数是条数不是人数');
      } else {
        done2++;
      }
      // 每个 chip 的人数不许超过角色总数（超了就说明还在数条数）。
      walk(again, function (n) {
        if (!n.classList || !n.classList.contains('chip')) return;
        var mm = /(\d+) 人/.exec(String(n.textContent || ''));
        if (mm && Number(mm[1]) > truth) {
          bad++;
          problems.push('兜底折叠块：' + key + ' 有个英雄天赋写着 ' + mm[1]
            + ' 人，而这个类别一共只有 ' + truth + ' 个不同角色');
        }
      });
    }
  });
  if (done < 2) {
    problems.push('兜底折叠块：只在 ' + done + ' 个专精上跑到（该有 3 个走兜底那条路）');
  }
  if (done2 < 2) {
    problems.push('兜底折叠块：「角色数」只在 ' + done2 + ' 个专精上对过真值，太少');
  }
  console.log(pad('　兜底那条路') + (bad ? '有问题' : '通过')
    + '（' + done + ' 个走插件兜底的专精：折叠块默认展开、收起后不许自己弹回来；'
    + '「热门英雄天赋」的角色数按 名字|服务器|大区 独立去重复核 ' + done2 + ' 次'
    + '（原来印的是「人·首领」条数，最多虚高 3.6 倍））');
})();

// ---- 无障碍
// 这一组全是「实测已经是 0，写成硬断言钉住」，不是给未来留的余量。
// 加这一组的起因是：我先量出「621 个 <img> 全都没有 alt」，差点当成 bug 去改 ——
// 实际是**桩不反射属性**（app 里写的是 img.alt = ''，属性写法，桩只认 setAttribute）。
// 修好桩之后才看出真实情况：alt 全都有，缺的是天赋树画布的 role 和说明。
if (stats.a11yImg > 0) {
  problems.push(stats.a11yImg + ' 个 <img> 没有 alt 属性（装饰图也要写 alt=""，'
    + '否则读屏软件会念文件名）');
}
if (stats.a11yBtnBad > 0) {
  problems.push(stats.a11yBtnBad + ' 个 <button> 既没有可见文字也没有 aria-label');
}
if (stats.a11yTipBad > 0) {
  problems.push(stats.a11yTipBad + ' 个元素只有 data-tip、没有可见文字'
    + '（tooltip 是补充说明，不能当成元素的名字）');
}
if (stats.a11yCanvasBad > 0) {
  problems.push(stats.a11yCanvasBad + ' 个天赋树画布没有 role=group + aria-label');
}
// 来源插件的名字漏进界面。第 17 轮改文案前实测 13 种不同的串（散在装等来源、
// 查不到装等、升级轨道、属性权重借用说明四处 + 脚注一句），改完是 0 —— 钉住它。
if (stats.srcLeak > 0) {
  problems.push(stats.srcLeak + ' 处界面文案在说这数据来自哪个插件'
    + '（第 17 轮定的：界面只说这数是什么，出处说明留在源码注释里）');
}
// 数量下界：断言本身有没有跑到。全是 0 也可能是「一个都没数到」。
if (stats.a11yTip < 2000) problems.push('只数到 ' + stats.a11yTip + ' 个 data-tip 元素，无障碍检查没跑起来');
if (stats.a11yBtn < 200) problems.push('只数到 ' + stats.a11yBtn + ' 个 <button>，无障碍检查没跑起来');
if (stats.a11yCanvas < 100) problems.push('只数到 ' + stats.a11yCanvas + ' 个天赋树画布，无障碍检查没跑起来');

console.log(pad('无障碍') + (stats.a11yImg + stats.a11yBtnBad + stats.a11yTipBad
    + stats.a11yCanvasBad + stats.srcLeak ? '有问题' : '通过')
  + '（' + stats.imgs + ' 个图标全有 alt，' + stats.a11yBtn + ' 个按钮全有名字，'
  + stats.a11yTip + ' 个 data-tip 元素全有可见文字，'
  + stats.a11yCanvas + ' 个天赋树画布全有 role=group + 说明，'
  + '文案提到数据出自哪个插件 ' + stats.srcLeak + ' 处）');

// ---- 进度条：span 做的条子必须自己声明 display -------------------------------
//
// 第 19 轮用户报「属性目标的进度条没有正常显示」。真在浏览器里量过：
//   .bar-row .track   557×9  —— 有尺寸
//   .bar-row .fill      0×0  —— 没尺寸
// 两个都是 el('span', …) 建的。span 默认 display:inline，而 **inline 元素的
// width / height 一律不生效**，所以 fill.style.width = '25%' 是个空操作，条子
// 永远画不出来。外面那个 track 只是**侥幸**有尺寸：它在 flex 容器里被 flex:1
// 撑成了 flex item，被隐式 blockify 了。装备行的使用率条连这份运气都没有
// （.item .usage 不是 flex 容器），track 和 fill 一起 0×0。
//
// 这一条为什么必须写在这里：这个 bug 整套测试一次都没抓到，也抓不到 ——
// tools/dom-stub.js 没有布局引擎，style.width 存进去就存进去了，
// getBoundingClientRect 是我们自己编的。DOM 断言在这个失败形状上是瞎的。
// 所以改成从**样式表文本**里查规则，和上面 NODE_BOX 读 .tnode 尺寸是同一招。
(function () {
  var css = fs.readFileSync(path.join(ROOT, 'app', 'style.css'), 'utf8');
  var src = fs.readFileSync(path.join(ROOT, 'app', 'bis.js'), 'utf8');

  // 面板里用 style.width 撑出来的条子，逐个列出来：[选择器, 给它宽度的那句 JS]。
  // 新加一个条子而忘了写 display，这一条不会自动发现 —— 但只要沿用
  // el('span', 'fill') 这个形状，下面那条「有几个 fill 就得有几条规则」会兜住。
  var BARS = [
    { sel: '.bar-row .track .fill', why: '属性目标的进度条' },
    { sel: '.bar-row .track', why: '属性目标进度条的外框' },
    { sel: '.item .usage .track .fill', why: '装备行的使用率条' },
    { sel: '.item .usage .track', why: '使用率条的外框' }
  ];
  var bad = [];
  BARS.forEach(function (b) {
    // 取这个选择器那一条规则的声明块。选择器里的 . 要转义，不然 '.' 会去匹配任意字符。
    var re = new RegExp(b.sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '\\s*(?:,[^{]*)?\\{([^}]*)\\}');
    var m = re.exec(css);
    if (!m) { bad.push(b.why + '（' + b.sel + '）在 style.css 里没有规则'); return; }
    var decl = m[1];
    if (!/display\s*:\s*(block|flex|inline-block)/.test(decl)) {
      bad.push(b.why + '（' + b.sel + '）没有声明 display'
        + ' —— 它是 span，默认 inline，width / height 不生效，条子会是 0×0');
    }
    if (!/(height|min-height)\s*:/.test(decl)) {
      bad.push(b.why + '（' + b.sel + '）没有高度 —— 空的 inline 内容撑不出高度');
    }
  });

  // 下界 + 配平：面板里 el('span', 'fill') 有几处，上面就得有几条 fill 规则。
  // 少了的话是「新加了条子却没加样式」，多了的话是这份名单在盯已经不存在的东西。
  var fillsInJs = (src.match(/el\('span',\s*'fill'\)/g) || []).length;
  var fillRules = BARS.filter(function (b) { return /\.fill$/.test(b.sel); }).length;
  if (!fillsInJs) bad.push('bis.js 里一个 span.fill 都没有，这一组在验空气');
  if (fillsInJs !== fillRules) {
    bad.push('bis.js 里有 ' + fillsInJs + ' 处 span.fill，但这一组只盯了 '
      + fillRules + ' 个 —— 新加的条子没人管它有没有 display');
  }
  console.log(pad('进度条样式') + (bad.length ? '有问题' : '通过')
    + '（' + BARS.length + ' 条规则都声明了 display 和高度，'
    + 'bis.js 里 ' + fillsInJs + ' 处 span.fill 都有对应规则）');
  bad.forEach(function (p) { problems.push(p); });
}());

// ----------------------------------------------------------------------- 格式校验
// 两个校验器分别是 app/bis-data.js 和 app/talent-tree.js 的格式定义（可执行的那种）。
// 在这里连带跑一遍，免得它们自己烂掉都没人知道 —— 它们的价值全在「换数据源时能拦住
// 不合格的新生成器」，那意味着平时必须一直是绿的。
//
// 数据文件不在就跳过，但**跳过要说出来**（打「跳过」而不是「通过」）——
// 一个没跑的检查报成通过，就是我在别处反复踩过的「空测试」。
var VERIFIERS = [
  { label: '数据格式', script: 'verify-bis-data.js', data: 'bis-data.js' },
  { label: '天赋树格式', script: 'verify-talent-tree.js', data: 'talent-tree.js' },
  // own=true：这个校验器自己打的那行比通用的「N 项检查」信息量大（它要报少解 /
  // rank / entryIndex / granted 各自的不符数），所以原样透传，不降级成计数。
  { label: '天赋串解码', script: 'verify-talent-decode.js', data: 'talent-tree.js',
    need: 'tools/talent-truth.json', own: true },
  { label: 'rio 装备分布', script: 'verify-rio-data.js', data: 'rio-data.js' },
  // SimC 默认配置：每条串用面板那份解码器独立复核，装等来源可追溯，GPL 许可文件在。
  { label: 'SimC 配置', script: 'verify-simc-data.js', data: 'simc-data.js' },
  // 团本天赋串（第 20 轮）。串头能解开 + specID 对得上，是这份数据唯一的硬判据。
  { label: 'wcl 团本天赋', script: 'verify-wcl-data.js', data: 'wcl-data.js' },
  // End-to-end scanner fixture: PowerShell unwraps function results with zero or
  // one item unless the caller forces an array. That used to emit `accounts: ,`.
  { label: 'BagSync 扫描', script: 'check-scan-bagsync.js' },
  // Same trap on the backups path (there it only lied in the console, the JS
  // stayed valid -- but the shape deserves the same pinned guard).
  { label: '备份扫描', script: 'check-scan-backups.js' },
  // AlterEgo 1.6.6 moved Dungeons/Raids/Seasons into Libs\LiqUI\Data. The old
  // scanner only read Data\, and nothing errored -- the page just lost its
  // dungeon abbrs, raid order and season label. Both layouts are pinned here.
  { label: '插件数据表', script: 'check-scan-addon-tables.js' },
  { label: 'Desktop scan', script: 'check-desktop-scan.js', own: true },
  { label: 'Launcher watch', script: 'check-launcher-watch.js', own: true },
  { label: 'Live refresh', script: 'check-live-refresh.js', own: true },
  { label: 'Dashboard chrome', script: 'check-dashboard.js', own: true },
  { label: 'Update panel', script: 'check-update-panel.js', own: true },
  { label: 'Application identity', script: 'check-application-version.js', own: true },
  { label: 'Application updates', script: 'check-app-updates.js', own: true },
  { label: 'Window state', script: 'check-window-state.js', own: true },
  { label: '天赋数据边界', script: 'check-talent-integrity.js', own: true },
  { label: '天赋更新保护', script: 'check-talent-update.js', own: true },
  // 12.1.5 的 DB2 多了个隐藏职业「旅行者」（4 个专精），骗过了旧的「专精数 >= 3」，
  // 更新数据.bat 第 1 步交叉校验失败。用假 DB2 钉住新判定。
  { label: '职业名生成', script: 'check-class-names.js', own: true },
  // fetch-simc.js 怎么读 SimC 配置：ilevel 压过 bonus_id、两档不挑、附魔模板占位不编数（不联网）。
  { label: 'SimC 解析', script: 'check-simc-parse.js', own: true }
];
VERIFIERS.forEach(function (v) {
  if (v.data && !fs.existsSync(path.join(ROOT, 'app', v.data))) {
    console.log(pad(v.label) + '跳过（没有 app/' + v.data + '）');
    return;
  }
  // 真值文件是提交进仓库的。它不见了不是「这台机器没数据」，是仓库缺东西 ——
  // 那种情况下「跳过」会把一条 2406 项的断言静默变成真空，所以硬失败。
  if (v.need && !fs.existsSync(path.join(ROOT, v.need))) {
    problems.push(v.label + '：缺 ' + v.need + '（它是提交进仓库的，'
      + '不该缺；重新生成跑 node tools\\fetch-talent-truth.js）');
    console.log(pad(v.label) + '缺真值文件');
    return;
  }
  var cp = require('child_process');
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', v.script)],
    { encoding: 'utf8' });
  var out = String(r.stdout || '') + String(r.stderr || '');
  var m = /检查项\s+(\d+)/.exec(out);
  if (r.status === 0) {
    if (v.own) {
      var own = out.split(/\r?\n/).filter(function (ln) { return ln.trim(); })[0] || '';
      console.log(own || (pad(v.label) + '通过'));
    } else {
      console.log(pad(v.label) + '通过（' + (m ? m[1] : '?') + ' 项检查）');
    }
    return;
  }
  console.log(pad(v.label) + '不合格式');
  var found = 0;
  out.split(/\r?\n/).forEach(function (ln) {
    if (/^\s+·/.test(ln)) { problems.push(v.label + '：' + ln.replace(/^\s+·\s*/, '')); found++; }
  });
  if (!found) problems.push(v.label + '校验失败（退出码 ' + r.status + '）');
});

// ------------------------------------------------------------------- 懒加载顺序
/*
 * **按真实的点击顺序走一遍懒加载。**
 *
 * 这一关必须**另开一个进程**（tools/check-lazyload.js）：上面那个 env 把 8 个数据
 * 文件全部预载了（故意的，免得「因为没数据所以跳过」报成通过），代价是它看不见
 * 「该拉的没拉」这一类洞；而 dom-stub 的 env 共用同一个 global，同一进程里开不出
 * 干净的第二个。第 21 轮的真 bug 就是这一类：装备页（默认那一页）会把
 * talent-tree.js 拉下来，于是切到天赋页时 ensureTalents() 早退，
 * app/talent-desc.js 一次都不会被请求 —— 天赋图标的提示里只剩名字。
 */
(function () {
  var script = path.join(ROOT, 'tools', 'check-lazyload.js');
  if (!fs.existsSync(script)) {
    console.log(pad('懒加载顺序') + '跳过（没有 check-lazyload.js）');
    return;
  }
  var cp = require('child_process');
  var r = cp.spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  var out = (r.stdout || '') + (r.stderr || '');
  var m = /合计 请求 (\d+) 组，问题 (\d+)/.exec(out);
  if (!m) {
    problems.push('check-lazyload.js 没给出「合计 请求 N 组，问题 M」那一行 —— 它自己坏了？');
    console.log(pad('懒加载顺序') + '读不出结果');
    return;
  }
  var groups = Number(m[1]), bad = Number(m[2]);
  // 下界：实测装备页 5 个 + 切页 3 个 = 8 组。掉下来说明它没真的走完那条路。
  if (groups < 6) {
    problems.push('懒加载只观察到 ' + groups + ' 组请求（实测 8），check-lazyload 没走完流程');
  }
  if (bad) {
    out.split('\n').filter(function (l) { return l.indexOf('· ') === 2; })
      .slice(0, 4).forEach(function (l) { problems.push('懒加载顺序：' + l.trim().slice(2)); });
  }
  var nd = /天赋节点 (\d+) 个，悬停提示带说明的 (\d+) 个/.exec(out);
  console.log(pad('懒加载顺序') + (bad ? '有问题' : '通过')
    + '（另开一个干净进程，按「先开装备页 → 点天赋页签」走：观察到 ' + groups
    + ' 组请求' + (nd ? '，' + nd[1] + ' 个天赋节点的提示全带说明 ' + nd[2] : '') + '）');
}());

// --------------------------------------------------------------------- 树跟着串
/*
 * **「下面的树画哪一套」那个开关，以及树和人数必须是同一套**（第 21 轮）。
 *
 * 用户报的：「人数和天赋树还是不匹配」。原因是版面骗人 —— 页顶那块写「#1·50人」
 * （榜上 50 个真实角色在用这一串），页底只有一棵树，画的却是另一套。
 * 现在给了开关：切到「榜上」时树画那一串，标题里把人数写出来。
 *
 * 判据全部独立算：串和人数直接从产物（AE_RIO / AE_WCL）取，点数用
 * tools/decode-talent-string.js 解一遍 —— 不问面板。
 */
(function () {
  var before = problems.length;
  var checked = 0, bad = 0;
  specKeys.forEach(function (key) {
    if (checked >= 6) return;
    var sid = (B.specs[key] || {}).specId;
    var RS = g.AE_RIO && g.AE_RIO.specs ? g.AE_RIO.specs[String(sid)] : null;
    if (!sid || !RS || !RS.loadouts || !RS.loadouts.length) return;
    if (!simTalentTruth(sid)) return;     // 没有 SimC 配置的专精没有这个开关（树本来就是套路那一套）

    settings.bisTab = 'talents';
    settings.bisSpec = key;
    settings.bisLoKind = 'mplus';         // 钉死大秘境那一类，真值就取 AE_RIO
    settings.bisTreeSrc = 'lo';
    body.children.length = 0;
    load('app/bis.js');
    g.AE.openBis();
    checked++;
    var label = key;

    // 开关在不在，且「榜上」那个是高亮的
    var srcBtns = [];
    walk(body, function (n) {
      if (!n.classList || !n.classList.contains('tree-src')) return;
      (n.children || []).forEach(function (c) {
        if (c.tagName === 'BUTTON') srcBtns.push(c);
      });
    });
    if (srcBtns.length !== 2) {
      bad++;
      problems.push('树跟着串：' + label + ' 「下面的树画哪一套」那排有 '
        + srcBtns.length + ' 个按钮，该是 2 个');
      return;
    }
    var loBtn = srcBtns[1];
    if (!loBtn.classList.contains('on')) {
      bad++;
      problems.push('树跟着串：' + label + ' 存的是「榜上」，但高亮的不是它');
    }

    // 真值：产物里第一条串 + 它的人数 + 独立解码出来的点数
    var row = RS.loadouts[0];
    var truthCount = row[1];
    var d2 = null;
    try { d2 = DEC.decode(row[0], ORDER); } catch (e) { d2 = null; }
    if (!d2 || d2.err) return;            // 解不开的串面板会退回 SimC 那套，那是另一条路
    var truthPts = 0;
    (d2.nodes || []).forEach(function (n) {
      if (n.inSpec && n.purchased) truthPts += (typeof n.rank === 'number' ? n.rank : 1);
    });

    // 按钮上的人数（#1·N人）和树标题里的人数必须都等于真值
    var btnTxt = String(loBtn.textContent || '');
    var mb = /#(\d+)·(\d+)人/.exec(btnTxt);
    if (!mb) {
      bad++;
      problems.push('树跟着串：' + label + ' 开关上没写「#N·M人」：' + btnTxt);
    } else if (Number(mb[2]) !== truthCount) {
      bad++;
      problems.push('树跟着串：' + label + ' 开关写 ' + mb[2] + ' 人，产物里第一条是 '
        + truthCount + ' 人');
    }
    var cap = '';
    walk(body, function (n) {
      if (cap || !n.classList || !n.classList.contains('bis-tree')) return;
      (n.children || []).forEach(function (c) {
        if (!cap && c.tagName === 'P' && /画的是榜上/.test(String(c.textContent || ''))) {
          cap = String(c.textContent || '');
        }
      });
    });
    if (!cap) {
      bad++;
      problems.push('树跟着串：' + label + ' 树上面没写「画的是榜上 #N」——'
        + ' 用户没法知道这棵树是哪一套');
      return;
    }
    var mc = /画的是榜上 #(\d+)（[^）]*?(\d+) 个角色在用这一串）。共 (\d+) 点/.exec(cap);
    if (!mc) {
      bad++;
      problems.push('树跟着串：' + label + ' 树标题格式不对：' + cap.slice(0, 60));
    } else {
      if (Number(mc[2]) !== truthCount) {
        bad++;
        problems.push('树跟着串：' + label + ' 树标题写 ' + mc[2] + ' 个角色，'
          + '产物里是 ' + truthCount + ' —— 人数和树还是不是同一套');
      }
      if (Number(mc[3]) !== truthPts) {
        bad++;
        problems.push('树跟着串：' + label + ' 树标题写共 ' + mc[3] + ' 点，'
          + '这条串独立解出来是 ' + truthPts + ' 点 —— 画的不是这一串');
      }
    }
  });
  settings.bisTreeSrc = '';
  settings.bisLoKind = '';
  if (checked < 4) {
    problems.push('树跟着串：只验了 ' + checked + ' 个专精，这一组没跑起来');
  }
  console.log(pad('树跟着串') + (bad ? '有问题' : '通过')
    + '（' + checked + ' 个专精：切到「榜上」之后树标题里的人数和点数都对着产物 + '
    + '独立解码验过，开关高亮跟着设置走）');
})();

// ----------------------------------------------------------------------- 角色栈
/*
 * 装备页的角色栈摆法（第 21 轮，用户定的「像魔兽世界角色栏一样排列」）。
 *
 * 原来 16 个部位一列竖着排，实战分布视角 145~225 行、整页约 8 屏，而面板宽 1160px
 * 右边空着。现在左列 6 格 + 右列 8 格 + 武器一行，每格两行（你身上那件 / 首选那件），
 * 完整分布收在格子里点开。
 *
 * 这一组盯三件事，都是「改成两行摘要」之后才可能坏的：
 *   ① 16 个部位一个都不能少，而且在游戏里那个位置上（左列 6 个、右列 8 个、武器行）；
 *   ② 每格都得有第二行「首选 / 最热那件」——摘要少一行，这一格就没告诉你该换什么；
 *   ③ 完整分布默认收起、点一下展开（收起的行**还在 DOM 里**，所以别的断言口径不变）。
 */
(function () {
  var before = problems.length;
  var cells = 0, tops = 0, opened = 0, order = 0, checked = 0, flats = 0, flatIcons = 0;
  var byView = { simc: { cells: 0, flat: 0 }, rio: { cells: 0, flat: 0 } };
  var pairsChecked = 0, pairsDupe = 0;
  var LEFT = [1, 2, 3, 15, 5, 9], RIGHT = [10, 6, 7, 8, 11, 12, 13, 14], BOTTOM = [16, 17];
  var NAMES = (g.AE_BIS || {}).slotNames || {};

  // 前 6 个专精（死骑 3 + 恶魔猎手 3）都有 SimC 配置，所以 simc 那一轮画的就是模拟配装。
  specKeys.slice(0, 6).forEach(function (key) {
    ['simc', 'rio'].forEach(function (view) {
      settings.bisTab = 'gear';
      settings.bisSpec = key;
      settings.bisView = view;
      settings.bisChar = '';
      body.children.length = 0;
      load('app/bis.js');
      g.AE.openBis();
      checked++;

      function colNames(cls) {
        var out = [];
        walk(body, function (n) {
          if (!n.classList || !n.classList.contains(cls)) return;
          walk(n, function (m) {
            if (!m.classList || !m.classList.contains('slot-head')) return;
            (m.children || []).forEach(function (c) {
              if (c.tagName === 'B' && c.textContent) out.push(String(c.textContent));
            });
          });
        });
        return out;
      }
      // ① 位置。左列那一段还挂着两块汇总（bis-sum），但汇总里没有 slot-head，
      //    所以按 slot-head 里的 <b> 取名字不会被它们污染。
      var want = {
        left: LEFT.map(function (id) { return NAMES[id]; }).filter(Boolean),
        right: RIGHT.map(function (id) { return NAMES[id]; }).filter(Boolean)
      };
      var gotL = colNames('left'), gotR = colNames('right'), gotW = colNames('weapons');
      var label = key + '/' + view;
      if (gotL.join(',') !== want.left.join(',')) {
        problems.push('角色栈：' + label + ' 左列是「' + gotL.join(' ')
          + '」，该是「' + want.left.join(' ') + '」（照游戏角色栏的位置）');
      } else if (gotR.join(',') !== want.right.join(',')) {
        problems.push('角色栈：' + label + ' 右列是「' + gotR.join(' ')
          + '」，该是「' + want.right.join(' ') + '」');
      } else {
        order++;
      }
      if (!gotW.length) {
        problems.push('角色栈：' + label + ' 武器那一行是空的（主手 / 副手没画）');
      }

      /*
       * **成对的两格不许推荐同一件**（第 21 轮用户报的）。
       * rio 的 finger1/finger2 是两份独立采样，同一枚热门戒指在两份里都排第一 ——
       * 实测 80 对里 51 对（64%）撞了，而游戏里不能戴两枚一样的。
       * 判据只看画出来的东西：每格里带 .top 的那一行的名字，两格必须不同。
       */
      function pickName(slotName) {
        var out = '';
        walk(body, function (n) {
          if (out || !n.classList || !n.classList.contains('slot')) return;
          var mine2 = '';
          walk(n, function (m) {
            if (!m.classList) return;
            if (m.classList.contains('slot-head')) {
              (m.children || []).forEach(function (c) {
                if (c.tagName === 'B' && !mine2) mine2 = String(c.textContent || '');
              });
            }
          });
          if (mine2 !== slotName) return;
          walk(n, function (m) {
            if (out || !m.classList) return;
            if (m.classList.contains('item') && m.classList.contains('top')) {
              walk(m, function (x) {
                if (!out && x.tagName === 'B' && x.textContent) out = String(x.textContent);
              });
            }
          });
        });
        return out;
      }
      [['戒指1', '戒指2'], ['饰品1', '饰品2']].forEach(function (pr) {
        var n1 = pickName(pr[0]), n2 = pickName(pr[1]);
        if (!n1 || !n2) return;
        pairsChecked++;
        if (n1 === n2) {
          pairsDupe++;
          if (pairsDupe < 4) {
            problems.push('角色栈：' + label + ' ' + pr[0] + ' 和 ' + pr[1]
              + ' 推荐的是同一件「' + n1 + '」—— 游戏里不能戴两枚一样的，得往下取一件');
          }
        }
      });

      // ② 每格两行；③ 默认收起、点一下展开。
      var slots = [];
      walk(body, function (n) {
        if (n.classList && n.classList.contains('slot')) slots.push(n);
      });
      cells += slots.length;
      byView[view].cells += slots.length;
      slots.forEach(function (sl) {
        var head = null, top = null, listBox = null;
        (sl.children || []).forEach(function (c) {
          if (!c.classList) return;
          if (c.classList.contains('slot-head')) head = c;
          if (c.classList.contains('slot-top')) top = c;
          if (c.classList.contains('slot-list')) listBox = c;
        });
        /*
         * 两种格子，判据不同（第 21 轮用户定的「请保持图标和替代项」）：
         *   · flat（行 ≤4，SimC 一格一行全是这种）：**行直接摆着**，所以不该有摘要行，
         *     也不该能折 —— 折起来只会多点一下；
         *   · 其余（rio 的深格子，5~29 行）：给一行摘要（带图标）+ 点开看全部。
         */
        var isFlat = sl.classList.contains('flat');
        if (isFlat) {
          flats++;
          byView[view].flat++;
          if (top) {
            problems.push('角色栈：' + label + ' 有一格行数很少却还画了摘要行 ——'
              + ' 行都摆着了，摘要是重复的');
          }
          if (!listBox || !listBox.children.length) {
            problems.push('角色栈：' + label + ' 有一格是 flat 但一行都没画');
          } else {
            var withIcon = 0;
            (listBox.children || []).forEach(function (row) {
              walk(row, function (x) { if (x.tagName === 'IMG') withIcon++; });
            });
            if (!withIcon) {
              problems.push('角色栈：' + label + ' 有一格的装备行一个图标都没有');
            } else {
              flatIcons++;
            }
          }
          return;
        }
        if (!top) {
          problems.push('角色栈：' + label + ' 有一格没画「首选 / 最热那件」那一行'
            + ' —— 这一格就没说该换成什么');
          return;
        }
        // 摘要行也要有图标（用户要求：只有名字的一行认起来慢得多）。
        var sumIcon = 0;
        walk(top, function (x) { if (x.tagName === 'IMG') sumIcon++; });
        if (!sumIcon) {
          problems.push('角色栈：' + label + ' 摘要行没有图标');
        }
        tops++;
        if (!listBox || !listBox.children.length) {
          problems.push('角色栈：' + label + ' 有一格的完整分布没渲染出来');
          return;
        }
        // 键盘也得能开：完整分布只靠悬停的话，用键盘和触屏的人拿不到。
        if (head && (head.attrs || {})['role'] !== 'button') {
          problems.push('角色栈：' + label + ' 格子头不是 role=button —— 键盘打不开');
        }
        if (head && (head.attrs || {})['tabindex'] !== '0') {
          problems.push('角色栈：' + label + ' 格子头没有 tabindex，Tab 键跳不到');
        }
        // 收起 / 展开是 class 控制的（CSS 收 .slot-list），所以判 class。
        if (sl.classList.contains('open')) {
          problems.push('角色栈：' + label + ' 有一格默认就是展开的');
        } else if (head) {
          head.click();
          if (!sl.classList.contains('open')) {
            problems.push('角色栈：' + label + ' 点格子头之后没展开');
          } else {
            if ((head.attrs || {})['aria-expanded'] !== 'true') {
              problems.push('角色栈：' + label + ' 展开了但 aria-expanded 还是 false');
            }
            head.click();
            if (sl.classList.contains('open')) {
              problems.push('角色栈：' + label + ' 再点一下没收回去');
            } else {
              opened++;
            }
          }
        }
      });
    });
  });

  if (checked < 12) problems.push('角色栈：只渲染了 ' + checked + ' 次，这一组没跑起来');
  if (order !== checked) {
    problems.push('角色栈：位置对上的只有 ' + order + '/' + checked + ' 次');
  }
  if (cells < 12 * 14) {
    problems.push('角色栈：一共只画了 ' + cells + ' 格，太少（16 个部位 × ' + checked + ' 次渲染）');
  }
  if (tops + flats !== cells) {
    problems.push('角色栈：' + cells + ' 格里，摘要行 ' + tops + ' 格 + 直接摆行 '
      + flats + ' 格，加起来不等于总数');
  }
  if (opened !== tops) {
    problems.push('角色栈：有摘要行的 ' + tops + ' 格里只有 ' + opened + ' 格能点开再收回');
  }
  if (flatIcons !== flats) {
    problems.push('角色栈：直接摆行的 ' + flats + ' 格里只有 ' + flatIcons + ' 格有图标');
  }
  /*
   * SimC 那边一格只有一行，所以**「模拟配装」视角每一格都该是直接摆行的**。
   * 实战分布那边反过来：绝大多数格子 5~29 行，该给摘要 + 点开。
   */
  if (!byView.simc.cells || byView.simc.flat !== byView.simc.cells) {
    problems.push('角色栈：模拟配装视角 ' + byView.simc.cells + ' 格里只有 '
      + byView.simc.flat + ' 格把行直接摆出来 —— 一格一行的东西被折起来了');
  }
  if (pairsChecked < 12) {
    problems.push('角色栈：只验了 ' + pairsChecked + ' 对「戒指/饰品不许推荐同一件」，太少'
      + '（12 次渲染 × 2 对 = 24）');
  }
  if (byView.rio.flat > byView.rio.cells / 2) {
    problems.push('角色栈：实战分布视角 ' + byView.rio.flat + '/' + byView.rio.cells
      + ' 格没折 —— 那边一格 5~29 行，全摆出来又回到一列 8 屏那个样子了');
  }
  console.log(pad('角色栈') + (problems.length > before ? '有问题' : '通过')
    + '（' + checked + ' 次渲染 × 16 个部位 = ' + cells + ' 格：位置照游戏角色栏 '
    + order + '/' + checked + '，行少的直接摆出来（带图标）' + flats
    + ' 格（模拟配装 ' + byView.simc.flat + '/' + byView.simc.cells
    + ' 全摆着），行多的给带图标的摘要行 + 点开再收回 ' + opened + ' 格'
    + '，成对的两格不推荐同一件 ' + (pairsChecked - pairsDupe) + '/' + pairsChecked + '）');
})();

// ----------------------------------------------------------------------- 天赋归并
/*
 * tools/group-loadouts.js 的指纹（「这两条串是不是同一套天赋」）。
 *
 * 为什么这一组必须存在：第 20 轮那份指纹**写错了字段名**（`n.node`，而
 * tools/decode-talent-string.js 给的是 `n.id`），于是每个节点都变成
 * `undefined:点数:二选一`，指纹退化成「只比点数和二选一的分布」，把**完全不同的
 * 天赋并成一套** —— 团本语料 7920 套并成 558 套，最大的一组塞了 250 套不同的天赋。
 * 而产物看起来毫无问题（「#1 有 139 人，60 种写法」），两个校验器全绿，
 * 137 项测试全绿。抓到它靠的是一把外部的尺子（WCL 的串是它自己生成的，
 * 同一套必然同一串，所以正确的指纹在那份语料上必须 ≈1 种写法/套，实测退化版 14.19）。
 *
 * 语料上那把尺子在这里跑不动（要 7920 条串的原始缓存），所以这一组用**合成真值**
 * 盯住同一个失败形状：两套只在「点了哪些节点」上不同、点数分布完全一样的天赋，
 * 指纹必须不同。退化的指纹在这一条上必炸。
 */
(function () {
  var before = problems.length;
  var GROUP, checks = 0, realKeys = 0;
  try { GROUP = require('./group-loadouts.js'); } catch (e) {
    problems.push('天赋归并：require group-loadouts.js 失败：' + e.message);
    console.log(pad('天赋归并') + '加载失败');
    return;
  }

  // 1. 指纹依赖的**字段名**。真解一条串，看节点对象到底叫什么 ——
  //    这一条是那个 bug 的正面回归：写错字段名时它直接报出来。
  var sample = null;
  var rsp = g.AE_RIO && g.AE_RIO.specs;
  Object.keys(rsp || {}).some(function (sid) {
    var lo = rsp[sid].loadouts;
    if (lo && lo[0] && lo[0][0]) { sample = lo[0][0]; return true; }
    return false;
  });
  if (!sample) {
    problems.push('天赋归并：app/rio-data.js 里一条天赋串都取不到，这一组在验空气');
  } else {
    var d = DEC.decode(sample, ORDER);
    var n0 = d && d.nodes && d.nodes[0];
    checks++;
    if (!n0 || n0.id == null) {
      problems.push('天赋归并：解码器返回的节点没有 id 字段（有的是 '
        + Object.keys(n0 || {}).join(',') + '）—— group-loadouts.js 的指纹就靠它，'
        + '字段名一改指纹会退化成「只比点数分布」');
    }
  }

  // 2. **核心断言**：两套天赋点数分布一模一样、只有节点身份不同 → 指纹必须不同。
  //    退化的指纹（不看节点是哪个）在这一条上会把两套算成一套。
  var shape = [{ rank: 1, entryIndex: 0 }, { rank: 2, entryIndex: 1 }, { rank: 3, entryIndex: '' }];
  function fake(ids) {
    return { spec: 70, nodes: ids.map(function (id, i) {
      return { id: id, rank: shape[i].rank, entryIndex: shape[i].entryIndex };
    }) };
  }
  var kA = GROUP.buildKey('A', function () { return fake([101, 102, 103]); });
  var kB = GROUP.buildKey('B', function () { return fake([201, 202, 203]); });
  checks++;
  if (!kA || !kB) {
    problems.push('天赋归并：合成真值算不出指纹（buildKey 返回空）');
  } else if (kA === kB) {
    problems.push('天赋归并：点数分布相同、节点完全不同的两套天赋算出了同一个指纹 '
      + kA.slice(0, 40) + ' —— 指纹没看节点是哪个，会把不同的天赋并成一套'
      + '（第 20 轮真踩过：7920 套并成 558 套）');
  }
  // 同一套换个遍历顺序还是同一套（位流里顺序固定，但指纹不该赌这个）。
  checks++;
  if (kA !== GROUP.buildKey('A', function () {
    var f = fake([101, 102, 103]); f.nodes.reverse(); return f;
  })) {
    problems.push('天赋归并：同一套天赋换个节点顺序就变成了另一个指纹');
  }
  // 专精不同就是两套 —— 串头带着 specID，导错专精游戏直接拒绝。
  checks++;
  if (kA === GROUP.buildKey('A', function () {
    var f = fake([101, 102, 103]); f.spec = 71; return f;
  })) {
    problems.push('天赋归并：两个不同专精的天赋算出了同一个指纹');
  }

  // 3. 节点缺 id 必须**抛异常**，不许静默返回 null。返回 null 的话所有串都算
  //    「解不开」，抓取器照样写出一份空天赋的产物 —— 那正是要防的静默退化。
  checks++;
  var threw = false;
  try {
    GROUP.buildKey('A', function () { return { spec: 70, nodes: [{ rank: 1 }] }; });
  } catch (e) { threw = /id/.test(e.message); }
  if (!threw) {
    problems.push('天赋归并：节点没有 id 时 buildKey 没抛异常 —— '
      + '字段名写错会静默退化成一个只比点数分布的指纹');
  }

  // 4. 真串上：同一串两次指纹相同；产物里同一专精的两条不同串指纹必须不同
  //    （它们是两套不同的天赋，产物里同一套只该占一行）。
  Object.keys(rsp || {}).forEach(function (sid) {
    var lo = rsp[sid].loadouts || [];
    if (lo.length < 2) return;
    var dec = function (s) { return DEC.decode(s, ORDER); };
    var k1 = GROUP.buildKey(lo[0][0], dec);
    var k2 = GROUP.buildKey(lo[1][0], dec);
    if (!k1 || !k2) return;
    realKeys++;
    if (k1 === k2) {
      problems.push('天赋归并：专精 ' + sid + ' 产物里前两条串解出来是同一套天赋 —— '
        + '同一套占了两行，人数被摊开');
    }
    if (k1 !== GROUP.buildKey(lo[0][0], dec)) {
      problems.push('天赋归并：专精 ' + sid + ' 同一条串算出了两个不同的指纹（不稳定）');
    }
  });

  // 5. 计数：同一个角色重复出现只算一次；同一套的两种写法合成一行、代表串取多数。
  var rows = [
    { ch: '甲', str: 'x1' }, { ch: '甲', str: 'x1' },   // 同人同串，算 1 个人
    { ch: '乙', str: 'x2' },                            // 同一套的另一种写法
    { ch: '丙', str: 'y1' }
  ];
  var same = fake([101, 102, 103]);
  var res = GROUP.group(rows, function (s) {
    return s.charAt(0) === 'x' ? same : fake([201, 202, 203]);
  });
  checks++;
  if (res.list.length !== 2) {
    problems.push('天赋归并：4 条（2 套）应该归成 2 行，实际 ' + res.list.length);
  } else {
    checks++;
    if (res.list[0].n !== 2 || res.list[0].forms !== 2) {
      problems.push('天赋归并：那一套该是 2 个角色 / 2 种写法，实际 '
        + res.list[0].n + ' / ' + res.list[0].forms
        + '（同一个角色的重复出场该只算一次）');
    }
    checks++;
    if (res.list[0].n < res.list[1].n) {
      problems.push('天赋归并：结果没按人数降序');
    }
  }

  // 下界。少了任何一项都说明这一组没真跑（第 19/20 轮反复踩的「跳过报成通过」）。
  if (checks < 8) problems.push('天赋归并：只跑到 ' + checks + ' 项检查，测试没跑起来');
  if (realKeys < 20) {
    problems.push('天赋归并：只在 ' + realKeys + ' 个专精的真串上算过指纹（该有 40 个）'
      + ' —— 合成真值过了不等于真数据过了');
  }
  console.log(pad('天赋归并')
    + (problems.length > before ? '有问题' : '通过')
    + '（合成真值 ' + checks + ' 项：点数分布相同而节点不同的两套算出不同指纹、'
    + '节点缺 id 直接抛异常；真串 ' + realKeys + ' 个专精上前两条互不相同且指纹稳定）');
})();

// ------------------------------------------------------------------- 口径与文案
/*
 * 「界面上那个数是什么意思」和「界面提到的东西存不存在」这一族。
 *
 * 五条都是第 20 轮审查真抓到的形状，每条都能独立失败：
 *   ① 导出和格子对同一份数据给出不同答案（团本过期锁定：格子「·」，导出是数字）；
 *   ② 「还需」后面写的是这一档的总要求而不是差额（3 / 8 后面接「还需 8 个」）；
 *   ③ persist() 写的键不在设置默认表里 → hydrate() 把它丢掉，选择活不过一次刷新；
 *   ④ 界面文案提到一个包里没有的文件（「双击 start.bat」，而包里叫 启动.bat）；
 *   ⑤ 品质字段是 0 时没有可退的真品质 → BiS 首选被染成灰色（卖店垃圾的颜色）。
 */
(function () {
  var before = problems.length, checks = 0, raidStale = 0, raidLive = 0;
  var S = g.AE, L = g.AE_LABELS || {};
  var cols = (S.buildColumns && model.columns) ? S.buildColumns(model) : [];
  var ctx = { model: model, settings: settings };
  function newTd() { var td = doc.createElement('td'); td.className = ''; return td; }

  // ---- ① 团本列：导出必须和格子一样把过期残留过滤掉。
  //
  // 合成真值在前，真实数据在后。合成的那两条与本机数据无关，换一台机器照样跑得到 ——
  // 只靠真实数据的话，某台机器上恰好没有过期残留时这一条就变成空转。
  var raidCol = null;
  for (var i = 0; i < cols.length; i++) {
    if (String(cols[i].id).indexOf('raid:') === 0) { raidCol = cols[i]; break; }
  }
  if (!raidCol || !S.exportCellForTest) {
    problems.push('口径与文案：拿不到团本列或 exportCellForTest，①在验空气');
  } else {
    var key = String(raidCol.id).slice(5);
    [true, false].forEach(function (active) {
      var fake = { raids: { byKey: {} } };
      // 形状照 app/model.js 建出来的那份：render 还会读 name / difficultyName /
      // encounters 去拼提示，少一个就是 TypeError（这里踩过一次）。
      fake.raids.byKey[key] = {
        progress: 8, total: 8, active: active, locked: active,
        name: '测试团本', difficultyName: '史诗',
        encounters: [{ name: '首领甲', killed: true }]
      };
      var td = newTd();
      raidCol.render(td, fake, ctx);
      var cell = S.exportCellForTest(raidCol, fake, ctx);
      var shownDash = String(td.textContent) === '·';
      var exportEmpty = cell.v === '' || cell.v == null;
      checks++;
      if (shownDash !== exportEmpty) {
        problems.push('口径与文案：团本锁定 active=' + active + ' 时格子画「'
          + td.textContent + '」而导出给「' + cell.v + '」—— 同一格两个答案');
      }
      checks++;
      if (active && String(td.textContent) !== '8/8') {
        problems.push('口径与文案：active 的团本格该画 8/8，实际「' + td.textContent + '」');
      }
    });
    // 真实数据扫一遍，顺带把本机有多少过期残留印出来。
    var stale = 0, live = 0, mismatch = 0;
    (model.characters || []).forEach(function (ch) {
      cols.forEach(function (c) {
        if (String(c.id).indexOf('raid:') !== 0) return;
        var r = ch.raids && ch.raids.byKey ? ch.raids.byKey[String(c.id).slice(5)] : null;
        if (!r) return;
        if (r.active) live++; else stale++;
        var td2 = newTd();
        c.render(td2, ch, ctx);
        var cv = S.exportCellForTest(c, ch, ctx);
        if ((String(td2.textContent) === '·') !== (cv.v === '' || cv.v == null)) mismatch++;
      });
    });
    checks++;
    if (mismatch) {
      problems.push('口径与文案：真实数据里有 ' + mismatch + ' 格「界面和导出不一致」');
    }
    raidStale = stale; raidLive = live;
  }

  // ---- ② 宝库提示：「还需」后面必须是**差额**。
  //
  // 判据独立算：从提示行里把「第 N 档　a / b」和「还需：…N…」都抠出来，
  // 断言 N === b - a。这条不能靠 AE.vaultRequirement 自己验 —— 那个函数按契约
  // 返回的就是「这一档要多少」，错在调用处的措辞。
  var vaultLines = 0;
  cols.forEach(function (c) {
    if (String(c.id).indexOf('vault:') !== 0) return;
    (model.characters || []).forEach(function (ch) {
      var td = newTd();
      c.render(td, ch, ctx);
      String(td.title || '').split('\n').forEach(function (line) {
        var m = /第 \d+ 档　(\d+) \/ (\d+)　还需：\D*(\d+)/.exec(line);
        if (!m) return;
        vaultLines++;
        var need = Number(m[3]), have = Number(m[1]), want = Number(m[2]);
        if (need !== want - have) {
          problems.push('口径与文案：宝库提示「' + line.replace(/　/g, ' ')
            + '」—— 前面写着 ' + have + ' / ' + want + '，「还需」该是 '
            + (want - have) + ' 而不是 ' + need);
        }
      });
    });
  });
  checks++;
  if (!vaultLines) {
    problems.push('口径与文案：一条宝库「还需」提示都没解析到 —— ②在验空气'
      + '（本机所有档位都满了？扫描数据缺失？）');
  }

  // ---- ③ persist() 写出去的键，必须都在设置默认表里。
  //
  // hydrate() 是 Object.keys(defaults()).forEach，不在表里的键会被整个丢掉：
  // 写得进 localStorage，读不回来，于是那个选择活不过一次刷新，而且**没有任何报错**。
  // 第 20 轮 bisLoKind 就是这样空转了一整轮。
  // **默认键集要从 AE.loadSettings().settings 拿。** 两个坑连着踩过：
  //   · AE.defaultSettings 根本不存在（settings.js 里 defaults() 是模块私有的，
  //     只有 load / save / reset 是公开的）；
  //   · AE.loadSettings() 返回的是**外壳** {settings, origin, storageOk, adoptedFrom}，
  //     直接拿它当设置对象只有 4 个键。
  // 两次都会把七个正常的键报成「不在默认表里」—— 完整的假红。所以下面留了一条
  // 仪器自检：键太少就说仪器坏了，而不是报数据错。
  var loaded = S.loadSettings ? S.loadSettings() : null;
  var defKeys = (loaded && loaded.settings) || {};
  var persisted = {};
  fs.readdirSync(path.join(ROOT, 'app')).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    var src = fs.readFileSync(path.join(ROOT, 'app', f), 'utf8');
    var re = /persist\(\{\s*([A-Za-z_][A-Za-z_0-9]*)\s*:/g, m;
    while ((m = re.exec(src))) persisted[m[1]] = f;
  });
  var pk = Object.keys(persisted);
  checks++;
  if (Object.keys(defKeys).length < 20) {
    problems.push('口径与文案：设置默认表只读出 ' + Object.keys(defKeys).length
      + ' 个键 —— 仪器坏了（AE.loadSettings 取不到？），③这一条的结论不可信');
  }
  checks++;
  if (pk.length < 3) {
    problems.push('口径与文案：只扫到 ' + pk.length + ' 个 persist 的键，③大概没扫到东西');
  }
  pk.forEach(function (k) {
    checks++;
    if (!(k in defKeys)) {
      problems.push('口径与文案：' + persisted[k] + ' 里 persist({ ' + k + ': … }) 写的键'
        + '不在设置默认表里 —— hydrate() 会把它丢掉，'
        + '这个选择活不过一次刷新（写得进去，读不回来）');
    }
  });

  // ---- ④ 界面文案里提到的 .bat / .exe，必须真的在包里。
  //
  // 「请先双击 start.bat」——而包里叫 启动.bat。这种错只在**第一次打开**、
  // 也就是最需要说对话的那一刻出现。
  var namedFiles = {};
  ['index.html', 'tests.html'].concat(fs.readdirSync(path.join(ROOT, 'app'))
    .filter(function (f) { return /\.js$/.test(f); })
    .map(function (f) { return 'app/' + f; }))
    .forEach(function (rel) {
      var p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) return;
      var src = fs.readFileSync(p, 'utf8');
      // 扩展名后面必须断字：不加 (?![A-Za-z0-9_]) 的话 `doc.execCommand` 里的
      // 「.exe」也会被当成一个文件名（第一版就报了「让用户去双击 doc.exe」）。
      var re = /[A-Za-z0-9_一-龥-]+\.(?:bat|exe)(?![A-Za-z0-9_])/g, m;
      while ((m = re.exec(src))) (namedFiles[m[0]] || (namedFiles[m[0]] = [])).push(rel);
    });
  var nf = Object.keys(namedFiles);
  checks++;
  if (!nf.length) {
    problems.push('口径与文案：界面文案里一个 .bat/.exe 都没提到 —— ④在验空气'
      + '（那句「先双击…」被删了？）');
  }
  nf.forEach(function (name) {
    checks++;
    if (!fs.existsSync(path.join(ROOT, name))) {
      problems.push('口径与文案：' + namedFiles[name].join(' / ') + ' 让用户去双击 '
        + name + '，而这个文件不在包里 —— 用户会去找一个不存在的东西');
    }
  });

  // ---- ⑤ 品质 0 = 「没有这个字段」，不是「粗糙品质」。
  //
  // 面板把 q===0 当成没有、再去查 app/item-icons.js（bis.js 的
  // `(ri && ri.q) ? ri.q : itemQuality(itemId)`）—— 曾经有一份物品池里 36 件 q 是 0，
  // 三个法师专精的腰带首选被染成灰色。SimC 那份的约定是**0 不写**（fetch-simc.js），
  // 所以这里验约定守住了：池里没有 q=0，而且每件都有真品质（DB2 OverallQualityID）。
  var SCI = (g.AE_SIMC && g.AE_SIMC.items) || {};
  var zeroQ = 0, noQ = 0, nSimItems = Object.keys(SCI).length;
  Object.keys(SCI).forEach(function (id) {
    if (SCI[id].q === 0) zeroQ++;
    else if (!(SCI[id].q >= 1)) noQ++;
  });
  checks++;
  if (!nSimItems) problems.push('口径与文案：SimC 物品池是空的，⑤ 没有样本');
  checks++;
  if (zeroQ || noQ) {
    problems.push('口径与文案：SimC 物品池里有 ' + zeroQ + ' 件 q=0、' + noQ
      + ' 件没有品质 —— 0 该省略，而 DB2 每件都有品质');
  }

  if (checks < 12) {
    problems.push('口径与文案：只跑到 ' + checks + ' 项检查，这一组没跑起来');
  }

  /*
   * ⑥ 老存档不许被重新「播种」列的默认显隐。
   *
   * 列的播种（隐藏 defaultHidden 和上赛季货币）现在靠 settings.columnsSeeded 这个
   * 显式标记，而不是「hiddenColumns 是不是空的」。老存档里没有这个键，如果当成
   * 「没播种过」，就会把用户手动打开过的列重新按默认隐藏一遍 —— 悄悄改掉他的选择。
   * 走的是 AE_SETTINGS（保存到文件那条路）+ AE.loadSettings()，不碰私有函数。
   */
  var keep = g.AE_SETTINGS;
  var schema = (loaded && loaded.settings && loaded.settings.schemaVersion) || 1;
  function seededFor(hidden) {
    g.AE_SETTINGS = {
      schemaVersion: schema, savedAt: Date.now() + 10000, hiddenColumns: hidden
    };
    var r = S.loadSettings();
    return r && r.settings ? r.settings.columnsSeeded : null;
  }
  checks++;
  if (seededFor({ 'cur:3445': true }) !== true) {
    problems.push('口径与文案：老存档（已有隐藏列、没有 columnsSeeded 键）被判成'
      + '「没播种过」—— 下次打开会把用户手动打开过的列重新隐藏一遍');
  }
  checks++;
  if (seededFor({}) !== false) {
    problems.push('口径与文案：真正的新存档（一个隐藏列都没有）被判成「播种过了」'
      + ' —— 那 33 列默认隐藏就再也不会生效');
  }
  g.AE_SETTINGS = keep;

  /*
   * ⑦ 周趋势的「本周大秘境本数」必须和主表那一列同一个定义（**只数大秘境**）。
   *
   * 原来趋势那边是 mythicPlus + mythic + heroic 三者之和，于是同一个号同一周，
   * 主表和导出写 4、趋势写 5 —— 而趋势视图的全部用途就是比较数字。
   * 用合成快照验：一条 Lua，4 大秘境 + 1 史诗 + 2 英雄。
   */
  checks++;
  if (!S.distillForTest) {
    problems.push('口径与文案：history.js 没导出 distillForTest，⑦验不了');
  } else {
    var lua = 'AlterEgoDB = { ["global"] = { ["characters"] = { ["g1"] = { '
      + '["info"] = { ["name"] = "甲", ["realm"] = "服" }, '
      + '["mythicplus"] = { ["numCompletedDungeonRuns"] = { '
      + '["mythicPlus"] = 4, ["mythic"] = 1, ["heroic"] = 2 } } } } } }';
    var d0 = S.distillForTest({ sources: [{ id: 's1', lua: lua }] })['s1/g1'] || {};
    if (d0.runs !== 4) {
      problems.push('口径与文案：趋势里的「本周大秘境本数」算出 ' + d0.runs
        + '，主表那一列只数大秘境（该是 4）—— 两个视图两个数');
    }
    checks++;
    if (d0.runsAll !== 7) {
      problems.push('口径与文案：合计本数算出 ' + d0.runsAll + '，该是 7（4+1+2）');
    }
  }

  /*
   * ⑧ 本地存储写不进去时，必须**说一声**（而且只说一次）。
   *
   * 12 个调用点全都不看 AE.saveSettings 的返回值，所以配额满 / 存储被禁时，
   * 每个开关点下去都生效、下一次刷新全部还原，界面上一个字都没有。
   * 提示放在 saveSettings 自己里，所以这一条直接验那个函数。
   *
   * 注意：脚手架在开头把 AE.saveSettings 换成了空函数（免得测试污染 localStorage），
   * 所以这里要**重新加载 settings.js** 拿到真的那个，跑完再换回空函数。
   */
  var savedStub = S.saveSettings, savedToast = S.toast, realLS = g.localStorage;
  var toasts = [];
  load('app/settings.js');
  g.AE.toast = function (o) { toasts.push(o); };
  g.localStorage = {
    getItem: function () { return null; },
    setItem: function () { throw new Error('QuotaExceededError'); },
    removeItem: function () {}, key: function () { return null; }, length: 0
  };
  var r1 = g.AE.saveSettings({});
  var r2 = g.AE.saveSettings({});
  g.localStorage = realLS;
  g.AE.saveSettings = savedStub;
  g.AE.toast = savedToast;
  checks++;
  if (r1 !== false || r2 !== false) {
    problems.push('口径与文案：localStorage 抛异常时 saveSettings 还返回 '
      + r1 + '/' + r2 + '，该是 false');
  }
  checks++;
  if (toasts.length !== 1) {
    problems.push('口径与文案：本地存储写失败时弹了 ' + toasts.length
      + ' 次提示，该正好 1 次（第一次说清，之后闭嘴）—— '
      + '一次都不弹的话每个开关都会静默失效');
  } else if (!toasts[0].title || !toasts[0].body) {
    problems.push('口径与文案：本地存储写失败的提示没有标题或正文'
      + '（空白提示框等于没提示）');
  }

  console.log(pad('口径与文案')    + (problems.length > before ? '有问题' : '通过')
    + '（' + checks + ' 项：团本列「界面 ⇔ 导出」合成 2 组 + 真实 '
    + (raidLive + raidStale) + ' 格（其中过期残留 ' + raidStale + ' 格）；'
    + '宝库「还需」逐行对差额 ' + vaultLines + ' 行；'
    + 'persist 的键 ' + pk.length + ' 个全在默认表里；'
    + '文案提到的文件 ' + nf.length + ' 个全在包里；'
    + 'SimC 池里 ' + nSimItems + ' 件都有真品质、没有写成 0 的；'
  + '周趋势的「本周大秘境本数」和主表同口径（合成快照 4 大秘境 + 1 史诗 + 2 英雄 → 4））');
})();

// ----------------------------------------------------------------------- 并发池
// fetch-rio.js 的 pool() 有一个**只在缓存全命中时才炸**的坑，本轮实测踩到：
// worker 平时异步回调（发请求），缓存命中时**同步**回调，于是 next() 在同步回调里
// 再调 next()，栈深度跟条目数同阶。`--offline` 跑 3994 个角色到第 1539 个就
// Maximum call stack size exceeded —— 也就是**缓存越全越容易崩**，
// 而「全用缓存」正是这套缓存存在的理由（断点续抓、离线重新产出）。
//
// 这条测试用的条目数 5000 是有来由的：修复前实测崩在第 3384 条，
// 取一个明显超过它的数，才能保证这条断言真的压得到那个坑。
(function () {
  var RIO;
  try { RIO = require('./fetch-rio.js'); } catch (e) {
    problems.push('并发池：require fetch-rio.js 失败：' + e.message);
    console.log(pad('并发池') + '加载失败');
    return;
  }
  if (typeof RIO.pool !== 'function') {
    problems.push('并发池：fetch-rio.js 没有导出 pool()，回归测试压不到东西');
    console.log(pad('并发池') + '没有 pool');
    return;
  }
  // 状态行必须和断言看同一份数据。第一版只看 crashed，结果「done 多调一次」
  // 这个变异明明被 doneCount 断言抓到了（problems 里有、退出码 1），
  // 这一行却照样印「通过」—— 状态行说的和断言查的不是一回事，就是假绿。
  var before = problems.length;
  var N = 5000, checks = 0;

  // 这条测试的力量全在 N 上：修复前实测崩在第 3384 条，N 必须明显超过它。
  // 没有这条下限，以后谁把 N 调小一点，这条断言就会变成一个永远绿的空测试 ——
  // 「不炸栈」在 100 条的时候本来就不炸。
  if (N <= 3384) {
    problems.push('并发池：条目数太少（' + N + '），压不到那个坑'
      + '（修复前实测崩在第 3384 条，N 必须明显大于它）');
  }

  // 甲：同步 worker（= 缓存全命中）。要求走完、顺序不重不漏、done 只调一次。
  var seen = [], doneCount = 0, crashed = null;
  try {
    RIO.pool(new Array(N).join(',').split(',').map(function (_, i) { return i; }),
      1,
      function (it, cb) { seen.push(it); cb(); },
      function () { doneCount++; });
  } catch (e) { crashed = e; }

  if (crashed) {
    problems.push('并发池：同步 worker 跑 ' + N + ' 条崩了（'
      + crashed.message + '），走到第 ' + seen.length + ' 条。'
      + '这正是「缓存全命中导致栈溢出」那个坑');
  } else {
    checks++;
    if (seen.length !== N) {
      problems.push('并发池：同步 worker 只走了 ' + seen.length + ' 条，应该是 ' + N);
    }
    checks++;
    var ordered = true;
    for (var i = 0; i < seen.length; i++) if (seen[i] !== i) { ordered = false; break; }
    if (!ordered) problems.push('并发池：同步 worker 的条目重了或漏了');
    checks++;
    if (doneCount !== 1) {
      problems.push('并发池：同步 worker 的 done 调了 ' + doneCount + ' 次，应该正好 1 次');
    }
  }

  // 乙：异步 worker（= 真发请求）。同一份实现两条路都得对，
  // 否则「修好同步那条、弄坏异步那条」会静默通过。
  var aSeen = 0, aDone = 0;
  RIO.pool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3,
    function (it, cb) { aSeen++; setTimeout(cb, 0); },
    function () { aDone++; });
  // setTimeout 还没跑完，这里只能断言「已经派出去了并发上限那么多」——
  // 派出 3 个正是并发度 3 的意思，派出 10 个就说明并发限制没生效。
  checks++;
  if (aSeen !== 3) {
    problems.push('并发池：并发度 3 应该先派出 3 个 worker，实际派出 ' + aSeen);
  }

  if (checks < 4) problems.push('并发池：只跑到 ' + checks + ' 项检查，测试没跑起来');
  // 括号里印**实测到的数**，不是「应该怎样」的口号。
  // 上一版写死了「不炸栈，done 一次，并发度生效」，结果 done 被调两次时
  // 这行照样自夸「done 一次」—— 断言红了、自述还在说好话，两边数据不同源。
  console.log(pad('并发池')
    + (crashed ? '崩了' : (problems.length > before ? '有问题' : '通过'))
    + '（同步 worker ' + N + ' 条走完 ' + seen.length + '，顺序'
    + (ordered ? '不重不漏' : '有重漏') + '，done ' + doneCount + ' 次，'
    + '并发度 3 实际派出 ' + aSeen + '）');
})();

// ------------------------------------------------------------------- 主表易用性
/*
 * render.js 到这里才第一次在 node 里被真跑 —— 之前整个套件只渲染 bis 面板，
 * 主表的筛选行为（搜索范围 / 空态）零覆盖。
 *
 * 两条盯行为，一条盯持久化：
 *   ① 搜索要能按账号名 / 别名找到人 —— 设置里专门有「账号别名」功能，
 *      搜索范围漏了它的话那个功能等于白做。这种错源码字符串断言盯不住
 *      （「列名写上了但没拼进 hay」长得和正确代码一模一样），所以真调 isVisible。
 *   ② 筛选全空时 #empty-hint 要亮出来、有可见角色时要藏掉。
 *   ③ 周趋势的指标选择（settings.trendMetric）两侧都接上了：defaults 表里
 *      有键（hydrate 只认表内的键），main.js 的 change 监听真的写设置，
 *      history.js 的 render 真的读回。后两条是锚点式检查 —— 那两处代码
 *      要在真实浏览器里才会跑（select 的 options 桩里没有）。
 */
(function () {
  if (!haveScan || !model.characters.length) {
    console.log(pad('主表易用性') + '跳过（没有扫描数据）');
    return;
  }
  var before = problems.length;

  // 渲染主表要的元素 id（桩的 getElementById 只认预建 id；动态建的 tbody 永远
  // 查不到，所以预建一个替身给 applySort 用 —— 行序断言不在这组管）。
  ['grid', 'tbody', 'footer-info', 'scan-time', 'season-info', 'version-info',
   'warnings', 'warning-text', 'warning-close', 'update-banner', 'update-text',
   'update-link', 'update-close', 'empty-hint', 'empty-hint-text'].forEach(function (id) {
    if (!env.byId[id]) { var e2 = stub.makeEl('div'); e2.attrs.id = id; env.byId[id] = e2; }
  });
  g.getComputedStyle = function () { return { getPropertyValue: function () { return ''; } }; };
  g.AE.buildSettingsPanel = g.AE.buildSettingsPanel || function () {};
  if (!load('app/render.js')) { problems.push('主表易用性：render.js 加载失败'); return; }

  var st = g.AE.settingsDefaults();
  var prevSettings = g.AE.state.settings;
  g.AE.state.settings = st;
  st.minLevel = 1;                       // 默认 80 会把低等级角色挡掉，干扰下面的计数
  try {
    g.AE.render(model, st);
  } catch (e) {
    problems.push('主表易用性：AE.render 在桩里崩了 —— ' + e.message);
    g.AE.state.settings = prevSettings;
    return;
  }

  // ① 搜索按账号名 / 别名能找到人
  var ch0 = model.characters[0];
  var checks = 0;
  st.search = String(ch0.sourceName).toLowerCase().slice(0, 6);
  if (!g.AE.isVisible(ch0)) {
    problems.push('主表易用性：搜账号名「' + st.search + '」找不到它自己的角色 '
      + ch0.name + ' —— 账号名不在搜索范围里');
  } else checks++;
  var uniqAlias = '唯一别名_zzzq';
  st.sourceAliases[ch0.sourceId] = uniqAlias;
  st.search = uniqAlias;
  var want = model.characters.filter(function (c) { return c.sourceId === ch0.sourceId; }).length;
  var got = model.characters.filter(function (c) { return g.AE.isVisible(c); }).length;
  if (got !== want) {
    problems.push('主表易用性：搜别名命中的是 ' + got + ' 个角色，该是同账号的 '
      + want + ' 个 —— 别名没有（或错误地）进搜索范围');
  } else checks++;
  st.search = 'zzz-绝对不存在的搜索词';
  if (model.characters.some(function (c) { return g.AE.isVisible(c); })) {
    problems.push('主表易用性：乱搜一个不存在的词还有角色可见');
  } else checks++;

  // ② 空态：全空亮出来（带搜索词），恢复后藏回去
  var hint = env.byId['empty-hint'];
  g.AE.refresh();
  var emptyShown = 0;
  if (hint.style.display === 'none') {
    problems.push('主表易用性：筛选全空时 #empty-hint 没有显示');
  } else {
    emptyShown++;
    var why = (env.byId['empty-hint-text'].textContent || '');
    if (why.indexOf('zzz-绝对不存在的搜索词') < 0) {
      problems.push('主表易用性：空态文案没把搜索词带出来：「' + why + '」');
    }
  }
  st.search = '';
  delete st.sourceAliases[ch0.sourceId];
  g.AE.refresh();
  if (hint.style.display !== 'none') {
    problems.push('主表易用性：有可见角色时 #empty-hint 没有藏回去');
  } else emptyShown++;

  // ③ trendMetric 的两侧
  var dflt = g.AE.settingsDefaults();
  if (typeof dflt.trendMetric !== 'string' || !dflt.trendMetric) {
    problems.push('主表易用性：defaults() 里没有 trendMetric —— hydrate 只认表内的键，'
      + '趋势指标的选择活不过一次刷新（bisLoKind 那个坑的翻版）');
  } else checks++;
  var mainSrc = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
  if (!/s\.trendMetric\s*=\s*trendSel\.value/.test(mainSrc)
      || mainSrc.indexOf('AE.saveSettings(s)') < 0) {
    problems.push('主表易用性：main.js 的 trend-metric 监听没有把选择写进设置');
  } else checks++;
  var histSrc = fs.readFileSync(path.join(ROOT, 'app', 'history.js'), 'utf8');
  if (histSrc.indexOf('trendMetric') < 0) {
    problems.push('主表易用性：history.js 没有读回 trendMetric —— 选择存了但打开时不恢复');
  } else checks++;

  // ④ 周趋势跟随主表筛选：隐藏一个账号，趋势的候选 key 就少那一批
  //    （trendVisibleKeys 是纯函数，不需要快照就能验「少几行」这件事）。
  var trendN = 0;
  var tk = g.AE.trendVisibleKeys(model, st);
  var wantVis = model.characters.filter(function (c) { return g.AE.isVisible(c); }).length;
  if (Object.keys(tk).length !== wantVis) {
    problems.push('主表易用性：趋势候选 ' + Object.keys(tk).length + ' 个，和主表可见的 '
      + wantVis + ' 个对不上');
  } else trendN++;
  var hideSrc = model.characters[0].sourceId;
  var hideN = model.characters.filter(function (c) { return c.sourceId === hideSrc; }).length;
  if (hideN < model.characters.length) {         // 全在同一个源的话这半条没意义
    st.hiddenSources[hideSrc] = true;
    var tk2 = g.AE.trendVisibleKeys(model, st);
    if (Object.keys(tk2).length !== wantVis - hideN || tk2[model.characters[0].key]) {
      problems.push('主表易用性：隐藏账号后趋势候选是 ' + Object.keys(tk2).length
        + ' 个，该是 ' + (wantVis - hideN) + ' 个 —— 趋势没有跟随主表筛选');
    } else trendN++;
    delete st.hiddenSources[hideSrc];
  } else trendN++;

  // ⑤ 在线拉取（第 22 轮）：点击才联网 —— 远端地址必须只活在闭包变量里，
  //    写进 settings 的话任何一次 saveSettings 都会把它落盘，下次启动就成了
  //    「程序主动联网」。另外数据全局必须真被清掉，否则 loadDataFile 一句
  //    「已加载」直接短路，按钮等于没按。这里真点（bisOnlineUpdate）：
  //    桩里远端 <script> 的 onload 不触发，加载链停在 gearLoading —— 但那
  //    正是套件末尾，后面的节全是静态检查，不吃 AE.state。
  var onlineN = 0;
  var urlBefore = st.remoteDataUrl;
  g.AE.bisOnlineUpdate();
  if (st.remoteDataUrl !== urlBefore) {
    problems.push('主表易用性：在线拉取把远端地址写进了 settings.remoteDataUrl —— '
      + '下次启动会主动去连它，违背「点击才联网」');
  } else onlineN++;
  if (g.AE_BIS !== undefined || g.AE_SIMC !== undefined) {
    problems.push('主表易用性：在线拉取没有清掉已加载的数据全局 —— '
      + 'loadDataFile 会认为已加载而根本不拉');
  } else onlineN++;

  // bis 渲染检查共用 AE.state.settings（那个空对象），换回来别弄脏后面的断言。
  g.AE.state.settings = prevSettings;

  console.log(pad('主表易用性') + (problems.length > before ? '有问题' : '通过')
    + '（搜索按账号名 / 别名找到人 ' + checks + ' 项，空态亮 / 灭 '
    + emptyShown + '/2，趋势指标持久化两侧 ' + (checks >= 6 ? 3 : 0)
    + ' 项，趋势跟随主表筛选 ' + trendN + ' 项，在线拉取不落盘 ' + onlineN + ' 项）');
})();

// ------------------------------------------------------------------- 打包一致性
// tools/ 是被**整个目录递归复制**进发布包的，.gitignore 管不到它。
// 所以任何**测试专用**的工具都必须写进 build-release.ps1 的 $dropFromPkg，
// 否则用户解开 zip 会拿到一个跑不起来的脚本。这一条以前靠我记着，记漏过。
//
// 判据有两条，缺一不可：
//   1. **真的 require 了**测试脚手架（run-tests.js / dom-stub.js）；
//   2. 文件名是 mutate-*.js —— 变异测试一律是测试专用。
// 第 2 条是补的：mutate-decode.js 跑的是 verify-talent-decode.js，
// 一个字都没提脚手架，于是第 1 条漏掉了它，守卫报「4 个」而实际有 5 个。
// **注意 verify-*.js 不算测试专用** —— 那几个是随包发布的、用户能自己跑的校验器。
//
// 第 1 条原先写的是 indexOf('run-tests.js') >= 0，也就是「源码里提到这个名字」。
// 太松了：我在 decode-talent-string.js 的注释里写了一句「run-tests.js 用它的
// toBits() 读串头」，守卫立刻把它判成测试专用，要求加进 $dropFromPkg。
// 而那是**错的**，加进去会砸掉发布包 —— 见下面「随包工具的依赖不许被丢掉」那条。
// 改成只认真正的 require()：注释怎么写都不影响判定。
(function () {
  var HARNESS = ['run-tests.js', 'dom-stub.js', 'check-anchors.js'];
  // require('./x.js') / require("./x") / path.join(__dirname, 'x.js') 都算真依赖；
  // 出现在注释或字符串说明里的不算。
  function requiresHarness(src, self) {
    return HARNESS.some(function (h) {
      if (h === self) return false;
      var base = h.replace(/\.js$/, '');
      var re = new RegExp('require\\(\\s*[\'"]\\./' + base + '(\\.js)?[\'"]\\s*\\)');
      return re.test(src);
    });
  }
  var ps = path.join(ROOT, 'tools', 'build-release.ps1');
  if (!fs.existsSync(ps)) { console.log(pad('打包一致性') + '跳过（没有 build-release.ps1）'); return; }
  var txt = fs.readFileSync(ps, 'utf8');
  var blk = /\$dropFromPkg\s*=\s*@\(([\s\S]*?)\)/.exec(txt);
  if (!blk) { problems.push('build-release.ps1 里找不到 $dropFromPkg，打包一致性检查没跑起来'); return; }
  var listed = {};
  // Most entries are string literals. mutate-lock stays last and is expressed
  // with Join-Path so mutate-pkg can replace an earlier literal without also
  // corrupting this safety-net entry.
  (blk[1].match(/'tools\\([^']+)'/g) || []).forEach(function (s) {
    listed[/'tools\\([^']+)'/.exec(s)[1]] = 1;
  });
  (blk[1].match(/Join-Path\s+'tools'\s+'([^']+)'/g) || []).forEach(function (s) {
    listed[/Join-Path\s+'tools'\s+'([^']+)'/.exec(s)[1]] = 1;
  });
  var need = [], miss = [];
  fs.readdirSync(path.join(ROOT, 'tools')).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    var src = fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8');
    var uses = requiresHarness(src, f);
    var isMutant = /^mutate-.*\.js$/.test(f);
    if (!uses && !isMutant && HARNESS.indexOf(f) < 0) return;
    need.push(f);
    if (!listed[f]) miss.push(f);
  });
  if (need.length < 2) problems.push('只找到 ' + need.length + ' 个依赖脚手架的工具，打包一致性检查没跑起来');
  miss.forEach(function (f) {
    problems.push('tools/' + f + ' 依赖测试脚手架，但没写进 build-release.ps1 的 $dropFromPkg，会被打进发布包');
  });

  // 反过来的那一半，比上面那半更危险，所以必须也有断言。
  //
  // 上面只管「该踢的有没有踢」。但**踢错**是静默的：名单里多写一个文件，
  // zip 照样打得出来、测试照样全绿，只有用户解开包去跑校验器时才会
  // 「Cannot find module」。本地永远复现不了，因为本地那个文件在。
  //
  // 实际差点发生：decode-talent-string.js 被 verify-talent-decode.js 和
  // fetch-talent-truth.js 两个**随包发布**的工具 require；守卫（当时判据太松，
  // 连注释里提一句 run-tests.js 都算）把它报成「测试专用」，而顺手加进名单
  // 就会打出一个校验器直接崩掉的发布包。
  //
  // 判据：随包工具 require 的本地文件，一个都不许出现在 $dropFromPkg 里。
  var shipped = [], wrongDrop = [];
  fs.readdirSync(path.join(ROOT, 'tools')).forEach(function (f) {
    if (!/\.js$/.test(f) || need.indexOf(f) >= 0) return;   // need = 测试专用的那批
    shipped.push(f);
    var src = fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8');
    (src.match(/require\('\.\/([^']+)'\)/g) || []).forEach(function (r) {
      var dep = /require\('\.\/([^']+)'\)/.exec(r)[1];
      if (!/\.js$/.test(dep)) dep += '.js';
      if (listed[dep]) {
        wrongDrop.push('tools/' + dep + ' 被随包发布的 tools/' + f
          + ' require，却写进了 $dropFromPkg —— 发布包里那个校验器会因为找不到它而崩');
      }
    });
  });
  // 缓存**目录**同理，而且更容易漏：文件名单和目录名单是两个变量，
  // 我这一轮加 tools/.rio-raw/（1.9 MB 的角色 profile 缓存）时就只改了 .gitignore。
  // 判据：.gitignore 里每一个 tools/.xxx/ 都必须出现在 $dropDirsFromPkg 里。
  // 用 .gitignore 当事实来源，而不是我在这里再抄一份名单 —— 抄的那份会过期。
  var dirMiss = [], dirNeed = [];
  var gi = path.join(ROOT, '.gitignore');
  var dblk = /\$dropDirsFromPkg\s*=\s*@\(([\s\S]*?)\)/.exec(txt);
  if (!fs.existsSync(gi)) {
    problems.push('找不到 .gitignore，缓存目录的打包检查没跑起来');
  } else if (!dblk) {
    problems.push('build-release.ps1 里找不到 $dropDirsFromPkg，缓存目录的打包检查没跑起来');
  } else {
    var dListed = {};
    (dblk[1].match(/'tools\\([^']+)'/g) || []).forEach(function (s) {
      dListed[/'tools\\([^']+)'/.exec(s)[1]] = 1;
    });
    fs.readFileSync(gi, 'utf8').split(/\r?\n/).forEach(function (ln) {
      var m = /^tools\/(\.[^\/\s]+)\/\s*$/.exec(ln.trim());
      if (!m) return;
      dirNeed.push(m[1]);
      if (!dListed[m[1]]) dirMiss.push(m[1]);
    });
    if (dirNeed.length < 2) {
      problems.push('只从 .gitignore 里认出 ' + dirNeed.length + ' 个 tools/ 缓存目录，这项检查没跑起来');
    }
    dirMiss.forEach(function (d) {
      problems.push('tools/' + d + '/ 在 .gitignore 里，但没写进 build-release.ps1 的 $dropDirsFromPkg'
        + '，会被整个打进发布包（tools/ 是从磁盘递归复制的，.gitignore 管不到）');
    });
  }

  // 反向检查的空转守卫：随包工具一个都没认出来的话，上面那段循环等于没跑。
  // 加这条是因为它的形状和「跳过报成通过」完全一样 —— 判据一写错（比如 need
  // 把整个 tools/ 都算成测试专用），shipped 就会空掉，循环一次不跑却照样全绿。
  if (shipped.length < 3) {
    problems.push('只认出 ' + shipped.length + ' 个随包发布的 tools 脚本，'
      + '「随包依赖不许进 $dropFromPkg」这条检查等于没跑');
  }
  wrongDrop.forEach(function (m2) { problems.push(m2); });

  // 摘要行必须把三类问题都算进去。第一版只看 miss/dirMiss，于是我注入
  // 「把随包依赖加进名单」这个变异体时，problems 里红了两条、这一行却照印
  // 「通过」—— 只看摘要的人会以为没事。摘要和断言必须同源。
  console.log(pad('打包一致性') + (miss.length || dirMiss.length || wrongDrop.length
      ? (miss.length + dirMiss.length + wrongDrop.length) + ' 个会被误打包或误踢出（'
        + miss.length + ' 个脚本漏踢，' + dirMiss.length + ' 个缓存目录漏踢，'
        + wrongDrop.length + ' 个随包依赖被误踢）'
      : '通过（' + need.length + ' 个测试专用脚本 + ' + dirNeed.length
        + ' 个缓存目录全在名单里，' + shipped.length + ' 个随包脚本的依赖没被误踢）'));
})();

// ------------------------------------------------------- 变异测试的锚点还活着吗
// 跑一轮变异测试要十几分钟，所以平时不跑；但「锚点烂了」是纯文本问题，
// 查一遍不到一秒。而锚点烂掉 = **那条断言根本没在验**，
// 变异测试还会安静地报「抓到」（触发的是别的断言）。
// 第 20 轮它当场抓到两条空转一整轮的断言，和一个匹配两次的锚点。
(function () {
  var script = path.join(ROOT, 'tools', 'check-anchors.js');
  if (!fs.existsSync(script)) { console.log(pad('变异锚点') + '跳过（没有 check-anchors.js）'); return; }
  var cp = require('child_process');
  var r = cp.spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  var out = (r.stdout || '') + (r.stderr || '');
  var m = /合计 (\d+) 个锚点，坏 (\d+)/.exec(out);
  if (!m) {
    problems.push('check-anchors.js 没给出「合计 N 个锚点，坏 M」那一行 —— 它自己坏了？');
    console.log(pad('变异锚点') + '读不出结果');
    return;
  }
  var total = Number(m[1]), bad = Number(m[2]);
  // 下界：锚点总数不该突然掉下来（那意味着抽取逻辑认不出结构了，
  // 而「认不出」会安静地报 0 坏）。实测 100 个。
  if (total < 80) {
    problems.push('只认出 ' + total + ' 个变异锚点（实测 100），check-anchors 的抽取逻辑没跑全');
  }
  if (bad) {
    out.split('\n').filter(function (l) { return l.indexOf('✗') >= 0; })
      .slice(0, 6).forEach(function (l) { problems.push('变异锚点坏了：' + l.trim()); });
  }
  console.log(pad('变异锚点') + (bad ? '有问题' : '通过')
    + '（' + total + ' 个锚点，坏 ' + bad + ' —— 坏锚点等于那条断言没在验）');
}());

// ----------------------------------------------------------------------- 汇总

console.log('');
if (failures.length) {
  console.log('失败的测试：');
  failures.forEach(function (f) { console.log('  · ' + f); });
}
if (problems.length) {
  console.log('渲染 / 格式问题：');
  problems.slice(0, 20).forEach(function (p) { console.log('  · ' + p); });
}

var bad = total.fail + problems.length;
console.log(bad === 0
  ? '全部通过：' + total.pass + ' 项测试 + 装备渲染 + 天赋树渲染 + SimC 天赋配置'
    + ' + 无障碍 + 四项格式校验 + 天赋串解码对真值 + 并发池 + 打包一致性 + 变异锚点'
  : '有问题：' + total.fail + ' 项测试失败，' + problems.length + ' 个渲染/格式问题');
process.exit(bad === 0 ? 0 : 1);
