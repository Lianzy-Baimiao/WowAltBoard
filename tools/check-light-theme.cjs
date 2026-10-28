'use strict';
// Light-theme contrast audit (optional: Edge + Playwright, like the other *.cjs checks).
//   set NODE_PATH=<playwright> && node tools/check-light-theme.cjs
// Opens every screen in the light theme (all four skins), in print, and in dark, and
// measures every visible text node against the background it actually sits on:
// background layers are composited on a canvas, so color-mix() / alpha / oklch() all count.
// Light and print also fail on any element painting a dark-UI game or class colour as
// text, background or border (bars, icon borders, dots). Dark contrast is reported only;
// dark fails if a light palette leaks into it.
// Thresholds, light theme and print:
//   ordinary text              4.5:1 (large text 3:1)            WCAG AA
//   class-coloured names       3.5:1 and bold (>= 600)           the hue is the class's identity
//   other game colours         4.0:1 (item quality, stat, source, keystone)
// The game colours are darkened only as far as these floors need, so a priest is still
// grey-white and a rogue still gold rather than olive. Fixture: tools/theme-fixture.js
// (fictional). WAB_THEME_DATA=real uses your own data/ (local QA only, never committed).
// WAB_THEME_DUMP=<file> also writes every node's colours, to diff a theme before/after.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const {writeFixture} = require('./theme-fixture.js');

function auditInPage({scope, paper, screen}) {
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
  const g = cvs.getContext('2d', {willReadFrequently: true});
  const alpha = c => { if (c === 'transparent') return 0; const m = c.match(/rgba\([^)]*,\s*([\d.]+)\)$/) || c.match(/\/\s*([\d.]+)(%?)\s*\)$/); return m ? (m[2] ? m[1] / 100 : +m[1]) : 1; };
  const paint = layers => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1);
    for (const c of layers) { g.fillStyle = 'rgba(1,2,3,0.5)'; g.fillStyle = c; if (g.fillStyle === 'rgba(1, 2, 3, 0.5)') throw new Error('Unparsed colour ' + c); g.fillRect(0, 0, 1, 1); }
    const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, gg, b]) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const where = el => { const p = []; for (let e = el; e && e !== document.body && p.length < 5; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map(c => '.' + c).join('')); return p.join(' > '); };
  const out = [], nodes = [];
  const root = document.querySelector(scope);
  if (!root) return {out, nodes, missing: scope};
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const text = n.nodeValue.replace(/\s+/g, ' ').trim();
    const el = n.parentElement;
    if (!text || !el || /^(SCRIPT|STYLE|OPTION|TEXTAREA)$/.test(el.tagName)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility !== 'visible' || el.closest('[hidden], td.empty, [aria-hidden="true"], :disabled')) continue;
    let opacity = 1; const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none') { opacity = 0; break; }
      opacity *= +s.opacity;
      if (!paper && alpha(s.backgroundColor) > 0) { layers.unshift(s.backgroundColor); if (alpha(s.backgroundColor) >= 1) break; }
    }
    if (opacity < 0.05) continue;
    const bg = paint(layers), raw = paint([...layers, cs.color]);
    const fg = raw.map((v, i) => Math.round(bg[i] + (v - bg[i]) * opacity));
    const size = parseFloat(cs.fontSize), weight = +cs.fontWeight, cr = ratio(fg, bg);
    const cls = el.closest('.cls-color, #bis .bis-choice.cls'), game = el.closest('.game-text');
    const need = cls ? 3.5 : game ? 4.0 : (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3.0 : 4.5;
    const item = {screen, text: text.slice(0, 28), cr: +cr.toFixed(2), need, fg: hex(fg), bg: hex(bg), size, weight, path: where(el)};
    nodes.push(item);
    if (cr < need || (cls && weight < 600)) out.push(item);
  }
  return {out, nodes};
}

// The dark theme must keep the colours it had before the light palettes existed: those
// only switch on under the light theme or print. A visible game-coloured node with
// --gc-now set, or a class-coloured name drawn in its light partner, is a leak.
function darkLeaks({scope}) {
  const root = document.querySelector(scope), out = [];
  const g = document.createElement('canvas').getContext('2d');
  const norm = c => { g.fillStyle = '#010203'; g.fillStyle = c; return g.fillStyle; };
  let game = 0, cls = 0;
  if (!root) return {out, game, cls};
  for (const el of root.querySelectorAll('.game-color, .cls-color, #bis .bis-choice.cls')) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height) continue;
    if (el.matches('.game-color')) {
      game++;
      if (cs.getPropertyValue('--gc-now').trim()) out.push('--gc-now is set on .' + [...el.classList].join('.'));
    }
    const light = cs.getPropertyValue('--class-color-light').trim(), dark = cs.getPropertyValue('--class-color').trim();
    if (light && el.matches('.cls-color, .bis-choice.cls')) {
      cls++;
      if (norm(light) !== norm(dark) && norm(cs.color) === norm(light)) out.push('light class colour on «' + el.textContent.trim().slice(0, 20) + '»');
    }
  }
  return {out, game, cls};
}

// The non-text half, light theme and print: no visible element (or ::before / ::after)
// may paint, as text, background or border, one of the game's own dark-UI colours that
// is under its floor on white -- a stat bar, an icon border, a dot the text audit never
// sees. Class and quality colours come from the game's tables, not from the light
// palettes under test; stat and source colours are the keys of L.gameColorsLight, which
// an older build does not have, so there only the first two are checked.
function lightLeaks({scope}) {
  const L = AE.Labels, g = document.createElement('canvas').getContext('2d');
  const norm = c => { g.fillStyle = '#010203'; g.fillStyle = c; return g.fillStyle; };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const onWhite = h => 1.05 / (0.2126 * lin(parseInt(h.slice(1, 3), 16)) + 0.7152 * lin(parseInt(h.slice(3, 5), 16)) + 0.0722 * lin(parseInt(h.slice(5, 7), 16)) + 0.05);
  const raw = new Set(), out = [];
  const add = (c, floor) => { const d = norm(c); if (/^#[0-9a-f]{6}$/.test(d) && d !== '#ffffff' && onWhite(d) < floor) raw.add(d); };
  Object.values(L.classColors).forEach(c => add(c, 4));
  [...Object.values(L.qualityColors), ...Object.keys(L.gameColorsLight || {})].forEach(c => add(c, 4.5));
  const root = document.querySelector(scope);
  let checked = 0;
  if (!root) return {out, raw: raw.size, checked};
  const tag = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].slice(0, 3).map(c => '.' + c).join('');
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility !== 'visible') continue;
    checked++;
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === 'none' || cs.display === 'none')) continue;
      const props = [['text', cs.color], ['background', cs.backgroundColor]];
      for (const s of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none') props.push(['border', cs['border' + s + 'Color']]);
      const hit = props.find(([, v]) => v && raw.has(norm(v)));
      if (hit) out.push(hit[0] + ' ' + norm(hit[1]) + ' on ' + tag(el) + (pseudo || ''));
    }
  }
  return {out, raw: raw.size, checked};
}

const closeAll = p => p.evaluate(() => { AE.closeAllPanels(); document.getElementById('export-menu').hidden = true; });
const settle = p => p.waitForTimeout(260);
const SCREENS = {
  board: async p => { await closeAll(p); await p.evaluate(() => { const b = document.getElementById('update-banner'); b.style.display = ''; document.getElementById('update-text').textContent = '有新版本 v9.9.9（当前 v1.0.0）'; }); return '#app'; },
  tooltip: async p => { await closeAll(p); await p.locator('#grid thead tr:nth-child(2) th[data-col="mpRating"]').hover(); await p.waitForTimeout(900); return '#tip'; },
  // Visible rows only: with WAB_THEME_DATA=real the user's own filter may hide some.
  drawer: async p => { await closeAll(p); const r = p.locator('#grid tbody tr.has-reward:not(.row-hidden)'); await (await r.count() ? r : p.locator('#grid tbody tr:not(.row-hidden)')).first().click(); return '#drawer'; },
  'drawer-priest': async p => { await closeAll(p); const r = p.locator('#grid tbody tr:not(.row-hidden)', {hasText: '月白祈愿'}); await (await r.count() ? r : p.locator('#grid tbody tr:not(.row-hidden)').nth(1)).first().click(); return '#drawer'; },
  settings: async (p, i) => { await closeAll(p); await p.locator('#btn-settings').click(); await p.locator('#panel-tabs button').nth(i).click(); await p.evaluate(() => document.querySelectorAll('#panel-body details').forEach(d => { d.open = true; })); return '#panel'; },
  trend: async (p, metric) => { await closeAll(p); await p.locator('#btn-trends').click(); await p.locator('#trend-body table').waitFor(); await p.selectOption('#trend-metric', metric); return '#trend'; },
  vault: async p => { await closeAll(p); await p.locator('#btn-vault').click(); await p.locator('#vault-body details').first().waitFor(); await p.evaluate(() => document.querySelectorAll('#vault-body details').forEach(d => { d.open = true; })); return '#vault'; },
  gear: async p => { await closeAll(p); await p.locator('#btn-bis').click(); await p.waitForSelector('.bis-slots .item'); return '#bis'; },
  'gear-compare': async p => { await p.locator('.bis-bar select').first().selectOption({index: 1}); return '#bis'; },
  distribution: async p => { await p.locator('.bis-bar').getByRole('button', {name: '实战分布', exact: true}).click(); await p.locator('.slot-head[role="button"]').first().click(); return '#bis'; },
  talents: async p => { await p.locator('.bis-tabs').getByRole('button', {name: '天赋', exact: true}).click(); await p.waitForSelector('.tnode img'); return '#bis'; },
  menu: async p => { await closeAll(p); await p.locator('#btn-export-more').click(); return '#export-menu'; },
  toasts: async p => { await closeAll(p); await p.evaluate(() => { AE.toast({title: '已复制', body: '演示提示', kind: 'good', ms: 0}); AE.toast({title: '扫描未完成', body: '演示提示', kind: 'bad', ms: 0}); AE.toast({title: '设置已保存', ms: 0}); }); await p.waitForTimeout(300); return '#toasts'; },
  // Last in the list: it leaves the search filled, so the board below is the empty state.
  empty: async p => { await closeAll(p); await p.locator('#board-search').fill('zzzz-没有这个角色'); await settle(p); return '#app'; }
};
const ALL = [['board'], ['tooltip'], ['drawer'], ['drawer-priest'], ...[0, 1, 2, 3, 4, 5].map(i => ['settings', i]),
  ...['rating', 'vault', 'map', 'gold'].map(m => ['trend', m]), ['vault'], ['gear'], ['gear-compare'], ['distribution'], ['talents'], ['menu'], ['toasts'], ['empty']];
const CORE = [['board'], ['drawer'], ['gear'], ['talents'], ['settings', 4]];
// Print only shows the board (panels are display:none there); paper=true means no
// background graphics, i.e. every text sits on white paper whatever the theme was.
const PASSES = [['light', 'slate', ALL], ['light', 'violet', ALL], ['light', 'jade', CORE], ['light', 'amber', CORE],
  ['dark', 'slate', ALL], ['print-dark', 'slate', [['board']]], ['print-light', 'violet', [['board']]]];

(async () => {
  // WAB_THEME_ROOT: audit another build (a folder with index.html + app/, e.g. a
  // `git archive` of the last release) to diff its WAB_THEME_DUMP against this one.
  const root = path.resolve(process.env.WAB_THEME_ROOT || path.join(__dirname, '..')), base = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(base, 'wow-light-theme-'));
  const report = {passes: [], failures: [], darkBelow: 0, darkLeaks: [], darkGame: 0, darkCls: 0, lightLeaks: [], lightChecked: 0, rawColours: 0}, dump = [];
  let browser;
  try {
    await fs.copyFile(path.join(root, 'index.html'), path.join(dir, 'index.html'));
    await fs.cp(path.join(root, 'app'), path.join(dir, 'app'), {recursive: true});
    if (process.env.WAB_THEME_DATA === 'real') await fs.cp(path.join(root, 'data'), path.join(dir, 'data'), {recursive: true});
    else await writeFixture(dir);
    browser = await chromium.launch({channel: 'msedge', headless: true});
    for (const [mode, skin, screens] of PASSES) {
      const theme = mode.endsWith('dark') ? 'dark' : 'light', print = mode.startsWith('print');
      const context = await browser.newContext({viewport: {width: 1600, height: 1000}});
      const page = await context.newPage(), errors = [], network = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route(/^https?:/, r => { network.push(r.request().url()); return r.abort(); });
      await page.addInitScript(() => { window.__AE_FORCE_LANG = 'zh'; });
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.waitForSelector('#grid tbody tr');
      await page.evaluate(({theme, skin}) => { const s = AE.state.settings; s.theme = theme; s.skin = skin; AE.refresh(); if (AE.repaintThemeSwitch) AE.repaintThemeSwitch(); }, {theme, skin});
      if (print) await page.emulateMedia({media: 'print'});
      let fails = 0, checked = 0;
      for (const [name, arg] of screens) {
        const scope = await SCREENS[name](page, arg);
        if (name !== 'tooltip') await page.mouse.move(1, 1);
        await settle(page);
        const label = mode + '/' + skin + '/' + name + (arg != null ? ':' + arg : '');
        const res = await page.evaluate(auditInPage, {scope, paper: print, screen: label});
        if (res.missing || !res.nodes.length) throw new Error(label + ': audited nothing at ' + scope);
        checked += res.nodes.length;
        if (process.env.WAB_THEME_DUMP) dump.push(...res.nodes);
        if (mode === 'dark') {
          report.darkBelow += res.out.length;
          const lk = await page.evaluate(darkLeaks, {scope});
          report.darkGame += lk.game; report.darkCls += lk.cls;
          report.darkLeaks.push(...lk.out.map(m => label + ': ' + m));
        } else {
          fails += res.out.length; report.failures.push(...res.out);
          const ll = await page.evaluate(lightLeaks, {scope});
          report.lightChecked += ll.checked; report.rawColours = ll.raw;
          report.lightLeaks.push(...ll.out.map(m => label + ': ' + m));
        }
      }
      if (errors.length) throw new Error(mode + '/' + skin + ' page errors: ' + errors.join(' | '));
      if (network.length) throw new Error(mode + '/' + skin + ' network: ' + network.join(' '));
      report.passes.push({mode, skin, screens: screens.length, textNodes: checked, failures: mode === 'dark' ? null : fails});
      await context.close();
    }
    if (process.env.WAB_THEME_DUMP) await fs.writeFile(process.env.WAB_THEME_DUMP, JSON.stringify(dump));
    const out = process.env.WAB_THEME_REPORT || path.join(base, 'wab-light-theme-report.json');
    await fs.writeFile(out, JSON.stringify(report, null, 1));
    const groups = {};
    for (const f of report.failures) {
      const k = f.path.split(' > ').slice(-2).join(' > ') + ' | ' + f.fg + ' on ' + f.bg + ' ' + f.cr + '<' + f.need + (f.weight < 600 && f.need === 3.5 ? ' (not bold)' : '');
      (groups[k] = groups[k] || {n: 0, text: f.text, where: new Set()}).n++;
      groups[k].where.add(f.screen.split('/').slice(0, 3).join('/'));
    }
    for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 60)) {
      console.log(String(v.n).padStart(4) + '  ' + k + '  «' + v.text + '»  ' + [...v.where].slice(0, 3).join(', '));
    }
    for (const m of report.darkLeaks.slice(0, 20)) console.log('dark leak  ' + m);
    for (const m of report.lightLeaks.slice(0, 20)) console.log('light leak  ' + m);
    // Zero nodes checked would make "no leaks" meaningless.
    if (!report.darkGame || !report.darkCls) report.darkLeaks.push('dark pass checked ' + report.darkGame + ' game-coloured and ' + report.darkCls + ' class-coloured nodes');
    if (!report.lightChecked || report.rawColours < 10) report.lightLeaks.push('light passes checked ' + report.lightChecked + ' elements against ' + report.rawColours + ' dark-UI colours');
    console.log(JSON.stringify({passes: report.passes, failures: report.failures.length, distinct: Object.keys(groups).length,
      darkBelowThreshold: report.darkBelow, darkLeaks: report.darkLeaks.length, darkGameNodes: report.darkGame, darkClassNodes: report.darkCls,
      lightLeaks: report.lightLeaks.length, lightElements: report.lightChecked, darkUiColours: report.rawColours, report: out}, null, 1));
    if (report.failures.length || report.darkLeaks.length || report.lightLeaks.length) process.exitCode = 1;
    else console.log('Light theme: every text node meets its contrast floor and no element paints a dark-UI game or class colour (light x4 skins, print from dark and light); dark theme: '
      + report.darkGame + ' game-coloured + ' + report.darkCls + ' class-coloured nodes keep their dark colours; 0 page errors, 0 network requests');
  } finally {
    if (browser) await browser.close();
    if (path.dirname(path.resolve(dir)) === base && path.basename(dir).startsWith('wow-light-theme-')) await fs.rm(dir, {recursive: true, force: true});
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
