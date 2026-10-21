'use strict';
/*
 * 英文界面巡检（可选，需要 Playwright + 系统 Edge）：
 *   set NODE_PATH=<playwright 安装目录> && node tools/check-i18n-browser.cjs
 *
 * 用合成数据在临时目录里打开真实的 index.html，强制 __AE_FORCE_LANG='en'，
 * 依次走主页、设置各页签、角色详情、周趋势、备份箱、毕业装备 / 天赋页签，
 * 检查两件事：
 *   1. window.__AE_I18N_MISSES 为空 —— 所有走 AE.t / AE.tn 的文案都命中了；
 *   2. 可见文本和 title / placeholder / aria-label 里没有残留的目录中文 key
 *      （el() 走的是静默的 AE.ts，漏翻不会记 miss，只能靠这一条抓）。
 *
 * 游戏数据（角色名、物品名、副本名…）不加入目录，所以按「文本是否恰好等于
 * 某个中文 key」判断，不会把数据当漏翻。最后切回显式中文，确认语言优先级。
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..'), base = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(base, 'wow-i18n-browser-'));
  let browser;
  try {
    await fs.copyFile(path.join(root, 'index.html'), path.join(dir, 'index.html'));
    await fs.cp(path.join(root, 'app'), path.join(dir, 'app'), { recursive: true });
    await fs.mkdir(path.join(dir, 'data'));
    const lua = [
      'AlterEgoDB={global={characters={',
      'alpha={info={name="Alpha",realm="Test Realm",level=90,class={file="DEATHKNIGHT",name="Death Knight"},race={name="Human"},guild={name="Testing"}},equipment={HEADSLOT={name="Test Helm",itemLevel=600,quality=4}}},',
      'beta={info={name="Beta",realm="Test Realm",level=80,class={file="MAGE",name="Mage"},race={name="Gnome"}},equipment={}}',
      '}}}'
    ].join('');
    await fs.writeFile(path.join(dir, 'data/data.js'), 'window.AE_DATA=' + JSON.stringify({
      scannedAt: 1791072000,
      sources: [{ id: 'fixture', account: 'fixture', flavor: 'retail', lua }]
    }));
    for (const f of ['settings', 'manifest', 'bagsync']) {
      await fs.writeFile(path.join(dir, 'data', f + '.js'), '/* fixture */');
    }

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
    const page = await context.newPage();
    const errors = [], network = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, r => { network.push(r.request().url()); return r.abort(); });
    await page.addInitScript(() => { window.__AE_FORCE_LANG = 'en'; });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?lang=en');
    await page.waitForFunction(() => window.AE && AE.state && AE.state.model);

    const report = async label => {
      const result = await page.evaluate(() => {
        const cat = window.AE_I18N_EN || {};
        const bad = [];
        const seen = new Set();
        const consider = (text, where) => {
          const t = String(text == null ? '' : text).trim();
          if (!t || !/[一-鿿]/.test(t) || seen.has(where + '|' + t)) return;
          seen.add(where + '|' + t);
          if (Object.prototype.hasOwnProperty.call(cat, t)) { bad.push(where + ': ' + t); return; }
          // 复合句：逐段看是否恰好是中文 key（例如「赛季 2」的模板 key 是「赛季 {n}」，
          // 这类会走 tn 并记 miss；这里主要抓 el() 拼出来的固定片段）。
          t.split(/[\s·　/]+/).forEach(part => {
            if (part.length >= 2 && Object.prototype.hasOwnProperty.call(cat, part)) {
              bad.push(where + ': ' + part + '  (in "' + t + '")');
            }
          });
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
          const parent = node.parentNode && node.parentNode.tagName;
          if (parent && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent)) continue;
          consider(node.nodeValue, 'text');
        }
        document.querySelectorAll('[title], [placeholder], [aria-label]').forEach(el => {
          ['title', 'placeholder', 'aria-label'].forEach(attr => {
            if (el.hasAttribute(attr)) consider(el.getAttribute(attr), attr);
          });
        });
        return { bad, misses: Object.keys(window.__AE_I18N_MISSES || {}) };
      });
      assert.deepEqual(result.misses, [], label + ': AE.t/tn 漏翻（__AE_I18N_MISSES）');
      assert.deepEqual(result.bad, [], label + ': 可见中文残留');
    };

    await page.waitForSelector('#tbody tr');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.equal(await page.title(), 'WowAltBoard');
    await report('主页');

    // 设置五个页签。
    await page.locator('#btn-settings').click();
    const tabCount = await page.locator('#panel-tabs button').count();
    for (let i = 0; i < tabCount; i++) {
      await page.locator('#panel-tabs button').nth(i).click();
      await report('设置页签 ' + (i + 1));
    }
    await page.locator('#panel-close').click();

    // 角色详情。
    await page.locator('#tbody tr').first().click();
    await page.locator('#drawer-body').waitFor();
    await report('角色详情');
    await page.locator('#drawer-close').click();

    // 周趋势 / 备份箱 / 导出菜单。
    await page.locator('#btn-trends').click();
    await page.locator('#trend-body').waitFor();
    await report('周趋势');
    await page.locator('#trend-close').click();

    await page.locator('#btn-vault').click();
    await page.locator('#vault-body').waitFor();
    await report('备份箱');
    await page.locator('#vault-close').click();

    await page.locator('#btn-export-more').click();
    await report('导出菜单');

    // 毕业装备 + 天赋。
    await page.locator('#btn-bis').click();
    await page.waitForSelector('.bis-slots');
    await report('毕业装备');
    await page.locator('.bis-tabs button').nth(1).click();
    await page.waitForFunction(() => window.AE_TALENTS && window.AE_TALENT_TREE && window.AE_guide && window.AE_WCL);
    await page.waitForTimeout(800);
    await report('天赋页签');

    // 显式选择中文应当压过浏览器语言：在同一个 context 里存设置后重开。
    await page.evaluate(() => {
      AE.state.settings.uiLang = 'zh';
      AE.saveSettings(AE.state.settings);
    });
    const zh = await context.newPage();
    zh.on('pageerror', e => errors.push(e.message));
    await zh.route(/^https?:/, r => { network.push(r.request().url()); return r.abort(); });
    await zh.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await zh.waitForFunction(() => window.AE && AE.state && AE.state.model);
    assert.equal(await zh.evaluate(() => AE.i18n.lang()), 'zh', '显式保存的语言必须压过浏览器语言');
    assert.equal(await zh.evaluate(() => document.documentElement.lang), 'zh-CN');
    assert.equal(await zh.title(), 'WowAltBoard');
    await zh.close();

    assert.deepEqual(errors, [], '页面脚本错误');
    assert.deepEqual(network, [], '不应发出网络请求');
    console.log('英文巡检：主页 / 设置 5 页 / 详情 / 趋势 / 备份箱 / 导出 / 毕业装备 / 天赋 全部无漏翻，切回中文正常');
  } finally {
    if (browser) await browser.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
