/* Runs the real launcher poll/rescan handlers in a small C# harness. No UI/game needed. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var src = fs.readFileSync(path.join(__dirname, 'build-launcher.ps1'), 'utf8');
var start = src.indexOf('    static void OnPollTick(');
var end = src.indexOf('    // ---------------------------------------------------------------- main', start);
if (start < 0 || end < 0) throw Error('launcher watch handlers not found');
var code = `#pragma warning disable 0414
using System;
using System.IO;
using System.Collections.Generic;
using System.Windows.Forms;
public class WatchRegression {
    static Dictionary<string,string> LastSeen = new Dictionary<string,string>();
    static List<string> WatchFiles = new List<string>();
    static System.Windows.Forms.Timer Debounce = new System.Windows.Forms.Timer();
    static bool Rescanning;
    static long LastChangeTicks;
    static bool ScanPending;
    static string T_TRAYBUSY = "busy", T_TRAYIDLE = "idle", T_TRAYDONE = "done";
    static int calls;
    static bool succeed, writeDuringScan;
    static string stamp;
    static string Stamp(string f) { return stamp; }
    static bool RunScan(out string output) { calls++; output = ""; if(writeDuringScan) { stamp = "3"; writeDuringScan = false; } return succeed; }
    static void SetTrayText(string s) {}
    static void Notify(string s) {}
    static DialogResult FailScan(string s) { return DialogResult.Cancel; }
` + src.slice(start, end) + `
    static void Reset() { LastSeen.Clear(); WatchFiles.Clear(); WatchFiles.Add("save"); LastSeen["save"]="1"; stamp="2"; calls=0; succeed=false; writeDuringScan=false; ScanPending=false; LastChangeTicks=0; }
    static void Check(bool ok, string message) { if(!ok) throw new Exception(message); }
    public static void Run() {
        Reset(); OnPollTick(null, EventArgs.Empty);
        Check(calls==1, "changed save must trigger scan");
        succeed=true; OnPollTick(null, EventArgs.Empty);
        Check(calls==2, "failed scan must retry unchanged file on next poll");
        OnPollTick(null, EventArgs.Empty); Check(calls==2, "successful scan must not repeat");
        Reset(); succeed=true; writeDuringScan=true; OnPollTick(null, EventArgs.Empty);
        OnPollTick(null, EventArgs.Empty); Check(calls==2, "save written during scan must not be swallowed");
        Reset(); stamp="1"; Rescan(false); succeed=true; OnPollTick(null, EventArgs.Empty);
        Check(calls==2, "failed event/manual scan must retry even with unchanged metadata");
        Reset(); succeed=true;
        OnDebounceTick(null, EventArgs.Empty); Check(calls==0, "idle debounce must not scan");
        var worker = new System.Threading.Thread(delegate() { OnChanged(null, null); });
        worker.Start(); worker.Join();
        OnDebounceTick(null, EventArgs.Empty); Check(calls==0, "writer must get a quiet period");
        LastChangeTicks = DateTime.UtcNow.AddSeconds(-5).Ticks;
        OnDebounceTick(null, EventArgs.Empty); Check(calls==1, "worker notification must reach UI debounce");
        OnDebounceTick(null, EventArgs.Empty); Check(calls==1, "event must be consumed once");
        Console.WriteLine("Launcher watch: retry, concurrent save, worker notification checks passed");
    }
}`;
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-watch-'));
try {
  fs.writeFileSync(path.join(tmp, 'harness.cs'), code);
  fs.writeFileSync(path.join(tmp, 'run.ps1'), "$ErrorActionPreference = 'Stop'\nAdd-Type -Path (Join-Path $PSScriptRoot 'harness.cs') -ReferencedAssemblies System.Windows.Forms\n[WatchRegression]::Run()\n");
  var r = cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tmp, 'run.ps1')], { encoding: 'utf8' });
  process.stdout.write((r.stdout || '') + (r.stderr || ''));
  if (r.error) throw r.error;
  process.exitCode = r.status === 0 ? 0 : 1;
} finally {
  var full = path.resolve(tmp), prefix = path.resolve(os.tmpdir()) + path.sep;
  if (full.indexOf(prefix) !== 0 || path.basename(full).indexOf('WowAltBoard-watch-') !== 0) throw Error('unsafe cleanup');
  fs.rmSync(full, { recursive: true, force: true });
}
