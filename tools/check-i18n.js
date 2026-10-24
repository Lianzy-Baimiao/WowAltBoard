/*
 * WowAltBoard - tools/check-i18n.js
 *
 * 界面语言层的单测 + 目录审计。分三块：
 *
 *   1. 引擎行为：AE.i18n.resolve() 的优先级、t / tn / ts 的命中与兜底。
 *   2. 目录卫生：重复键、空键、译文里残留中文（允许包内文件名）、
 *      模板占位符在译文里一个都不能丢。
 *   3. 覆盖率：index.html 的静态文本 / title / placeholder / aria-label，
 *      以及 app 源码里 tr('…') / tn('…') / ts('…') 的字符串字面量参数，
 *      必须在目录里有精确条目。游戏数据（物品名、专精名）不会以字面量
 *      形式传给 tr，所以这条扫描不会把它们误判成漏翻。
 *
 * 不在这里测 applyStatic() 的 DOM 行为 —— Node 侧没有真实 DOM，另造一棵
 * 假树只能验证假树。那部分由 tools/check-i18n-browser.cjs 在真浏览器里走。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var failures = [];
var checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) failures.push(message);
}

function eq(actual, expected, message) {
  checks++;
  if (actual !== expected) {
    failures.push(message + '\n    期望: ' + JSON.stringify(expected) + '\n    实际: ' + JSON.stringify(actual));
  }
}

// ---------------------------------------------------------------- 引擎单测

function makeEngine(catalog) {
  var sandbox = { console: console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  if (catalog) sandbox.AE_I18N_EN = catalog;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/i18n.js'), 'utf8'), sandbox, { filename: 'app/i18n.js' });
  if (catalog) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/i18n-en.js'), 'utf8'), sandbox, { filename: 'app/i18n-en.js' });
  }
  return sandbox;
}

var engine = makeEngine(true);
var AE = engine.AE;

// resolve(): force > saved > url > navigator > en.
eq(AE.i18n.resolve('en', 'zh', 'zh-CN', 'zh'), 'zh', 'resolve: 强制语言压过一切');
eq(AE.i18n.resolve('en', 'zh', 'zh-CN', ''), 'en', 'resolve: 显式保存的语言压过 URL');
eq(AE.i18n.resolve('auto', 'zh', 'en-US', ''), 'zh', 'resolve: auto 落到 URL');
eq(AE.i18n.resolve('', '', 'en-GB', ''), 'en', 'resolve: navigator 的第一个受支持语言');
eq(AE.i18n.resolve('', '', 'fr-FR', ''), 'en', 'resolve: 不受支持的语言回落到英文');
eq(AE.i18n.resolve('', '', '', ''), 'en', 'resolve: 什么都没有时用英文兜底');

// urlLang(): ?lang= and #lang= are both accepted. The launcher passes the
// fragment to native/browser windows because .NET file URIs mangle '?'.
engine.navigator = { languages: ['en-US'], language: 'en-US' };
engine.location = { search: '?lang=zh', hash: '' };
eq(AE.i18n.use('auto'), 'zh', 'urlLang: ?lang=zh 生效');
engine.location = { search: '', hash: '#lang=en' };
eq(AE.i18n.use('auto'), 'en', 'urlLang: #lang=en 生效（原生窗口用片段）');
engine.location = { search: '', hash: '#lang=zh&x=1' };
eq(AE.i18n.use('auto'), 'zh', 'urlLang: 片段里带其他参数也能取到');
engine.location = { search: '?lang=zh', hash: '#lang=en' };
eq(AE.i18n.use('auto'), 'zh', 'urlLang: 查询串优先于片段');
engine.location = { search: '', hash: '#section' };
eq(AE.i18n.use('auto'), 'en', 'urlLang: 没有语言参数时跟随 navigator');

// 中文模式：t / ts 原样返回；tn 只做占位符替换。
engine.__AE_FORCE_LANG = 'zh';
AE.i18n.use('');
eq(AE.i18n.lang(), 'zh', '中文模式：use("") 后语言是 zh');
eq(AE.t('设置'), '设置', '中文模式：t 原样返回');
eq(AE.ts('共 {n} 个角色'), '共 {n} 个角色', '中文模式：ts 原样返回');
eq(AE.tn('共 {n} 个角色', { n: 3 }), '共 3 个角色', '中文模式：tn 填占位符');
eq(AE.i18n.locale(), 'zh-CN', '中文模式：locale 是 zh-CN');

// 英文模式：精确、上下文、函数、未命中回填。
engine.__AE_FORCE_LANG = 'en';
AE.i18n.use('');
eq(AE.i18n.locale(), 'en-US', '英文模式：locale 是 en-US');
eq(AE.t('设置'), 'Settings', '英文模式：精确命中');
eq(AE.t('不存在的界面文案'), '不存在的界面文案', '英文模式：未命中回退中文');
ok(engine.__AE_I18N_MISSES && engine.__AE_I18N_MISSES['不存在的界面文案'], '英文模式：t 未命中会记录 miss');
var before = Object.keys(engine.__AE_I18N_MISSES || {}).length;
eq(AE.ts('不存在的界面文案'), '不存在的界面文案', '英文模式：ts 未命中回退中文');
eq(Object.keys(engine.__AE_I18N_MISSES || {}).length, before, 'ts 不记录 miss');
eq(AE.tn('共 {n} 个角色', { n: 2 }), '2 characters', '英文模式：tn 命中函数值');
eq(AE.tn('共 {n} 个角色', { n: 1 }), '1 character', '英文模式：tn 单数');
eq(AE.tn('未收录的模板 {x}', { x: 'X' }), '未收录的模板 X', '英文模式：tn 未命中先把变量填回模板');
eq(AE.t('不存在的界面文案', 'export'), '不存在的界面文案', '英文模式：没有上下文条目时原样返回');

// 上下文条目：临时目录，验证 ctx 命中与缺省值。
var ctxEngine = makeEngine(false);
ctxEngine.AE_I18N_EN = {
  '关闭': { '': 'Close', state: 'Off' },
  '只带上下文': { export: 'Export only' }
};
ctxEngine.__AE_FORCE_LANG = 'en';
ctxEngine.AE.i18n.use('');
eq(ctxEngine.AE.t('关闭'), 'Close', '上下文：没有 ctx 时用默认译法');
eq(ctxEngine.AE.t('关闭', 'state'), 'Off', '上下文：命中指定 ctx');
eq(ctxEngine.AE.t('只带上下文'), '只带上下文', '上下文：没有默认值时回退原文');
eq(ctxEngine.AE.t('只带上下文', 'export'), 'Export only', '上下文：只有 ctx 条目也能命中');

// ---------------------------------------------------------------- 目录审计

var catalogSource = fs.readFileSync(path.join(ROOT, 'app/i18n-en.js'), 'utf8');
var catalog = engine.AE_I18N_EN;

var entryRe = /^ {4}'((?:[^'\\]|\\.)*)'\s*:/gm;
var seen = Object.create(null);
var duplicates = [];
var m;
while ((m = entryRe.exec(catalogSource))) {
  var key = m[1].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
  if (seen[key]) duplicates.push(key);
  seen[key] = 1;
  if (!key) failures.push('目录里有空键');
}
ok(!duplicates.length, '目录键重复: ' + duplicates.join(' | '));

var ALLOWED_CJK = /魔兽看板\.exe|启动\.bat|更新数据\.bat/g;
function hasCJK(s) {
  return /[一-鿿]/.test(String(s).replace(ALLOWED_CJK, ''));
}

function placeholders(s) {
  var out = [];
  String(s).replace(/\{([A-Za-z0-9_]+)\}/g, function (all, name) { out.push(name); return all; });
  return out.sort();
}

function sampleVars(key) {
  var vars = {};
  placeholders(key).forEach(function (name) {
    vars[name] = /^(n|people|chars|total|cols|layouts|matched|missing|unknown|diff|got|rank|rank2|drawn|off|lit|pts|bis|alt|on|done|seen|season|active)$/.test(name) ? 2 : 'X';
  });
  return vars;
}

Object.keys(catalog).forEach(function (key) {
  var value = catalog[key];
  if (typeof value === 'function') {
    var rendered;
    try { rendered = value(sampleVars(key)); }
    catch (e) { failures.push('函数值抛异常: ' + JSON.stringify(key) + ' — ' + e.message); return; }
    ok(typeof rendered === 'string', '函数值必须返回字符串: ' + JSON.stringify(key));
    if (typeof rendered === 'string' && hasCJK(rendered)) {
      failures.push('函数值译文残留中文: ' + JSON.stringify(key) + ' => ' + rendered);
    }
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach(function (ctx) {
      if (hasCJK(value[ctx])) {
        failures.push('上下文译文残留中文: ' + JSON.stringify(key) + '[' + ctx + '] => ' + value[ctx]);
      }
      var wantCtx = placeholders(key), gotCtx = placeholders(value[ctx]);
      if (wantCtx.join(',') !== gotCtx.join(',')) {
        failures.push('上下文占位符不一致: ' + JSON.stringify(key) + '[' + ctx + '] 缺 ' + wantCtx.join(',') + ' 多 ' + gotCtx.join(','));
      }
    });
    return;
  }
  if (hasCJK(value)) failures.push('译文残留中文: ' + JSON.stringify(key) + ' => ' + value);
  var want = placeholders(key), got = placeholders(value);
  if (want.join(',') !== got.join(',')) {
    failures.push('占位符不一致: ' + JSON.stringify(key) + '\n    原文: ' + want.join(',') + '\n    译文: ' + got.join(','));
  }
});

// 目录里每一条中文 key 至少要有英文值或函数，不能是中文原样。
Object.keys(catalog).forEach(function (key) {
  var v = catalog[key];
  if (typeof v === 'string' && v === key && hasCJK(key)) {
    failures.push('译文与原文相同: ' + JSON.stringify(key));
  }
});

// ------------------------------------------------------------ index.html 覆盖

function textsFromHtml(file) {
  var src = fs.readFileSync(file, 'utf8');
  src = src.replace(/<!--[\s\S]*?-->/g, '')
           .replace(/<script[\s\S]*?<\/script>/gi, '')
           .replace(/<style[\s\S]*?<\/style>/gi, '');
  var out = [];
  src.replace(/>([^<]+)</g, function (all, text) {
    var t = text.trim();
    if (t && hasCJK(t)) out.push(t);
    return all;
  });
  src.replace(/\b(title|placeholder|aria-label)="([^"]*)"/g, function (all, name, value) {
    if (hasCJK(value)) out.push(value);
    return all;
  });
  return out;
}

var htmlMissing = [];
textsFromHtml(path.join(ROOT, 'index.html')).forEach(function (text) {
  if (!Object.prototype.hasOwnProperty.call(catalog, text)) htmlMissing.push(text);
});
ok(!htmlMissing.length, 'index.html 静态文案漏翻: ' + htmlMissing.map(JSON.stringify).join(' | '));

// -------------------------------------------------------------- 源码 key 覆盖

function stripComments(s) {
  var out = '', i = 0, n = s.length, quote = null;
  while (i < n) {
    var c = s.charAt(i), d = s.charAt(i + 1);
    if (quote) {
      out += c;
      if (c === '\\') { out += s.charAt(i + 1) || ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && d === '*') { var e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && d === '/') { var e2 = s.indexOf('\n', i); i = e2 < 0 ? n : e2; continue; }
    out += c; i++;
  }
  return out;
}

function appFiles() {
  return fs.readdirSync(path.join(ROOT, 'app')).filter(function (f) {
    return /\.js$/.test(f) &&
      !/-tests\.js$/.test(f) &&
      !/^(bis-data|talent-data|talent-tree|talent-desc|wcl-data|rio-data|simc-data|item-icons|class-names)\.js$/.test(f);
  }).sort();
}

var sourceMissing = [];
appFiles().forEach(function (file) {
  var src = stripComments(fs.readFileSync(path.join(ROOT, 'app', file), 'utf8'));
  var re = /\b(tr|tn|ts)\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  var hit;
  while ((hit = re.exec(src))) {
    var text = hit[2].slice(1, -1).replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
    if (!hasCJK(text)) continue;
    if (!Object.prototype.hasOwnProperty.call(catalog, text)) {
      sourceMissing.push('app/' + file + ': ' + JSON.stringify(text));
    }
  }
});
ok(!sourceMissing.length, '源码 tr/tn/ts 字面量漏翻:\n    ' + sourceMissing.join('\n    '));

// ---------------------------------------------------------------------- 汇总

if (failures.length) {
  console.error('i18n 检查失败：' + failures.length + ' 项 / 共 ' + checks + ' 项检查\n');
  failures.forEach(function (f, i) { console.error('  ' + (i + 1) + '. ' + f); });
  process.exit(1);
}
console.log('i18n 检查：' + checks + ' 项全过（目录 ' + Object.keys(catalog).length + ' 条，' +
  appFiles().length + ' 个界面模块，静态文案与 tr/tn/ts 字面量全部有译）');
