'use strict';
// Optional real-browser regression: NODE_PATH may point to an external Playwright installation.
// Uses only bundled assets + a fabricated character; never opens private data/ or the network.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..'), base = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(base, 'wow-talent-browser-'));
  let browser;
  try {
    await fs.copyFile(path.join(root, 'index.html'), path.join(dir, 'index.html'));
    await fs.cp(path.join(root, 'app'), path.join(dir, 'app'), { recursive: true });
    await fs.mkdir(path.join(dir, 'data'));
    const lua = 'AlterEgoDB={global={characters={test={info={name="Fixture",realm="Test",level=90,class={file="MONK",name="Monk"}},equipment={}}}}}';
    await fs.writeFile(path.join(dir, 'data/data.js'), 'window.AE_DATA=' + JSON.stringify({ scannedAt: 1791072000, sources: [{ id:'fixture', account:'test', flavor:'retail', lua }] }));
    for (const f of ['settings', 'manifest', 'bagsync']) await fs.writeFile(path.join(dir, 'data', f + '.js'), '/* fixture */');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const errors = [], network = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, r => { network.push(r.request().url()); return r.abort(); });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.locator('#btn-bis').click();
    await page.waitForFunction(() => window.AE_MAXROLL && window.AE_RIO && window.AE_TALENT_TREE);
    await page.locator('.bis-tabs').getByRole('button', { name: '天赋', exact: true }).click();
    await page.waitForFunction(() => window.AE_TALENTS && window.AE_TALENT_DESC && window.AE_WCL);
    let categories = 0;
    for (const [key, cls, sid, rejected, count] of [
      ['MONK/MISTWEAVER', '武僧', 270, [50,85,89,94], 8],
      ['WARRIOR/PROTECTION', '战士', 73, [73,88], 2]
    ]) {
      // Exercise the original plugin fallback even when an editorial guide exists.
      await page.evaluate(sid => { window.AE_MAXROLL.specs[sid].views = {}; }, sid);
      await page.locator('.bis-pick .cls').getByText(cls, { exact: true }).click();
      await page.locator('.bis-pick .spec[data-tip^="' + key + '"]').first().click();
      assert.ok((await page.locator('.bis-warn').allTextContents()).some(t => t.includes('已隔离 ' + count + ' 条')));
      for (const [cat, label] of [['raid','团本'], ['mplusHigh','冲分'], ['mplusFarm','割草']]) {
        await page.locator('.bis-bar').getByRole('button', { name: label, exact: true }).click();
        const result = await page.evaluate(({ key, cat, rejected }) => {
          const rows = window.AE_TALENTS.specs[key].content[cat].flatMap(e => e.p).filter(p => !rejected.includes(p[0]));
          const people = new Set(rows.map(p => p[2] + '|' + p[3] + '|' + p[4])).size;
          const shown = [...document.querySelectorAll('.bis-encs tr')].filter(r => r.querySelector('td')).map(r => +r.children[5].textContent.slice(1));
          const stats = document.querySelector('.bis-bstats summary');
          const picks = [...document.querySelectorAll('.tree-pick button')].map(b => +b.textContent.match(/^#(\d+)/)[1]);
          return { expected: rows.map(p => p[0]), shown, people, stats: stats && stats.textContent, picks };
        }, { key, cat, rejected });
        assert.deepEqual(result.shown, result.expected, key + '/' + cat + ': player mapping');
        assert.ok(result.stats.includes(result.people + ' 个角色'), key + '/' + cat + ': count excludes rejected rows');
        assert.ok(result.picks.every(i => !rejected.includes(i)), 'invalid build cannot become a pick');
        categories++;
      }
    }
    // Inject a missing reference at the actual consumer seam: it must not masquerade as build zero.
    await page.evaluate(() => {
      window.AE_TALENTS.specs['WARRIOR/PROTECTION'].content.mplusFarm[0].p.push([999999,0,'INVALID_SENTINEL',0,'eu']);
      window.AE.rerenderBis();
    });
    assert.ok(!(await page.locator('#bis-body').innerText()).includes('INVALID_SENTINEL'));
    assert.ok((await page.locator('.bis-warn').allTextContents()).some(t => t.includes('已隔离 3 条')));
    await page.waitForFunction(() => [...document.querySelectorAll('.tnode img')].every(i => i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: path.join(base, 'wow-1173-repair-talents.png') });
    await page.locator('.bis-tabs').getByRole('button', { name: '毕业装备', exact: true }).click();
    await page.waitForSelector('.bis-slots.doll');
    const layout = await page.locator('.bis-slots.doll').evaluate(d => {
      const l=d.querySelector('.left'), r=d.querySelector('.right'), w=d.querySelector('.weapons');
      const a=l.getBoundingClientRect(), b=r.getBoundingClientRect(), c=w.getBoundingClientRect();
      return { left:l.children.length, right:r.children.length, weapons:w.children.length, positioned:a.x<b.x && Math.abs(a.y-b.y)<3 && c.y>a.y };
    });
    assert.equal(layout.left, 6); assert.equal(layout.right, 8); assert.ok(layout.weapons >= 1 && layout.weapons <= 2); assert.ok(layout.positioned);
    await page.waitForFunction(() => [...document.querySelectorAll('.bis-slots img')].filter(i => i.complete && i.naturalWidth>0).length >= 15);
    await page.locator('.bis-slots.doll').screenshot({ path: path.join(base, 'wow-1173-repair-equipment.png') });
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    console.log(JSON.stringify({ categories, invalidReferenceHidden:true, layout, pageErrors:0, networkRequests:0 }));
  } finally {
    if (browser) await browser.close();
    assert.equal(path.dirname(path.resolve(dir)), base);
    assert.ok(path.basename(dir).startsWith('wow-talent-browser-'));
    await fs.rm(dir, { recursive:true, force:true });
  }
})().catch(e => { console.error(e); process.exitCode=1; });
