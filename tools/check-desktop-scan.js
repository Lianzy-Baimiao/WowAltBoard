/* Exercise the native worker with the real scanner, plus failure/timeout fixtures. */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
var root = path.resolve(__dirname, '..');
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-manual-scan-'));
function write(p, text) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
try {
  var base = path.join(tmp, 'Board with spaces'), tools = path.join(base, 'tools'), wow = path.join(tmp, 'World of Warcraft');
  fs.mkdirSync(tools, { recursive: true });
  fs.mkdirSync(path.join(wow, '_retail_', 'Interface'), { recursive: true });
  write(path.join(wow, '_retail_', 'WTF', 'Account', 'TEST', 'SavedVariables', 'AlterEgo.lua'),
    'AlterEgoDB = { ["global"] = { ["weeklyReset"] = 1, ["characters"] = {}, }, }\n');
  fs.copyFileSync(path.join(root, 'tools', 'scan.ps1'), path.join(tools, 'scan.ps1'));
  write(path.join(tools, 'config.json'), JSON.stringify({ wowPaths: [wow], checkForUpdates: false,
    absorbDownloadedSettings: false, collectBackups: false, readBagSync: false, includeFlavors: ['_retail_'] }));
  var harness = `
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Security.Cryptography;
public static class ManualScanTest {
    static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    public static void Run(string root) {
        Check(DesktopScanner.Run(root) == null, "real scanner must succeed");
        string marker = Path.Combine(root, "data", "scan-status.js");
        string oldMarker = File.ReadAllText(marker);
        Check(oldMarker.Contains("scanId"), "scan must publish its completion marker");
        string key = Path.GetFullPath(root).TrimEnd('\\\\').ToUpperInvariant();
        string digest;
        using (var hash = SHA256.Create()) digest = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(key))).Replace("-", "");
        using (var gate = new Mutex(false, "Local\\\\WowAltBoard.Scan-" + digest)) {
            gate.WaitOne();
            Task<string> run = null;
            try {
                run = Task.Run(() => DesktopScanner.Run(root));
                Thread.Sleep(1500);
                Check(!run.IsCompleted, "scan must wait for another process's scan lock");
                Check(File.ReadAllText(marker) == oldMarker, "waiting scan must not change output");
            } finally { gate.ReleaseMutex(); }
            Check(run.Wait(15000) && run.Result == null, "scan must finish after the lock is released");
        }
        Check(File.ReadAllText(marker) != oldMarker, "completed manual scan publishes fresh output");
        string script = Path.Combine(root, "tools", "scan.ps1");
        File.WriteAllText(script, "1..4000 | ForEach-Object { [Console]::Out.WriteLine('output noise'); [Console]::Error.WriteLine('error noise') }; Write-Output 'SCAN_ERROR=SV_UNREADABLE'; exit 1");
        Check(DesktopScanner.Run(root) == "SV_UNREADABLE", "verbose errors must drain both pipes and preserve the code");
        File.WriteAllText(script, "Start-Sleep -Seconds 20; exit 0");
        Check(DesktopScanner.Run(root, 1000) == "TIMEOUT", "a stalled scan must stop and report timeout");
        File.Delete(script);
        Check(DesktopScanner.Run(root) == "MISSING_SCRIPT", "missing scanner must not report success");
        Console.WriteLine("Desktop scan: real scan, completion marker, process lock, verbose failure, timeout, missing script passed");
    }
}`;
  // Do not depend on WebView2/WinForms for this worker-level integration test.
  write(path.join(tmp, 'test.cs'), fs.readFileSync(path.join(root, 'tools', 'desktop-scan.cs'), 'utf8').replace(/^\uFEFF/, '')
    + '\nnamespace Regression {\n' + harness + '\n}');
  var escaped = base.replace(/'/g, "''");
  write(path.join(tmp, 'run.ps1'), "$ErrorActionPreference = 'Stop'\nAdd-Type -Path (Join-Path $PSScriptRoot 'test.cs') -ReferencedAssemblies System.Core\n[Regression.ManualScanTest]::Run('" + escaped + "')\n");
  var r = cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tmp, 'run.ps1')], { encoding: 'utf8', timeout: 45000 });
  process.stdout.write((r.stdout || '') + (r.stderr || ''));
  if (r.error) throw r.error;
  process.exitCode = r.status === 0 ? 0 : 1;
} finally {
  var full = path.resolve(tmp), prefix = path.resolve(os.tmpdir()) + path.sep;
  if (full.indexOf(prefix) !== 0 || path.basename(full).indexOf('WowAltBoard-manual-scan-') !== 0) throw Error('unsafe cleanup');
  fs.rmSync(full, { recursive: true, force: true });
}
