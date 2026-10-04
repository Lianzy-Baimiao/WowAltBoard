'use strict';
// Independent file:// regression. No real character data, network or native updater is used.
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'WowAltBoard-version-'));
  let browser;
  try {
    const originalIndex = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    const metaPattern = /<meta id="application-version" name="application-version" content="([^"]*)">/;
    const bundled = metaPattern.exec(originalIndex)[1];
    await fs.mkdir(path.join(dir, 'app')); await fs.mkdir(path.join(dir, 'data'));
    for (const file of await fs.readdir(path.join(root, 'app'), { withFileTypes: true })) {
      if (file.isFile()) await fs.copyFile(path.join(root, 'app', file.name), path.join(dir, 'app', file.name));
    }
    for (const name of ['settings', 'manifest', 'bagsync']) await fs.writeFile(path.join(dir, 'data', name + '.js'), '/* empty fixture */');
    const lua = 'AlterEgoDB={global={characters={fixture={info={name="Fixture",realm="Test",level=90,class={file="DEATHKNIGHT",name="Death Knight"}},equipment={}}}}}';
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const cases = [
      { name: 'native upgrade retaining v1.17.3 snapshot', installed: '1.18.0', expected: '1.18.0', ready: true },
      { name: 'file browser uses package metadata', expected: bundled },
      { name: 'native receipt takes precedence', installed: '2.3.4', expected: '2.3.4' },
      { name: 'newer scanner does not upgrade application', installed: '1.18.0', scanner: '9.9.9', expected: '1.18.0' },
      { name: 'invalid native identity falls back to package', installed: 'bad-version', expected: bundled },
      { name: 'unknown identity never borrows scanner version', noMetadata: true, expected: '' },
      { name: 'saved future release compares installed version', installed: '1.18.0', latest: 'v9.9.9', expected: '1.18.0', banner: true }
    ];
    const results = [];
    for (const scenario of cases) {
      const index = scenario.noMetadata ? originalIndex.replace(metaPattern, '') : originalIndex;
      await fs.writeFile(path.join(dir, 'index.html'), index);
      const scanner = scenario.scanner || '1.17.3';
      const data = 'window.AE_DATA=' + JSON.stringify({ toolVersion: scanner, scannedAt: 1791072000,
        update: { checked: true, currentVersion: '1.17.3', latestVersion: scenario.latest || 'v1.18.0', url: 'https://github.com/Lianzy-Baimiao/WowAltBoard/releases/tag/v1.18.0' },
        sources: [{ id: 'fixture', account: 'fixture', flavor: 'retail', lua }] });
      await fs.writeFile(path.join(dir, 'data/data.js'), data);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route(/^https?:/, route => route.abort());
      if (scenario.installed) await page.addInitScript(installed => {
        window.AE_APP_UPDATE_BOOT = { protocol: 1, phase: 'idle', currentVersion: installed, automatic: false };
        window.requests = []; window.receivers = [];
        window.chrome.webview = { postMessage: m => requests.push(m), addEventListener: (kind, fn) => receivers.push(fn) };
      }, scenario.installed);
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.waitForFunction(() => window.AE && AE.state && AE.state.model);
      const label = scenario.expected ? 'v' + scenario.expected : '版本未知';
      assert.equal(await page.locator('#version-info').textContent(), label, scenario.name);
      assert.match(await page.locator('#version-info').getAttribute('title'), new RegExp('数据扫描工具 v' + scanner.replaceAll('.', '\\.')));
      assert.equal(await page.locator('#update-banner').isVisible(), !!scenario.banner, scenario.name + ': no phantom update from old scanner');
      if (scenario.banner) assert.ok((await page.locator('#update-text').textContent()).includes('当前 v1.18.0'));
      await page.locator('#btn-settings').click();
      await page.locator('#panel-tabs').getByRole('button', { name: '其他', exact: true }).click();
      assert.ok((await page.locator('#panel-body').textContent()).includes('WowAltBoard v' + (scenario.expected || '?')));
      assert.ok((await page.locator('.update-box').textContent()).startsWith('当前 v' + (scenario.expected || '?')));
      const box = page.locator('.app-updates');
      if (scenario.installed) assert.ok((await box.textContent()).includes('当前应用 v' + scenario.expected));
      if (scenario.ready) {
        await box.getByRole('button', { name: '检查应用更新', exact: true }).click();
        await page.evaluate(() => {
          const req = requests.filter(m => m.type === 'app-update').pop();
          receivers.forEach(fn => fn({ data: { type: 'app-update-result', id: req.id, done: true,
            state: { protocol: 1, phase: 'ready', currentVersion: '1.18.0', version: '9.9.9', ready: true, automatic: false } } }));
        });
        assert.ok((await box.textContent()).includes('v9.9.9 已下载'));
        assert.equal(await page.locator('#version-info').textContent(), 'v1.18.0', 'download target must not become current application');
        assert.ok((await box.textContent()).includes('当前应用 v1.18.0'));
      }
      assert.equal(await page.locator('#panel').evaluate(e => e.getBoundingClientRect().width), 380);
      assert.equal(await page.evaluate(() => AE.state.model.toolVersion), scanner, 'keep scanner provenance unchanged');
      assert.equal(await fs.readFile(path.join(dir, 'data/data.js'), 'utf8'), data, 'never rewrite the saved character snapshot');
      assert.deepEqual(errors, []);
      results.push({ scenario: scenario.name, homepage: label, scanner });
      await page.close();
    }
    console.log(JSON.stringify({ checks: results, settingsWidth: 380 }, null, 2));
  } finally {
    if (browser) await browser.close();
    const absolute = path.resolve(dir), temp = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(absolute.startsWith(temp) && path.basename(absolute).startsWith('WowAltBoard-version-'));
    await fs.rm(absolute, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
