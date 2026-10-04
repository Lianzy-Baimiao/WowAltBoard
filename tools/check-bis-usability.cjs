// Browser acceptance for the revised tabs and optimizations 1/2/4. No personal data or live requests.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
async function verifyDrawnString(page, str) {
  const result = await page.evaluate(str => {
    const decoded = AE.TalentDecode.decode(str, AE_TALENT_TREE);
    return [...document.querySelectorAll('.tnode')].map(n => {
      const hit = decoded.nr[n.dataset.node];
      return { id: n.dataset.node, selected: n.classList.contains('on'), expected: !!hit,
        rank: n.querySelector('.r')?.textContent.split('/')[0], expectedRank: String(hit?.rank || 0) };
    });
  }, str);
  assert.ok(result.length > 50);
  result.forEach(n => {
    assert.equal(n.selected, n.expected, 'node ' + n.id + ' must match copied string');
    if (n.rank) assert.equal(n.rank, n.expectedRank);
  });
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wow-bis-usability-'));
  const shots = await fs.mkdtemp(path.join(os.tmpdir(), 'wow-bis-usability-shots-'));
  let browser;
  try {
    await fs.copyFile(path.join(root, 'index.html'), path.join(dir, 'index.html'));
    await fs.cp(path.join(root, 'app'), path.join(dir, 'app'), { recursive: true });
    await fs.mkdir(path.join(dir, 'data'));
    const lua = 'AlterEgoDB={global={characters={test={info={name="Fixture",realm="Test",level=90,class={file="DEATHKNIGHT",name="Death Knight"}},equipment={}}}}}';
    await fs.writeFile(path.join(dir, 'data/data.js'), 'window.AE_DATA=' + JSON.stringify({ scannedAt: 1791072000, sources: [{ id: 'fixture', account: 'test', flavor: 'retail', lua }] }));
    for (const f of ['settings', 'manifest', 'bagsync']) await fs.writeFile(path.join(dir, 'data', f + '.js'), '/* fixture */');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, r => r.abort());
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.locator('#btn-bis').click();
    await page.waitForSelector('.bis-slots .item');
    await page.waitForFunction(() => window.AE_RIO && window.AE_MAXROLL && window.AE_TALENT_TREE);
    await page.locator('#bis').evaluate(e => Promise.all(e.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
    const skin = await page.locator('.bis-tabs .bis-choice').first().evaluate(b => {
      const s = getComputedStyle(b);
      return { border: s.borderTopWidth, radius: s.borderRadius, dot: getComputedStyle(document.querySelector('.cls'), '::before').content };
    });
    assert.equal(skin.border, '0px', 'tabs are no longer boxed buttons');
    assert.equal(skin.radius, '0px', 'tabs are not pills');
    assert.ok(['none', 'normal'].includes(skin.dot), 'class color belongs to text, not dots');
    assert.equal(await page.locator('#bis').evaluate(b => b.getBoundingClientRect().width), 1160);
    assert.ok(await page.locator('.iv-label').count(), 'item level basis is visible without hovering');
    await page.locator('.bis-tabs').getByRole('button', { name: '天赋', exact: true }).click();
    await page.waitForSelector('.tnode img');
    await page.waitForFunction(() => window.AE_TALENT_DESC && window.AE_WCL);
    assert.equal(await page.locator('.lo-text').isVisible(), false);
    assert.equal(await page.locator('.mr-text').isVisible(), false);
    assert.equal(await page.locator('.lo-copy').isVisible(), true);
    assert.equal(await page.locator('.mr-copy').isVisible(), true);
    const treeStartsAt = await page.evaluate(() => {
      const h = document.querySelector('#bis-body');
      return Math.round(document.querySelector('.tree-canvas').getBoundingClientRect().top - h.getBoundingClientRect().top + h.scrollTop);
    });
    assert.ok(treeStartsAt < 720, 'first tree should move up from the previous 828px: ' + treeStartsAt);
    await page.evaluate(() => { window.AE.copyWithToast = s => { window.copied = s; }; });
    // Equal details titles must not share their open-state key across the two sources.
    await page.locator('.mr-details summary').click();
    await page.locator('.lo-pick .bis-choice').nth(1).click();
    assert.equal(await page.locator('.mr-text').isVisible(), true);
    assert.equal(await page.locator('.lo-text').isVisible(), false);
    await page.locator('.mr-details summary').click();
    await page.locator('.lo-pick .bis-choice').first().click();
    const guide = await page.locator('.mr-text').inputValue();
    await page.locator('.tree-copy').click();
    assert.equal(await page.evaluate(() => window.copied), guide);
    await verifyDrawnString(page, guide);
    await page.locator('.tree-src .bis-choice').nth(1).click();
    const ranked = await page.locator('.lo-text').inputValue();
    await page.locator('.tree-copy').click();
    assert.equal(await page.evaluate(() => window.copied), ranked);
    await verifyDrawnString(page, ranked);
    assert.match(await page.locator('.tree-current').textContent(), /榜上 #1/);
    await page.locator('.lo-pick .bis-choice').nth(1).click();
    await page.locator('.tree-copy').click();
    assert.equal(await page.evaluate(() => window.copied), await page.locator('.lo-text').inputValue());
    assert.match(await page.locator('.tree-current').textContent(), /榜上 #2/);
    await page.locator('.bis-loadout .lo-details summary').click();
    assert.equal(await page.locator('.lo-text').isVisible(), true);
    assert.equal(await page.locator('.lo-text').evaluate(t => t.readOnly), true);
    // A failed ranked decoder must copy the actual fallback, never the requested but undrawn string.
    await page.evaluate(() => {
      const decode = window.originalDecode = AE.TalentDecode.decode;
      const invalid = document.querySelector('.lo-text').value;
      AE.TalentDecode.decode = (str, tree) => str === invalid ? { err: 'fixture failure' } : decode(str, tree);
      AE.rerenderBis();
    });
    assert.match(await page.locator('.tree-current').textContent(), /maxroll/);
    await page.locator('.tree-copy').click();
    assert.equal(await page.evaluate(() => window.copied), guide);
    assert.notEqual(guide, ranked);
    await page.evaluate(() => { AE.TalentDecode.decode = window.originalDecode; });
    await page.locator('.tree-src .bis-choice').first().click();
    // Multi-hero originals must not be presented as an exact single-hero export.
    await page.locator('.mrb').nth(1).click();
    assert.match(await page.locator('.tree-copy').textContent(), /含多英雄/);
    const bundled = await page.locator('.mr-text').inputValue();
    await page.locator('.tree-pick .bis-choice').nth(1).click();
    await page.locator('.tree-copy').click();
    assert.equal(await page.evaluate(() => window.copied), bundled);
    await verifyDrawnString(page, bundled);
    // If neither source can be rendered, no current-tree copy action may remain.
    await page.evaluate(() => { AE.TalentDecode.decode = () => ({ err: 'fixture both sources invalid' }); AE.rerenderBis(); });
    assert.equal(await page.locator('.tree-copy').count(), 0);
    await page.evaluate(() => { AE.TalentDecode.decode = window.originalDecode; });
    await page.locator('.mrb').first().click();
    await page.locator('.lo-pick .bis-choice').first().click();
    if (await page.locator('.lo-text').isVisible()) await page.locator('.ranked-details summary').click();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.body.dataset.theme = theme; document.querySelector('#bis-body').scrollTop = 0; }, theme);
      await page.locator('#bis').evaluate(e => Promise.all(e.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
      await page.screenshot({ path: path.join(shots, theme + '-talents.png') });
      await page.locator('.bis-tabs').getByRole('button', { name: '毕业装备', exact: true }).click();
      await page.screenshot({ path: path.join(shots, theme + '-equipment.png') });
      await page.locator('.bis-tabs').getByRole('button', { name: '天赋', exact: true }).click();
    }
    // Plugin fallback has no corresponding import string; never offer a different source as equivalent.
    await page.evaluate(() => { AE_MAXROLL.specs[270].views = {}; });
    await page.locator('.cls').getByText('武僧', { exact: true }).click();
    await page.locator('.spec[data-tip^="MONK/MISTWEAVER"]').click();
    assert.equal(await page.locator('.tree-copy').count(), 0);
    assert.match(await page.locator('.tree-current').textContent(), /没有对应导入串/);
    assert.equal(await page.locator('.lo-copy').count(), 1);
    // Each source has its own metadata, including explicitly unknown dates.
    await page.locator('.bis-upd > summary').click();
    assert.match(await page.locator('li[data-source="AE_TALENTS"]').textContent(), /日期：未提供/);
    assert.match(await page.locator('li[data-source="AE_MAXROLL"]').textContent(), /保留快照/);
    const dates = await page.locator('.bis-source-list li .note').allTextContents();
    assert.equal(dates.length, 8);
    assert.ok(!await page.locator('.bis-upd').evaluate(e => /页面自己拉不了|\*\*/.test(e.textContent)));
    // Simulate a mixed update entirely with bundled fixtures: remote success is not necessarily newer.
    const allowed = new Set(['bis-data.js', 'rio-data.js', 'maxroll-data.js', 'wcl-data.js', 'talent-data.js', 'talent-tree.js', 'talent-desc.js', 'item-icons.js']);
    await page.unroute(/^https?:/);
    await page.route(/^https?:/, async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (!allowed.has(name) || name === 'rio-data.js' || name === 'wcl-data.js') return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'app', name), 'utf8') });
    });
    await page.getByRole('button', { name: '重新加载远端副本（仅本次会话）', exact: true }).click();
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('.bis-source-list li')];
      return rows.length === 8 && rows.every(r => ['remote', 'fallback'].includes(r.dataset.status));
    });
    assert.equal(await page.locator('li[data-status="remote"]').count(), 6);
    assert.equal(await page.locator('li[data-status="fallback"]').count(), 2);
    assert.match(await page.locator('.bis-load-summary').textContent(), /2 项远端失败，已回退包内/);
    assert.deepEqual(await page.locator('.bis-source-list li .note').allTextContents(), dates, 'click time must not replace source dates');
    await page.locator('.bis-upd > summary').click();
    await page.locator('.bis-upd').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'source-status.png') });
    // An optional file missing both remotely and locally must say failed, not fallback/success.
    await fs.unlink(path.join(dir, 'app', 'wcl-data.js'));
    await page.getByRole('button', { name: '重新加载远端副本（仅本次会话）', exact: true }).click();
    await page.waitForSelector('li[data-source="AE_WCL"][data-status="failed"]', { state: 'attached' });
    assert.match(await page.locator('.bis-load-summary').textContent(), /1 项加载失败/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ treeStartsAt, shots }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (!dir.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('unsafe temp cleanup');
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
