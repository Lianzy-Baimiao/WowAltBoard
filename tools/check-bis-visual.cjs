'use strict';
// Optional Edge/Playwright visual contract, independent of the data-repair tests.
// Compares the same bundled data under v1.17.3 CSS and current CSS. No private data/network.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const base = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(base, 'wow-bis-visual-'));
  const screenshots = await fs.mkdtemp(path.join(base, 'wow-bis-screenshots-'));
  const styles = {
    before: execFileSync('git', ['show', 'v1.17.3:app/style.css'], { cwd: root, encoding: 'utf8', maxBuffer: 2 ** 22 }),
    after: await fs.readFile(path.join(root, 'app/style.css'), 'utf8')
  };
  let browser;
  const results = [];
  try {
    await fs.copyFile(path.join(root, 'index.html'), path.join(dir, 'index.html'));
    await fs.cp(path.join(root, 'app'), path.join(dir, 'app'), { recursive: true });
    await fs.mkdir(path.join(dir, 'data'));
    const lua = 'AlterEgoDB={global={characters={test={info={name="Fixture",realm="Test",level=90,class={file="DEATHKNIGHT",name="Death Knight"}},equipment={}}}}}';
    await fs.writeFile(path.join(dir, 'data/data.js'), 'window.AE_DATA=' + JSON.stringify({ scannedAt: 1791072000, sources: [{ id: 'fixture', account: 'test', flavor: 'retail', lua }] }));
    for (const file of ['settings', 'manifest', 'bagsync']) await fs.writeFile(path.join(dir, 'data', file + '.js'), '/* fixture */');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const theme of ['dark', 'light']) {
      for (const width of [600, 1280, 1600, 1920]) {
        const pair = {};
        for (const [version, css] of Object.entries(styles)) {
          const context = await browser.newContext({ viewport: { width, height: 1100 } });
          const page = await context.newPage();
          const errors = [], network = [];
          page.on('pageerror', e => errors.push(e.message));
          await page.route(/^https?:/, r => { network.push(r.request().url()); return r.abort(); });
          await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
          await page.evaluate(({ css, theme }) => {
            const style = document.createElement('style');
            style.textContent = css;
            document.querySelector('link[href="app/style.css"]').replaceWith(style);
            document.body.dataset.theme = theme;
          }, { css, theme });
          await page.locator('#btn-bis').click();
          await page.waitForSelector('.bis-slots.doll .item');
          await page.locator('#bis').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
          const equipment = await page.evaluate(() => {
            const rect = selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            };
            const headers = selector => [...document.querySelectorAll(selector)].map(e => e.textContent);
            return {
              panel: rect('#bis'), body: rect('#bis-body'), documentWidth: document.documentElement.scrollWidth,
              columns: ['.left', '.right', '.weapons'].map(c => rect('.bis-slots ' + c)),
              slots: ['.left', '.right', '.weapons'].map(c => headers('.bis-slots ' + c + ' .slot-head > b')),
              items: [...document.querySelectorAll('.bis-slots .item')].map(e => e.dataset.tip),
              icons: [...document.querySelectorAll('.bis-slots .item img')].map(e => e.getAttribute('src')),
              overflow: document.querySelector('#bis-body').scrollWidth,
              iconWidth: rect('.item .icon').width,
              nameSize: parseFloat(getComputedStyle(document.querySelector('.item .im > b')).fontSize)
            };
          });
          assert.equal(equipment.slots[0].length, 6);
          assert.equal(equipment.slots[1].length, 8);
          assert.ok(equipment.slots[2].length >= 1 && equipment.slots[2].length <= 2);
          if (width > 760) {
            assert.ok(equipment.columns[0].x < equipment.columns[1].x);
            assert.equal(equipment.columns[0].y, equipment.columns[1].y);
          }
          assert.ok(equipment.columns[2].y >= equipment.columns[1].y + equipment.columns[1].height);
          await page.waitForFunction(() => [...document.querySelectorAll('.bis-slots img')].filter(i => i.complete && i.naturalWidth > 0).length >= 8);
          if (width === 1600) {
            await page.screenshot({ path: path.join(screenshots, `${version}-${theme}-equipment.png`) });
            await page.locator('.bis-slots').evaluate(e => e.scrollIntoView({ block: 'start' }));
            await page.screenshot({ path: path.join(screenshots, `${version}-${theme}-slots.png`) });
            await page.locator('.weapons').scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(screenshots, `${version}-${theme}-weapons.png`) });
          }
          // The other equipment view still uses collapsed slot summaries, not a new list.
          await page.locator('.bis-bar').getByRole('button', { name: '实战分布', exact: true }).click();
          const toggle = page.locator('.slot-head[role="button"]').first();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          await page.keyboard.press('Tab');
          await toggle.focus();
          if (version === 'after') {
            assert.equal(await toggle.evaluate(e => getComputedStyle(e).outlineStyle), 'solid');
            assert.equal(await toggle.evaluate(e => getComputedStyle(e, '::before').content), '""');
          }
          await toggle.press('Enter');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          assert.ok(await toggle.locator('..').locator('.slot-list').isVisible());
          if (width === 1600) await page.screenshot({ path: path.join(screenshots, `${version}-${theme}-distribution.png`) });
          await toggle.press('Space');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.ok(!(await toggle.locator('..').locator('.slot-list').isVisible()));
          await page.locator('.bis-tabs').getByRole('button', { name: '天赋', exact: true }).click();
          await page.waitForSelector('.tnode img');
          const talents = await page.evaluate(() => ({
            width: document.querySelector('#bis').getBoundingClientRect().width,
            overflow: document.querySelector('#bis-body').scrollWidth,
            text: document.querySelector('#bis-body').textContent,
            nodes: [...document.querySelectorAll('.tnode')].map(n => ({
              text: n.textContent, classes: n.className, position: n.getAttribute('style'),
              width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height,
              icon: n.querySelector('img')?.getAttribute('src')
            }))
          }));
          assert.ok(talents.nodes.length > 50);
          assert.ok(talents.nodes.every(n => n.width === 62 && n.height === 50));
          if (width === 1600) {
            await page.screenshot({ path: path.join(screenshots, `${version}-${theme}-talents.png`) });
            await page.locator('.tree-cols.main-row').scrollIntoViewIfNeeded();
            await page.waitForFunction(() => [...document.querySelectorAll('.tnode img')].every(i => i.complete && i.naturalWidth > 0));
            await page.screenshot({ path: path.join(screenshots, `${version}-${theme}-tree.png`) });
          }
          // Source/kind/build controls must show which choice is active (previously .on was unstyled).
          if (version === 'after') {
            for (const group of ['.lo-kind', '.lo-pick', '.tree-src']) {
              const active = page.locator(group + ' button.on');
              const inactive = page.locator(group + ' button:not(.on)');
              assert.equal(await active.count(), 1);
              if (await inactive.count()) {
                const look = e => {
                  const s = getComputedStyle(e);
                  return [s.backgroundColor, s.borderColor, s.boxShadow];
                };
                assert.notDeepEqual(await active.evaluate(look), await inactive.first().evaluate(look));
              }
            }
          }
          const loadout = page.locator('.lo-text');
          const firstString = await loadout.inputValue();
          await page.locator('.lo-pick button').nth(1).click();
          assert.ok(await page.locator('.lo-pick button').nth(1).evaluate(e => e.classList.contains('on')));
          assert.notEqual(await page.locator('.lo-text').inputValue(), firstString);
          // A non-first guide can still be selected; the copied string remains read-only.
          const guides = page.locator('.mrb');
          if (await guides.count() > 1) {
            await guides.nth(1).click();
            assert.ok(await guides.nth(1).evaluate(e => e.classList.contains('on')));
          }
          for (const field of await page.locator('.lo-text, .mr-text').all()) {
            assert.equal(await field.getAttribute('readonly'), '');
          }
          assert.deepEqual(errors, []);
          assert.deepEqual(network, []);
          pair[version] = { equipment, talents };
          await context.close();
        }
        const { before, after } = pair;
        assert.equal(after.equipment.panel.width, before.equipment.panel.width, 'panel width unchanged');
        assert.equal(after.equipment.panel.x, before.equipment.panel.x, 'panel stays anchored');
        assert.equal(after.equipment.body.width, before.equipment.body.width, 'content width unchanged');
        assert.equal(after.equipment.documentWidth, before.equipment.documentWidth, 'page width unchanged');
        assert.equal(after.talents.width, before.talents.width, 'talent panel width unchanged');
        assert.deepEqual(after.equipment.slots, before.equipment.slots, 'slot ordering unchanged');
        assert.deepEqual(after.equipment.items, before.equipment.items, 'equipment data unchanged');
        assert.deepEqual(after.equipment.icons, before.equipment.icons, 'game icons retained');
        assert.deepEqual(after.talents.nodes, before.talents.nodes, 'talent data/coordinates/icons unchanged');
        assert.equal(after.talents.text, before.talents.text, 'talent/source labels unchanged');
        assert.ok(after.equipment.overflow <= before.equipment.overflow, 'no new equipment overflow');
        assert.ok(after.talents.overflow <= before.talents.overflow, 'no new talent overflow');
        assert.ok(after.equipment.iconWidth > before.equipment.iconWidth, 'equipment icons easier to see');
        results.push({ theme, viewport: width, panel: after.equipment.panel.width, items: after.equipment.items.length, nodes: after.talents.nodes.length });
      }
    }
    console.log(JSON.stringify({ results, screenshots, pageErrors: 0, networkRequests: 0 }, null, 2));
  } finally {
    if (browser) await browser.close();
    assert.equal(path.dirname(path.resolve(dir)), base);
    assert.ok(path.basename(dir).startsWith('wow-bis-visual-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
