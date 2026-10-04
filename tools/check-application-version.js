'use strict';
// Independent version identity and real release-stamping fixtures. Never reads personal data/.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const vm = require('node:vm'), cp = require('node:child_process'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), code = fs.readFileSync(path.join(root, 'app/version.js'), 'utf8');
function version(boot, metadata, scanner) {
  const env = { AE_APP_UPDATE_BOOT: boot, AE_DATA: { toolVersion: scanner }, document: {
    getElementById: id => id === 'application-version' && metadata !== undefined ? { getAttribute: () => metadata } : null
  } };
  env.window = env; vm.runInNewContext(code, env);
  return env.AE.applicationVersion();
}
assert.equal(version({ protocol: 1, currentVersion: '1.18.0' }, '1.17.3', '1.17.3'), '1.18.0');
assert.equal(version(null, '1.18.0', '1.17.3'), '1.18.0');
assert.equal(version({ protocol: 1, currentVersion: '1.18.0', version: '9.9.9', ready: true }, '1.18.0', '9.9.9'), '1.18.0');
assert.equal(version({ protocol: 99, currentVersion: '9.9.9' }, '1.18.0', '1.17.3'), '1.18.0');
for (const value of ['0.0.0', 'bad', 'v1.18.0', '1.18', '1.18.0\n', 1180, null]) {
  assert.equal(version({ protocol: 1, currentVersion: value }, '1.18.0', '1.17.3'), '1.18.0');
}
assert.equal(version(null, undefined, '1.17.3'), '');
assert.equal(version(null, 'invalid', '1.17.3'), '');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.equal((index.match(/id="application-version"/g) || []).length, 1);
assert.ok(index.indexOf('src="app/version.js"') < index.indexOf('src="app/render.js"'));
if (process.platform === 'win32') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-version-package-'));
  function put(name, content) { const target = path.join(dir, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  function run(exe, args) {
    const result = cp.spawnSync(exe, args, { cwd: dir, encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || '') + (result.error || ''));
    return result.stdout;
  }
  try {
    const oldIndex = '<meta id="application-version" name="application-version" content="1.17.3">';
    put('index.html', oldIndex); put('tools/scan.ps1', "$TOOL_VERSION = '9.8.7'");
    for (const name of ['tests.html', 'README.md', 'LICENSE', '启动.bat', '更新数据.bat', '魔兽看板.exe',
      'app/main.js', 'app/panel.js', 'app/app-updates.js', 'tools/desktop/WowAltBoard.Desktop.exe',
      'tools/desktop/Microsoft.Web.WebView2.Core.dll', 'tools/desktop/Microsoft.Web.WebView2.WinForms.dll',
      'tools/desktop/x64/WebView2Loader.dll', 'tools/desktop/x86/WebView2Loader.dll',
      'tools/desktop/WebView2-LICENSE.txt', 'tools/desktop/WebView2-NOTICE.txt']) put(name, 'fixture');
    put('app/version.js', code); fs.mkdirSync(path.join(dir, 'docs'));
    put('tools/build-release.ps1', fs.readFileSync(path.join(root, 'tools/build-release.ps1')));
    const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    run(compiler, ['/nologo', '/target:winexe', '/out:' + path.join(dir, 'tools/desktop/WowAltBoard.Updater.exe'),
      ...['System.dll', 'System.Core.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', 'System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll'].map(r => '/reference:' + r),
      ...['app-updates.cs', 'app-update-package.cs', 'app-update-worker.cs'].map(f => path.join(root, 'tools', f))]);
    run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'tools/build-release.ps1'), '-SkipBuild']);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'WowAltBoard-v9.8.7-updates/app-release.json'), 'utf8'));
    assert.equal(manifest.version, '9.8.7');
    const entries = manifest.parts.flatMap(p => p.files), stamped = oldIndex.replace('1.17.3', '9.8.7');
    assert.equal(entries.find(e => e.path === 'index.html').sha256, crypto.createHash('sha256').update(stamped).digest('hex'));
    assert.ok(entries.some(e => e.path === 'app/version.js'));
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), oldIndex, 'stamp release copy, not source or character data');
    const zip = path.join(dir, 'WowAltBoard-v9.8.7.zip').replace(/'/g, "''");
    const actualIndex = run('powershell', ['-NoProfile', '-Command', "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('" + zip + "'); try { $entry=@($z.Entries | Where-Object { $_.FullName.Replace([char]92,[char]47) -eq 'WowAltBoard/index.html' })[0]; $r=[IO.StreamReader]::new($entry.Open()); try { [Console]::Write($r.ReadToEnd()) } finally { $r.Dispose() } } finally { $z.Dispose() }"]);
    assert.equal(actualIndex, stamped, 'full ZIP and incremental package both identify canonical release version');
  } finally {
    const absolute = path.resolve(dir);
    assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(absolute).startsWith('WowAltBoard-version-package-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  }
}
console.log('Application identity: native/package provenance, invalid/unknown identity, pending targets and real full/incremental release stamping passed');
