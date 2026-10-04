'use strict';
// Independent UI contract for all equipment/talent choices, not just the presence of .on.
// Optional: Edge + Playwright. Uses bundled public assets and a fabricated character only.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const groups = ['.bis-tabs', '.bis-row', '.bis-bar .seg', '.lo-kind', '.lo-pick', '.tree-src', '.tree-pick', '.mr-builds'];
const skinProperties = ['backgroundColor', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius', 'boxShadow', 'fontSize', 'fontWeight', 'lineHeight', 'paddingLeft', 'paddingRight'];
async function inspectChoices(page) {
  await page.mouse.move(0, 0);
  await page.locator('#bis').evaluate(e => Promise.all(e.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
  const rows = await page.evaluate(({ groups, props }) => groups.flatMap(selector =>
    [...document.querySelectorAll('#bis ' + selector)].map(group => ({
      selector, gap: getComputedStyle(group).gap,
      buttons: [...group.querySelectorAll(':scope > button')].map(button => {
        const css = getComputedStyle(button);
        return {
          text: button.textContent, selected: button.classList.contains('on'),
          choice: button.classList.contains('bis-choice'), pressed: button.getAttribute('aria-pressed'),
          style: Object.fromEntries(props.map(p => [p, css[p]])),
          classChoice: button.classList.contains('cls'), color: css.color,
          height: button.getBoundingClientRect().height,
          // A group must wrap, not overflow past its container.
          fits: button.getBoundingClientRect().right <= group.getBoundingClientRect().right + 1
        };
      })
    }))
  ), { groups, props: skinProperties });
  assert.ok(rows.length >= 4);
  const reference = {}, textColors = {};
  for (const group of rows) {
    assert.equal(group.gap, '4px', group.selector + ' spacing');
    assert.ok(group.buttons.length > 0, group.selector + ' cannot silently skip');
    assert.equal(group.buttons.filter(b => b.selected).length, 1, group.selector + ' single selection');
    for (const button of group.buttons) {
      assert.ok(button.choice, group.selector + ': missing shared skin');
      assert.equal(button.pressed, String(button.selected), button.text + ': accessible state');
      assert.ok(button.height >= 30, button.text + ': click target');
      assert.ok(button.fits, button.text + ': group overflow');
      const state = String(button.selected);
      if (!reference[state]) reference[state] = button.style;
      assert.deepEqual(button.style, reference[state], group.selector + ' must use the same skin');
      assert.equal(button.style.borderTopWidth, '0px', 'no boxed tabs');
      assert.equal(button.style.borderRadius, '0px', 'no pill tabs');
      if (!button.classChoice) {
        if (!textColors[state]) textColors[state] = button.color;
        assert.equal(button.color, textColors[state], 'shared non-class text colors');
      }
    }
  }
  assert.notDeepEqual(reference.true, reference.false);
  const actions = await page.locator('#bis .lo-copy, #bis .mr-copy, #bis .bis-upd button').evaluateAll(bs =>
    bs.map(b => ({ choice: b.classList.contains('bis-choice'), pressed: b.hasAttribute('aria-pressed') })));
  assert.ok(actions.length >= 3);
  assert.ok(actions.every(b => !b.choice && !b.pressed), 'actions must not look/act like choices');
  return rows.map(g => g.selector);
}

(async () => {
  const root = path.resolve(__dirname, '..'), base = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(base, 'wow-bis-tabs-'));
  const screenshots = await fs.mkdtemp(path.join(base, 'wow-bis-tabs-shots-'));
  const results = [], covered = new Set();
  let browser;
  try {
    await fs.copyFile(path.join(root, 'index.html'), path.join(dir, 'index.html'));
    await fs.cp(path.join(root, 'app'), path.join(dir, 'app'), { recursive: true });
    await fs.mkdir(path.join(dir, 'data'));
    const lua = 'AlterEgoDB={global={characters={test={info={name="Fixture",realm="Test",level=90,class={file="DEATHKNIGHT",name="Death Knight"}},equipment={}}}}}';
    await fs.writeFile(path.join(dir, 'data/data.js'), 'window.AE_DATA=' + JSON.stringify({ scannedAt: 1791072000, sources: [{ id: 'fixture', account: 'test', flavor: 'retail', lua }] }));
    for (const f of ['settings', 'manifest', 'bagsync']) await fs.writeFile(path.join(dir, 'data', f + '.js'), '/* fixture */');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const theme of ['dark', 'light']) for (const skin of ['default', 'jade', 'amber', 'violet']) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
      const page = await context.newPage(), errors = [], network = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route(/^https?:/, r => { network.push(r.request().url()); return r.abort(); });
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.evaluate(({ theme, skin }) => {
        document.body.dataset.theme = theme;
        document.body.dataset.skin = skin;
      }, { theme, skin });
      await page.locator('#btn-bis').click();
      await page.waitForSelector('.bis-slots .item');
      await page.locator('#bis').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
      for (const g of await inspectChoices(page)) covered.add(g);
      const dots = await page.locator('#bis .cls').evaluateAll(bs => bs.map(b => ({
        color: getComputedStyle(b).color, dot: getComputedStyle(b, '::before').content,
        inlineColor: b.style.color, inlineBackground: b.style.background
      })));
      assert.equal(dots.length, 13);
      assert.equal(new Set(dots.map(d => d.color)).size, 13, 'retain recognizable class colors');
      assert.ok(dots.every(d => !d.inlineColor && !d.inlineBackground && ['none', 'normal'].includes(d.dot)), 'class text, no dot');
      if (skin === 'default') await page.screenshot({ path: path.join(screenshots, `${theme}-equipment.png`) });
      await page.locator('.bis-tabs').getByRole('button', { name: '天赋', exact: true }).click();
      await page.waitForSelector('.tnode img');
      for (const g of await inspectChoices(page)) covered.add(g);
      const initial = await page.evaluate(() => {
        const host = document.querySelector('#bis-body');
        return {
          treeStartsAt: Math.round(document.querySelector('.tree-canvas').getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop),
          contentHeight: host.scrollHeight, viewportHeight: host.clientHeight,
          importBoxes: host.querySelectorAll('.lo-text, .mr-text').length
        };
      });
      if (skin === 'default') await page.screenshot({ path: path.join(screenshots, `${theme}-talents.png`) });
      // Hover uses one visual language too; active controls keep the selected marker on hover.
      const hovered = [];
      for (const selector of ['.bis-tabs', '.bis-row', '.lo-kind', '.lo-pick', '.tree-src', '.mr-builds']) {
        const target = page.locator(selector + ' .bis-choice:not(.on)').first();
        await target.hover();
        await target.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
        hovered.push(await target.evaluate((b, props) => Object.fromEntries(props.map(p => [p, getComputedStyle(b)[p]])), skinProperties));
      }
      hovered.forEach(s => assert.deepEqual(s, hovered[0], 'same unselected hover skin'));
      for (const selector of ['.bis-tabs', '.bis-row', '.lo-kind', '.lo-pick', '.tree-src', '.mr-builds']) {
        await page.mouse.move(0, 0);
        const active = page.locator(selector + ' .bis-choice.on').first();
        await active.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
        const selectedSkin = await active.evaluate((b, props) => Object.fromEntries(props.map(p => [p, getComputedStyle(b)[p]])), skinProperties);
        await active.hover();
        await active.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
        assert.deepEqual(await active.evaluate((b, props) => Object.fromEntries(props.map(p => [p, getComputedStyle(b)[p]])), skinProperties), selectedSkin, 'hover must retain selected marker');
      }
      await page.keyboard.press('Tab');
      const nextGuide = page.locator('.mrb').nth(1);
      await nextGuide.focus();
      assert.equal(await nextGuide.evaluate(b => getComputedStyle(b).outlineStyle), 'solid');
      await nextGuide.press('Space');
      assert.equal(await page.locator('.mrb').nth(1).getAttribute('aria-pressed'), 'true');
      const focusLostOnSwitch = await page.evaluate(() => !document.activeElement.closest('#bis .bis-choice'));
      for (const g of await inspectChoices(page)) covered.add(g);
      // Semantic state tracks actual string selection, not merely paint.
      const first = await page.locator('.lo-text').inputValue();
      await page.locator('.lo-pick button').nth(1).click();
      assert.equal(await page.locator('.lo-pick button').nth(1).getAttribute('aria-pressed'), 'true');
      assert.notEqual(await page.locator('.lo-text').inputValue(), first);
      await page.locator('.tree-src button').nth(1).click();
      assert.equal(await page.locator('.tree-src button').nth(1).getAttribute('aria-pressed'), 'true');
      // Exercise the plugin route with real bundled builds. Only the guide availability is changed in this fixture.
      await page.evaluate(() => { window.AE_MAXROLL.specs[270].views = {}; });
      await page.locator('.bis-row .cls').getByText('武僧', { exact: true }).click();
      await page.locator('.spec[data-tip^="MONK/MISTWEAVER"]').click();
      await page.waitForSelector('.tree-pick .bis-choice');
      for (const g of await inspectChoices(page)) covered.add(g);
      for (const width of [600, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1100 });
        await inspectChoices(page);
      }
      assert.deepEqual(errors, []); assert.deepEqual(network, []);
      results.push({ theme, skin, ...initial, focusLostOnSwitch });
      await context.close();
    }
    assert.deepEqual([...covered].sort(), [...groups].sort(), 'every choice family covered');
    console.log(JSON.stringify({ results, groups: [...covered], screenshots, pageErrors: 0, networkRequests: 0 }, null, 2));
  } finally {
    if (browser) await browser.close();
    assert.equal(path.dirname(path.resolve(dir)), base);
    assert.ok(path.basename(dir).startsWith('wow-bis-tabs-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
