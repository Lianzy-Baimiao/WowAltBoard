/*
 * WowAltBoard - tools/fetch-simc.js
 *
 * 把 SimulationCraft 仓库里的默认配置（profiles/MID2/*.simc）转成 app/simc-data.js：
 * 每个专精一套「模拟器默认穿什么 + 点什么天赋」。装备页的「模拟配装」视角和
 * 天赋页的「SimC 配置」那一块都读它。
 *
 * 为什么是这一份
 * --------------
 * 2026-10-23 换数据源时逐个核对过候选：只有 SimC 的 profiles 是**开源许可（GPL-3.0）
 * + 机器可读 + 跟着版本更新**三样都占的。每个部位是一行
 * `head=名字,id=…,bonus_id=…,ilevel=…,gem_id=…,enchant_id=…`，物品 / 附魔 / 宝石都是编号，
 * 不用解析网页。
 *
 * 它**是什么、不是什么**（面板上的说法照这里写）：
 *   · 是：SimC 维护者为每个专精配好、拿来跑默认模拟的那一套装备和天赋；
 *   · 不是：编辑排的 BiS 榜，也不是使用率统计 —— 每个部位只有一件，没有名次、没有样本量；
 *   · 不分团本 / 大秘境，同一套。
 * 覆盖：MID2 实测 47 个文件、29/40 个专精（有的专精按英雄天赋各一份）。SimC 不模拟治疗，
 * 7 个治疗专精没有；唤魔师和平衡 / 守护德鲁伊这一档也没有。面板对这些专精退回实战分布。
 *
 * 许可
 * ----
 * 产物是 SimC 配置文件的衍生数据，按 GPL-3.0 发布：文件头和 docs/LICENSE-simulationcraft.md
 * 写明来源仓库和提交号。看板其余代码仍是 MIT。
 *
 * 用法
 * ----
 *   node tools\fetch-simc.js                    # 查最新提交，缺的文件补下，生成
 *   node tools\fetch-simc.js --offline          # 只用 tools\.simc-raw\ 里已经下好的那一份
 *   node tools\fetch-simc.js --tier MID2 --branch midnight
 *   node tools\fetch-simc.js --proxy ''         # 直连 GitHub（默认走 127.0.0.1:7897）
 */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');

var DECODE = require('./decode-talent-string.js');

var ROOT = path.resolve(__dirname, '..');
var CACHE = path.join(__dirname, '.simc-raw');
var DB2_DIR = path.join(__dirname, '.db2-names');
var OUT = path.join(ROOT, 'app', 'simc-data.js');
var RIO_JS = path.join(ROOT, 'app', 'rio-data.js');
var REPO = 'simulationcraft/simc';
var argv = process.argv.slice(2);
function flag(n) { return argv.indexOf(n) >= 0; }
function opt(n, d) { var i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; }

var TIER = opt('--tier', 'MID2');
var BRANCH = opt('--branch', 'midnight');
// GitHub 这台机器直连时通时不通（2026-10-21 起 443 多次超时），所以默认走本机代理。
// wago.tools 直连是好的，那两张 DB2 表不走代理。
var PROXY = opt('--proxy', 'http://127.0.0.1:7897');
var OFFLINE = flag('--offline');
// 这份对照表的来历见下面 loadBonusMap。
var BONUS_LUA = opt('--bonus-lua',
  'E:\\World of Warcraft\\_retail_\\Interface\\AddOns\\BonusRollConfirm\\RewardPreview.lua');

// -------------------------------------------------------------------- 网络

/** https GET；proxy 非空时走 CONNECT 隧道（Node 自带的 https 不认 http_proxy）。 */
function get(url, proxy, cb) {
  var done = false;
  function fin(e, code, body) { if (!done) { done = true; cb(e, code, body); } }
  var u = new URL(url);
  var headers = { 'User-Agent': 'WowAltBoard-simc-fetch', Accept: '*/*' };
  function collect(res) {
    var cs = [];
    res.on('data', function (c) { cs.push(c); });
    res.on('end', function () { fin(null, res.statusCode, Buffer.concat(cs)); });
    res.on('error', fin);
  }
  if (!proxy) {
    var req = https.get({ host: u.hostname, path: u.pathname + u.search, headers: headers }, collect);
    req.setTimeout(60000, function () { req.destroy(new Error('timeout')); });
    req.on('error', fin);
    return;
  }
  var p = new URL(proxy);
  var creq = http.request({ host: p.hostname, port: p.port || 80, method: 'CONNECT',
    path: u.hostname + ':443' });
  creq.setTimeout(30000, function () { creq.destroy(new Error('proxy timeout')); });
  creq.on('connect', function (res, socket) {
    if (res.statusCode !== 200) { fin(new Error('CONNECT ' + res.statusCode)); return; }
    var req2 = https.get({ socket: socket, agent: false, servername: u.hostname,
      host: u.hostname, path: u.pathname + u.search, headers: headers }, collect);
    req2.setTimeout(60000, function () { req2.destroy(new Error('timeout')); });
    req2.on('error', fin);
  });
  creq.on('error', fin);
  creq.end();
}

/**
 * 只认 200。4xx **不重试**：那是「问错了」（tier 名写错 = 404，未登录配额用完 = 403），
 * 重试只会把配额烧得更快。5xx / 网络错误重试两次。
 */
function getOk(url, proxy, cb, tries) {
  tries = tries == null ? 3 : tries;
  get(url, proxy, function (e, code, body) {
    if (!e && code === 200) { cb(null, body); return; }
    var why = e ? e.message : ('HTTP ' + code);
    if ((e || code >= 500) && tries > 1) {
      setTimeout(function () { getOk(url, proxy, cb, tries - 1); }, 2000);
      return;
    }
    cb(new Error(why + '　' + url));
  });
}

function getJson(url, cb) {
  getOk(url, PROXY, function (e, body) {
    if (e) { cb(e); return; }
    try { cb(null, JSON.parse(body.toString('utf8'))); }
    catch (x) { cb(new Error('不是 JSON：' + url)); }
  });
}

/** 有限并发跑一批任务；任何一个失败就整体失败（缺一个文件的快照不能当完整的用）。 */
function pool(items, n, worker, done) {
  var i = 0, active = 0, finished = 0, failed = false;
  if (!items.length) { done(null); return; }
  function next() {
    while (!failed && active < n && i < items.length) {
      var it = items[i++];
      active++;
      worker(it, function (e) {
        active--; finished++;
        if (failed) return;
        if (e) { failed = true; done(e); return; }
        if (finished === items.length) { done(null); return; }
        next();
      });
    }
  }
  next();
}
// ------------------------------------------------------------ 配置文件快照

/*
 * 先问「profiles/<TIER> 最近一次提交是哪个」，再把目录列表和每个文件都**钉在那个提交上**取。
 * 按分支名取的话，47 个文件下到一半上游推一次，产物里会混着两个版本。
 *
 * GitHub API 未登录每小时 60 次，所以 API 只用两次（提交 + 目录列表）；
 * 文件走 raw.githubusercontent.com，不占那个配额。提交号就是缓存键：
 * 同一个提交下的文件不会变，下过的不再下。
 */
function snapshot(cb) {
  var cur = path.join(CACHE, 'current.json');
  if (OFFLINE) {
    if (!fs.existsSync(cur)) { cb(new Error('--offline 但 tools/.simc-raw/ 里还没有快照')); return; }
    var meta = JSON.parse(fs.readFileSync(cur, 'utf8'));
    cb(null, meta, path.join(CACHE, meta.sha));
    return;
  }
  var api = 'https://api.github.com/repos/' + REPO;
  getJson(api + '/commits?path=profiles/' + encodeURIComponent(TIER) + '&sha='
    + encodeURIComponent(BRANCH) + '&per_page=1', function (e, list) {
    if (e) { cb(e); return; }
    if (!list.length) { cb(new Error('profiles/' + TIER + ' 在 ' + BRANCH + ' 上没有提交 —— tier 名写错了？')); return; }
    var c = list[0];
    var meta = {
      sha: c.sha, date: String(c.commit.committer.date).slice(0, 10),
      message: String(c.commit.message).split('\n')[0], tier: TIER, branch: BRANCH
    };
    getJson(api + '/contents/profiles/' + encodeURIComponent(TIER) + '?ref=' + c.sha, function (e2, items) {
      if (e2) { cb(e2); return; }
      meta.files = items.filter(function (it) { return it.type === 'file' && /\.simc$/.test(it.name); })
        .map(function (it) { return it.name; }).sort();
      if (!meta.files.length) { cb(new Error('profiles/' + TIER + ' 下没有 .simc 文件')); return; }
      var dir = path.join(CACHE, meta.sha);
      fs.mkdirSync(dir, { recursive: true });
      var need = meta.files.filter(function (f) { return !fs.existsSync(path.join(dir, f)); });
      console.log('  SimC ' + TIER + ' @ ' + meta.sha.slice(0, 7) + '（' + meta.date + '）　'
        + meta.files.length + ' 个文件，要下 ' + need.length + ' 个');
      pool(need, 4, function (f, done) {
        // 文件名里有撇号（San'layn）；encodeURIComponent 不转它，raw 那边认 %27。
        var url = 'https://raw.githubusercontent.com/' + REPO + '/' + meta.sha + '/profiles/'
          + encodeURIComponent(TIER) + '/' + encodeURIComponent(f).replace(/'/g, '%27');
        getOk(url, PROXY, function (e3, body) {
          if (e3) { done(e3); return; }
          fs.writeFileSync(path.join(dir, f), body);
          done(null);
        });
      }, function (e4) {
        if (e4) { cb(e4); return; }
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
        fs.writeFileSync(cur, JSON.stringify(meta, null, 1));
        cb(null, meta, dir);
      });
    });
  });
}
// --------------------------------------------------------- 中文名（DB2）

/*
 * 物品 / 宝石的中文名和品质、附魔的中文名，都从暴雪 DB2 拿（wago.tools 导出，直连）。
 * ItemSparse.csv 和 fetch-rio.js 共用同一份缓存（tools/.db2-names/，已 gitignore）。
 */
var TABLES = {
  item: { file: 'ItemSparse.csv', url: 'https://wago.tools/db2/ItemSparse/csv?locale=zhCN',
    cols: ['Display_lang', 'OverallQualityID'] },
  ench: { file: 'SpellItemEnchantment.csv', url: 'https://wago.tools/db2/SpellItemEnchantment/csv?locale=zhCN',
    cols: ['Name_lang'] }
};

/** 拆一行 CSV，认引号里的逗号（和 fetch-rio.js 那份一样）。 */
function splitCsv(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 只取要的那些 id。返回 {map: {id: [列值…]}, missed: [id…]}。列按表头找，不写死下标。 */
function readTable(t, ids) {
  var txt = fs.readFileSync(path.join(DB2_DIR, t.file), 'utf8');
  var nl = txt.indexOf('\n');
  var head = splitCsv(txt.slice(0, nl).replace(/\r$/, ''));
  if (head[0] !== 'ID') throw new Error(t.file + ' 第一列不是 ID —— 上游改了表头');
  var idx = t.cols.map(function (c) {
    var k = head.indexOf(c);
    if (k < 0) throw new Error(t.file + ' 里找不到 ' + c + ' 列 —— 上游改了表头');
    return k;
  });
  var want = {};
  ids.forEach(function (id) { want[String(id)] = 1; });
  var map = {}, pos = nl + 1;
  while (pos < txt.length) {
    var end = txt.indexOf('\n', pos);
    if (end < 0) end = txt.length;
    var comma = txt.indexOf(',', pos);
    // 快路：先只看第一个逗号前的 id，绝大多数行在这里就跳掉了。
    if (comma > pos && comma < end && want[txt.slice(pos, comma)]) {
      var f = splitCsv(txt.slice(pos, end).replace(/\r$/, ''));
      map[f[0]] = idx.map(function (k) { return f[k]; });
    }
    pos = end + 1;
  }
  return { map: map, missed: ids.filter(function (id) { return !map[String(id)]; }) };
}
function downloadTable(t, cb) {
  fs.mkdirSync(DB2_DIR, { recursive: true });
  process.stdout.write('  下 ' + t.file + '…');
  getOk(t.url, '', function (e, body) {
    if (e) { console.log(' 失败'); cb(e); return; }
    var p = path.join(DB2_DIR, t.file);
    fs.writeFileSync(p + '.part', body);
    fs.renameSync(p + '.part', p);
    console.log(' 好，' + (body.length / 1024 / 1024).toFixed(2) + ' MB');
    cb(null);
  });
}

/*
 * 表不在就下；在但缺 id、而且已经超过一天，就重下一次再对 —— 新补丁的新装备在旧表里没有，
 * 只看「文件在不在」的话，那几件在面板上就永远没有中文名，也没人知道为什么。
 */
function lookup(kind, ids, cb) {
  var t = TABLES[kind], p = path.join(DB2_DIR, t.file);
  function run(fresh) {
    var res = readTable(t, ids);
    var age = (Date.now() - fs.statSync(p).mtimeMs) / 86400000;
    if (res.missed.length && !fresh && !OFFLINE && age > 1) {
      console.log('  ' + t.file + ' 缺 ' + res.missed.length + ' 个 id，表已经 ' + Math.floor(age) + ' 天了，重下');
      downloadTable(t, function (e) { cb(null, e ? res : readTable(t, ids)); });
      return;
    }
    cb(null, res);
  }
  if (fs.existsSync(p)) { run(false); return; }
  if (OFFLINE) { cb(new Error('缺 tools/.db2-names/' + t.file + '，而且是 --offline')); return; }
  downloadTable(t, function (e) { if (e) cb(e); else run(true); });
}

// ------------------------------------------------------------ 装等对照表

/*
 * 装等只有 340/738 行写在 `ilevel=` 里，剩下的藏在 bonus_id 里 —— 那些编号指向 ItemBonus
 * 的曲线表（Type 34/49），这里不重算曲线。能确定的是「升级轨道顶格」那几个编号：
 * BonusRollConfirm 插件的 RewardPreview.lua 有一张 装等 → bonusID 表（305/318/334/344）。
 * 拿 SimC 自己的数据核过：同时写了 ilevel 和这几个编号的 89 行里 83 行一致，
 * 不一致的 6 行全是 `ilevel=` 改写过的（SimC 的规矩是 ilevel 压过 bonus_id），
 * 所以优先级是 ilevel > 这张表。没写 ilevel 的 398 行里这张表能定 342 行；
 * 剩下 56 行是制造装备（装等跟着品质走），这里留空，面板借本机实测数据并标明来源。
 */
function loadBonusMap(file) {
  var out = {};
  if (!fs.existsSync(file)) return out;
  var re = /\[(\d{3})\]\s*=\s*(\d{4,6})/g, m;
  var txt = fs.readFileSync(file, 'utf8');
  while ((m = re.exec(txt))) out[m[2]] = Number(m[1]);
  return out;
}
// -------------------------------------------------------------- 解析

// SimC 的部位名 → 暴雪 INVSLOT（和 app/bis-data.js、app/rio-data.js 同一套编号）。
var SLOT_MAP = {
  head: 1, neck: 2, shoulders: 3, chest: 5, waist: 6, legs: 7, feet: 8, wrists: 9,
  hands: 10, finger1: 11, finger2: 12, trinket1: 13, trinket2: 14, back: 15,
  main_hand: 16, off_hand: 17
};
// crafted_stats 里的数字是暴雪 ITEM_MOD 编号。拿 ItemSparse 的 StatModifier_bonusStat
// 和 app/bis-data.js 里已知副属性的装备对过：32 暴击、36 急速、40 全能、49 精通，六种组合全对得上。
var STAT_ID = { 32: 'crit', 36: 'haste', 40: 'versatility', 49: 'mastery' };
// 文件第一条赋值是 `<职业>="<名字>"`，靠这张表认出来。
var CLASSES = ['deathknight', 'demonhunter', 'druid', 'evoker', 'hunter', 'mage', 'monk',
  'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior'];

/** 一个 .simc 文件 → {cls, name, spec, talents, gear: {部位名: {字段…}}}。动作列表不看。 */
function parseProfile(text) {
  var out = { cls: '', name: '', spec: '', talents: '', gear: {} };
  String(text).split(/\r?\n/).forEach(function (ln) {
    var m = /^([a-z0-9_]+)=(.*)$/.exec(ln.trim());
    if (!m) return;
    var k = m[1], v = m[2];
    if (!out.cls && CLASSES.indexOf(k) >= 0) { out.cls = k; out.name = v.replace(/^"|"$/g, ''); }
    else if (k === 'spec') out.spec = v;
    else if (k === 'talents') out.talents = v;
    else if (SLOT_MAP[k]) out.gear[k] = parseGear(v);
  });
  return out;
}

/** `名字,id=…,bonus_id=a/b,…` → {token, id, bonus[], ilevel, gems[], enchantId, enchant, embellishment, crafted[]}。 */
function parseGear(v) {
  var parts = String(v).split(',');
  var g = { token: parts[0], id: 0, bonus: [], ilevel: 0, gems: [], enchantId: 0, enchant: '',
    embellishment: '', crafted: [] };
  parts.slice(1).forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i < 0) return;
    var k = kv.slice(0, i), val = kv.slice(i + 1);
    var nums = function () { return val.split('/').map(Number).filter(function (n) { return n > 0; }); };
    if (k === 'id') g.id = Number(val) || 0;
    else if (k === 'bonus_id') g.bonus = nums();
    else if (k === 'ilevel') g.ilevel = Number(val) || 0;
    else if (k === 'gem_id') g.gems = nums();
    else if (k === 'enchant_id') g.enchantId = Number(val) || 0;
    else if (k === 'enchant') g.enchant = val;
    else if (k === 'embellishment') g.embellishment = val;
    else if (k === 'crafted_stats') g.crafted = nums();
  });
  return g;
}
/**
 * 一个部位 → 产物里的形状。空字段不写。
 * 装等：写了 ilevel= 就用它（s='c'）；没写就查 bonus_id 对照表（s='b'，b 记是哪个编号）；
 * 都没有留空 —— 不猜。
 */
function slotRow(g, bonusMap) {
  var r = { i: g.id }, warn = [];
  if (g.ilevel) { r.v = g.ilevel; r.s = 'c'; }
  else {
    var lv = {};
    g.bonus.forEach(function (b) { if (bonusMap[b]) lv[bonusMap[b]] = b; });
    var keys = Object.keys(lv);
    if (keys.length === 1) { r.v = Number(keys[0]); r.s = 'b'; r.b = lv[keys[0]]; }
    else if (keys.length > 1) warn.push('bonus_id 里有两档装等（' + keys.join(' / ') + '），不挑');
  }
  if (g.enchantId) r.e = g.enchantId;
  else if (g.enchant) r.t = g.enchant;
  if (g.gems.length) r.g = g.gems;
  if (g.embellishment) r.m = g.embellishment;
  var cs = [];
  g.crafted.forEach(function (n) {
    if (STAT_ID[n]) cs.push(STAT_ID[n]);
    else warn.push('crafted_stats 里有不认识的属性编号 ' + n);
  });
  if (cs.length) r.c = cs;
  return { row: r, warn: warn };
}

/**
 * DB2 的附魔中文名带游戏内嵌的品质图标：`附魔戒指 - 鹰眼神视|A:Professions-ChatIcon-Quality-12-Tier2:20:20|a`。
 * 拆成 {n 名字, q 品质档（Tier 后面那个数，没有就 0）}，网页没有那套贴图。
 * 少数名字是运行时模板（`+$k2 敏捷/力量 &+$k1 耐力`、`+$457616s1% 法力值`）：$ 开头的是游戏
 * 现算的数，这里拿不到，连同跟着的 % 一起删掉，不编数字。
 */
function cleanEnchant(raw) {
  var s = String(raw || '');
  var m = /Quality-\d+-Tier(\d)/.exec(s);
  s = s.replace(/\|A:[^|]*\|a/g, '').replace(/\$[a-z]?\d+[a-z]?\d*%?/gi, '').replace(/\+\s+/g, '+')
    .replace(/\s*&\s*/g, '，').trim();
  return { n: s, q: m ? Number(m[1]) : 0 };
}

/** raider.io 物品池（app/rio-data.js）里的图标名：有就直接用，没有的交给 fetch-icons.js 去查。 */
function rioItems() {
  if (!fs.existsSync(RIO_JS)) return {};
  var g = {}; g.window = g;
  new Function('window', fs.readFileSync(RIO_JS, 'utf8'))(g); // eslint-disable-line no-new-func
  return (g.AE_RIO && g.AE_RIO.items) || {};
}
// -------------------------------------------------------------- 生成

/**
 * 快照 → 产物对象（不含 items / ench 的中文名，那一步在 finish 里查 DB2）。
 * problems 是要停下来的错（产物不写），warns 只报。
 */
function build(meta, dir, bonusMap) {
  var order = DECODE.loadOrder(), TREE = DECODE.loadTree();
  if (!order || !TREE) throw new Error('缺 app/talent-tree.js —— 先跑 node tools\\fetch-talent-tree.js');
  var problems = [], warns = [], specs = {}, itemIds = {}, enchIds = {};
  meta.files.forEach(function (f) {
    var p = parseProfile(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!p.talents) { problems.push(f + '：没有 talents= 行'); return; }
    // 专精从**串头**认（和 fetch-rio / fetch-wcl 一个规矩），再和文件里写的职业 / 专精对一遍。
    var d = DECODE.decode(p.talents, order);
    if (d.err || !d.clean) {
      problems.push(f + '：天赋串解不干净（' + (d.err || ('跨专精 ' + d.crossSpec + ' / 超上限 ' + d.overMax))
        + '）—— 多半是 app/talent-tree.js 比 SimC 旧，先重跑 fetch-talent-tree.js');
      return;
    }
    if (d.ver !== 2) { problems.push(f + '：串头版本是 ' + d.ver + '，游戏只认 2'); return; }
    var sp = TREE.specs[String(d.spec)];
    var tok = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); };
    if (!sp || tok(sp.cls) !== tok(p.cls) || tok(sp.specEn) !== tok(p.spec)) {
      problems.push(f + '：串头是 specID ' + d.spec + '（' + (sp ? sp.cls + ' ' + sp.specEn : '树里没有')
        + '），文件里写的是 ' + p.cls + ' / ' + p.spec);
      return;
    }
    // 点数只算花点买的本专精节点；英雄子树按「有没有花点」认（选树那个节点本身不在子树里）。
    var pts = 0, subs = {};
    d.nodes.forEach(function (n) {
      if (!n.purchased || !n.inSpec) return;
      pts += n.rank;
      var row = TREE.nodes[n.id];
      if (row && row[6]) subs[row[6]] = 1;
    });
    var slots = {};
    Object.keys(p.gear).forEach(function (k) {
      var g = p.gear[k];
      if (!g.id) { problems.push(f + ' ' + k + '：没有 id='); return; }
      var sr = slotRow(g, bonusMap);
      sr.warn.forEach(function (w) { warns.push(f + ' ' + k + '：' + w); });
      slots[SLOT_MAP[k]] = sr.row;
      itemIds[g.id] = 1;
      g.gems.forEach(function (id) { itemIds[id] = 1; });
      if (g.enchantId) enchIds[g.enchantId] = 1;
    });
    var key = String(d.spec);
    var s = specs[key] = specs[key] || { cls: sp.cls, specEn: sp.specEn, profiles: [] };
    s.profiles.push({ f: f, n: p.name, s: p.talents, p: pts,
      h: Object.keys(subs).map(Number).sort(function (a, b) { return a - b; }), slots: slots });
  });
  // 每个专精里最短的文件名排第一：那是不带英雄天赋后缀的默认配置（MID2_Mage_Fire.simc），
  // 后缀版（MID2_Mage_Fire_Frostfire.simc）是同一专精换英雄天赋的另一份。
  Object.keys(specs).forEach(function (k) {
    specs[k].profiles.sort(function (a, b) { return a.f.length - b.f.length || (a.f < b.f ? -1 : 1); });
  });
  return { specs: specs, itemIds: Object.keys(itemIds), enchIds: Object.keys(enchIds),
    problems: problems, warns: warns };
}
/** 补上中文名 / 品质 / 图标，拼出最终产物。 */
function finish(meta, b, bonusMap, cb) {
  // 「点满」的参照 = 这批配置里最常见的总点数（MID2 实测 45/47 份是 82）。
  // 不写死：天赋树一改点数上限就变，写死的数会让整批都报「没点满」。
  var freq = {};
  Object.keys(b.specs).forEach(function (k) {
    b.specs[k].profiles.forEach(function (p) { freq[p.p] = (freq[p.p] || 0) + 1; });
  });
  var fullPts = Number(Object.keys(freq).sort(function (x, y) { return freq[y] - freq[x] || y - x; })[0]) || 0;
  lookup('item', b.itemIds, function (e, it) {
    if (e) { cb(e); return; }
    lookup('ench', b.enchIds, function (e2, en) {
      if (e2) { cb(e2); return; }
      var rio = rioItems(), items = {}, ench = {};
      b.itemIds.forEach(function (id) {
        var row = it.map[id], q = row ? Number(row[1]) : 0;
        var o = { n: row ? row[0] : '' };
        if (q) o.q = q;               // 0 当「没有这个字段」，和 bis.js 的约定一致
        if (rio[id] && rio[id].i) o.i = rio[id].i;
        items[id] = o;
      });
      b.enchIds.forEach(function (id) {
        ench[id] = en.map[id] ? cleanEnchant(en.map[id][0]) : { n: '', q: 0 };
      });
      if (it.missed.length) b.warns.push('DB2 里查不到中文名的物品 ' + it.missed.length + ' 件：' + it.missed.join(', '));
      if (en.missed.length) b.warns.push('DB2 里查不到的附魔 ' + en.missed.length + ' 个：' + en.missed.join(', '));
      cb(null, {
        v: 1, updatedAt: meta.date,
        source: 'SimulationCraft 默认配置（github.com/' + REPO + ' · ' + meta.branch + ' · profiles/' + meta.tier + '）',
        repo: 'https://github.com/' + REPO, branch: meta.branch, tier: meta.tier,
        commit: meta.sha, commitDate: meta.date,
        license: 'GPL-3.0（衍生自 SimulationCraft 配置文件，见 docs/LICENSE-simulationcraft.md）',
        nameSource: '暴雪 DB2 ItemSparse / SpellItemEnchantment（wago.tools，locale=zhCN）',
        ilvlByBonus: bonusMap, fullPts: fullPts,
        note: 'SimC 维护者为每个专精配好、拿来跑默认模拟的那一套装备和天赋。不是编辑排的 BiS 榜，也不是使用率统计 —— '
          + '每个部位只有一件，没有名次也没有样本量，团本和大秘境共用。profiles[0] 是不带英雄天赋后缀的默认配置。'
          + '装等：s=c 是配置里写明的 ilevel，s=b 是由 bonus_id 查 ilvlByBonus 得到的（b 是那个编号），'
          + '两样都没有就不写 —— 不猜。',
        fmt: {
          specs: 'specId → {cls, specEn, profiles}',
          profiles: '[{f 文件名, n 配置名, s 天赋导入串（原样）, p 花点买的总点数, h [英雄子树id…], slots}]',
          slots: 'INVSLOT → {i itemId, v 装等, s 装等来源 c|b, b bonusID, e 附魔ID, t 附魔标识（没有 ID 时）, '
            + 'g [宝石itemId…], m 装饰标识, c [制造副属性…]}',
          items: 'itemId → {n 中文名, q 品质, i 图标名}',
          ench: '附魔ID → {n 中文名, q 品质档}'
        },
        specs: b.specs, items: items, ench: ench
      });
    });
  });
}
function write(data) {
  var head = '/* 自动生成，勿手改。生成器：tools/fetch-simc.js\n'
    + ' * 数据：SimulationCraft 默认配置 github.com/' + REPO + ' profiles/' + data.tier
    + ' @ ' + data.commit + '（' + data.commitDate + '）\n'
    + ' * 许可：GPL-3.0，见 docs/LICENSE-simulationcraft.md */\n';
  fs.writeFileSync(OUT, head + 'window.AE_SIMC = ' + JSON.stringify(data) + ';\n');
}

module.exports = {
  parseProfile: parseProfile, parseGear: parseGear, slotRow: slotRow,
  cleanEnchant: cleanEnchant, loadBonusMap: loadBonusMap, SLOT_MAP: SLOT_MAP, STAT_ID: STAT_ID
};
if (require.main !== module) return;

console.log('SimC 默认配置 → app/simc-data.js');
var bonusMap = loadBonusMap(BONUS_LUA);
if (!Object.keys(bonusMap).length) {
  console.log('  ！没读到装等对照表（' + BONUS_LUA + '）：没写 ilevel 的部位都会没有装等。'
    + '用 --bonus-lua 指一下 BonusRollConfirm 的 RewardPreview.lua');
}
snapshot(function (e, meta, dir) {
  if (e) { console.error('  失败：' + e.message); process.exit(1); }
  var b = build(meta, dir, bonusMap);
  finish(meta, b, bonusMap, function (e2, data) {
    if (e2) { console.error('  失败：' + e2.message); process.exit(1); }
    b.warns.forEach(function (w) { console.log('  · ' + w); });
    if (b.problems.length) {
      console.error('  ' + b.problems.length + ' 个问题，产物没写：');
      b.problems.forEach(function (p) { console.error('  · ' + p); });
      process.exit(1);
    }
    write(data);
    var nProf = 0, nSlot = 0, nIv = 0;
    Object.keys(data.specs).forEach(function (k) {
      data.specs[k].profiles.forEach(function (p) {
        nProf++;
        Object.keys(p.slots).forEach(function (s) { nSlot++; if (p.slots[s].v) nIv++; });
      });
    });
    console.log('  写出 app/simc-data.js：' + Object.keys(data.specs).length + ' 个专精 / ' + nProf
      + ' 份配置 / ' + nSlot + ' 个部位（有装等 ' + nIv + '）/ ' + Object.keys(data.items).length + ' 件物品，'
      + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
  });
});
