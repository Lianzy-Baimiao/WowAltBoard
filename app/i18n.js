/*
 * WowAltBoard - app/i18n.js
 *
 * 界面语言层。中文是源码里的原文，也是目录的 key；英文目录在
 * app/i18n-en.js 里。查不到就原样返回中文，所以游戏数据（物品名、专精名、
 * 副本名）永远不会被误翻 —— 它们根本不在目录里。
 *
 * 为什么不用 data-i18n 属性重写 HTML
 * -----------------------------------
 * 页面里的静态文案已经在 index.html 里，用一次文本节点遍历就能全部翻掉；
 * 给每个叶子节点加 data-i18n 只会多一份容易漏的名单。动态内容全部由各模块
 * 在渲染时调用 AE.t / AE.tn，模块顶层不翻译（那时还没读到保存的设置）。
 *
 * 为什么 el() 用 AE.ts 而不是 AE.t
 * --------------------------------
 * el() 同时承载 UI 文案和游戏数据（物品名、角色名、首领名）。AE.ts 只做
 * 精确匹配、不记录 miss，游戏数据查不到就直接返回，不会触发模板扫描，也
 * 不会把几万个物品名灌进 __AE_I18N_MISSES。需要模板/上下文的调用点显式用
 * AE.t / AE.tn。
 */
(function (global) {
  'use strict';

  var AE = global.AE = global.AE || {};
  var doc = global.document;

  function hasCJK(s) {
    return /[一-鿿]/.test(String(s == null ? '' : s));
  }

  function normalizeLang(v) {
    var s = String(v == null ? '' : v).toLowerCase();
    if (s.indexOf('zh') === 0) return 'zh';
    if (s.indexOf('en') === 0) return 'en';
    return '';
  }

  function urlLang() {
    try {
      var loc = global.location || {};
      var m = /[?&]lang=(zh|en)(?:&|#|$)/i.exec(String(loc.search || ''));
      if (m) return m[1].toLowerCase();
      // The launcher hands the native/browser window a file:// URL. .NET
      // Framework escapes '?' in a file URI into the path ("index.html%3F..."),
      // so those windows pass the language in the fragment instead.
      m = /(?:^#|&)lang=(zh|en)(?:&|$)/i.exec(String(loc.hash || ''));
      return m ? m[1].toLowerCase() : '';
    } catch (e) { return ''; }
  }

  function navLang() {
    try {
      var nav = global.navigator || {};
      var list = nav.languages;
      if (list && list.length) {
        for (var i = 0; i < list.length; i++) {
          var one = normalizeLang(list[i]);
          if (one) return one;
        }
      }
      return normalizeLang(nav.language);
    } catch (e) { return ''; }
  }

  /**
   * Pure resolution, so tests can exercise every branch without touching
   * navigator/location. Later sources only win when earlier ones are absent.
   * `saved` may be 'auto'; normalizeLang turns that into '' and it falls through.
   */
  function resolve(saved, url, nav, force) {
    var f = normalizeLang(force);
    if (f) return f;
    var s = normalizeLang(saved);
    if (s) return s;
    var u = normalizeLang(url);
    if (u) return u;
    var n = normalizeLang(nav);
    if (n) return n;
    return 'en';                       // international default
  }

  var state = {
    lang: 'en',
    misses: {},
    staticApplied: false
  };

  function catalog() {
    return global.AE_I18N_EN || null;
  }

  function entry(text) {
    var c = catalog();
    if (!c || !Object.prototype.hasOwnProperty.call(c, text)) return null;
    return c[text];
  }

  /** Value for one exact key, honoring an optional context object. */
  function exact(text, ctx) {
    var v = entry(text);
    if (v == null) return null;
    if (typeof v === 'string' || typeof v === 'function') return v;
    if (typeof v === 'object') {
      if (ctx && typeof v[ctx] === 'string') return v[ctx];
      if (typeof v[''] === 'string') return v[''];
    }
    return null;
  }

  function fill(template, vars) {
    if (!vars) return template;
    return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
        ? String(vars[name]) : all;
    });
  }

  function recordMiss(text) {
    if (!hasCJK(text)) return;
    state.misses[text] = (state.misses[text] || 0) + 1;
    global.__AE_I18N_MISSES = state.misses;
  }

  function patterns(text) {
    var list = global.AE_I18N_EN_PATTERNS;
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      var m = list[i][0].exec(text);
      if (m) {
        var out = list[i][1](m, text);
        if (typeof out === 'string') return out;
      }
    }
    return null;
  }

  AE.i18n = {
    resolve: resolve,
    locale: function () { return state.lang === 'en' ? 'en-US' : 'zh-CN'; },
    lang: function () { return state.lang; },
    use: function (saved) {
      state.lang = resolve(saved, urlLang(), navLang(), global.__AE_FORCE_LANG);
      return state.lang;
    },
    misses: function () { return state.misses; },
    applyStatic: function (root) {
      if (!doc || !doc.body) return;
      var host = root || doc.body;
      if (host === doc.body && state.staticApplied) return;
      if (host === doc.body) state.staticApplied = true;

      var ATTRS = ['title', 'placeholder', 'aria-label'];

      function translateText(node) {
        var raw = node.nodeValue || '';
        var lead = (raw.match(/^\s*/) || [''])[0];
        var trail = (raw.match(/\s*$/) || [''])[0];
        var core = raw.slice(lead.length, raw.length - trail.length);
        if (!core) return;
        var out = AE.t(core);
        if (out !== core) node.nodeValue = lead + out + trail;
      }

      function walk(node) {
        if (!node) return;
        if (node.nodeType === 3) { translateText(node); return; }
        if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
        if (node.nodeType === 1 && /^(SCRIPT|STYLE|NOSCRIPT)$/i.test(node.tagName)) return;
        if (node.nodeType === 1) {
          for (var a = 0; a < ATTRS.length; a++) {
            var name = ATTRS[a];
            var val = node.getAttribute ? node.getAttribute(name) : null;
            if (!val) continue;
            var tr = AE.t(val);
            if (tr !== val) node.setAttribute(name, tr);
          }
        }
        var kids = node.childNodes;
        if (kids) for (var i = 0; i < kids.length; i++) walk(kids[i]);
      }

      walk(host);
      if (doc.documentElement && doc.documentElement.setAttribute) {
        doc.documentElement.setAttribute('lang', state.lang === 'en' ? 'en' : 'zh-CN');
      }
    }
  };

  /** Exact match only, silent. Used by el() because it also carries game data. */
  AE.ts = function (text) {
    if (state.lang !== 'en' || typeof text !== 'string') return text;
    var v = exact(text, null);
    return typeof v === 'string' ? v : text;
  };

  /** Explicit translation: exact + context, then patterns; records misses. */
  AE.t = function (text, ctx) {
    if (state.lang !== 'en' || typeof text !== 'string') return text;
    var v = exact(text, ctx);
    if (typeof v === 'string') return v;
    var p = patterns(text);
    if (p != null) return p;
    recordMiss(text);
    return text;
  };

  /** Explicit template translation: named {placeholders}, functions for plurals. */
  AE.tn = function (template, vars) {
    if (typeof template !== 'string') return template;
    if (state.lang !== 'en') return fill(template, vars);
    var v = exact(template, null);
    if (typeof v === 'function') return String(v(vars || {}));
    if (typeof v === 'string') return fill(v, vars);
    var p = patterns(template);
    if (p != null) return p;
    recordMiss(template);
    return fill(template, vars);
  };

  // Establish a bootstrap language before settings load. main.js calls use()
  // again with the saved setting and only then applies the static strings.
  AE.i18n.use('');
})(typeof window !== 'undefined' ? window : globalThis);
