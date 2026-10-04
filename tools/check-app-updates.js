'use strict';
// Independent executable fixtures against the actual .NET engine; no network or personal files.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-app-update-test-'));
const harness = `using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Net;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
internal static class UpdateTests {
 static int checks;
 static void Ok(bool value, string label) { if (!value) throw new Exception(label); checks++; Console.WriteLine("PASS " + label); }
 static void Put(string dir, string rel, string text) { string f = AppUpdates.Safe(dir, rel); Directory.CreateDirectory(Path.GetDirectoryName(f)); File.WriteAllText(f, text, new UTF8Encoding(false)); }
 static byte[] Bytes(object o) { return Encoding.UTF8.GetBytes(AppUpdates.Json.Serialize(o)); }
 sealed class Fixture {
  public string root, target, output; public AppUpdates.Manifest manifest; public AppUpdates engine;
  public List<string> requests = new List<string>(); public bool bad, network, cancelled;
  public Fixture(string name) {
   string home = Path.Combine(Path.GetDirectoryName(typeof(UpdateTests).Assembly.Location), name); Directory.CreateDirectory(home);
   root = Path.Combine(home, "install"); target = Path.Combine(home, "publish"); output = Path.Combine(home, "assets"); Directory.CreateDirectory(root); Directory.CreateDirectory(target);
   var files = new Dictionary<string,string> {
    {"index.html", "old page"}, {"app/main.js", "old main"}, {"app/panel.js", "old settings"}, {"app/app-updates.js", "old update UI"},
    {"tools/scan.ps1", "$TOOL_VERSION = '1.0.0'"}, {AppUpdates.Launcher, "old launcher"}, {"tools/desktop/WowAltBoard.Desktop.exe", "old host"},
    {"tools/desktop/WowAltBoard.Updater.exe", "old updater"}, {"tools/desktop/Microsoft.Web.WebView2.Core.dll", "unchanged runtime"},
    {"app/icons/sword.jpg", "unchanged icon"}, {"app/dropped.js", "old retired file"}, {"README.md", "readme"}
   };
   foreach(var f in files) { Put(root,f.Key,f.Value); Put(target,f.Key,f.Value); }
   Put(root,"tools/config.json","{gamePaths:'PRIVATE'}"); Put(root,"data/data.js","PRIVATE CHARACTERS"); Put(root,"data/webview2/settings","PRIVATE SETTINGS"); Put(root,"user-note.txt","USER NOTE");
   AppUpdatePackage.Build(root,"1.0.0",Path.Combine(home,"base-assets"));
   Put(target,"app/main.js","new main"); Put(target,"app/added.js","new feature"); File.Delete(AppUpdates.Safe(target,"app/dropped.js"));
   Put(target,"app/icons/new--.jpg","new icon"); Put(target,"docs/release-1.0.1.md","versioned notes"); Put(target,"tools/config.json","MUST NOT SHIP"); Put(target,"data/data.js","MUST NOT SHIP");
   AppUpdatePackage.Build(target,"1.0.1",output); manifest = AppUpdates.ReadManifest(Path.Combine(output,"app-release.json")); engine = new AppUpdates(root,Download);
  }
  public byte[] Download(Uri uri,long limit,CancellationToken token) {
   requests.Add(uri.AbsoluteUri); if(network)throw new WebException(); if(cancelled)throw new OperationCanceledException();
   if(uri.AbsoluteUri.EndsWith("app-release.json")) return Bytes(manifest);
   var bytes=File.ReadAllBytes(Path.Combine(output,Path.GetFileName(uri.AbsolutePath))); if(bad)bytes[0]^=0x7f; return bytes;
  }
  public AppUpdates.Result Run(string action,bool automatic=false) { return engine.Run(action,automatic,CancellationToken.None); }
  public void Personal() { Ok(File.ReadAllText(Path.Combine(root,"tools/config.json")).Contains("PRIVATE"),"game paths preserved"); Ok(File.ReadAllText(Path.Combine(root,"data/data.js"))=="PRIVATE CHARACTERS","characters preserved"); Ok(File.ReadAllText(Path.Combine(root,"data/webview2/settings"))=="PRIVATE SETTINGS","WebView settings preserved"); Ok(File.ReadAllText(Path.Combine(root,"user-note.txt"))=="USER NOTE","unmanaged file preserved"); }
 }
 static void Main(string[] args) {
  if(args.Length==3 && args[0]=="--handoff") {
   var engine=new AppUpdates(args[1],(uri,limit,token)=>File.ReadAllBytes(Path.Combine(args[2],Path.GetFileName(uri.AbsolutePath))));
   if(engine.Run("check",false,CancellationToken.None).phase!="available" || engine.Run("download",false,CancellationToken.None).phase!="ready")Environment.Exit(5);
   engine.LaunchWorker(false); return;
  }
  if(args.Length==2 && args[0]=="--crash") { AppUpdates.Apply(args[1],written=>{if(written==3)Environment.Exit(77);}); return; }
  var f=new Fixture("delta");
  Ok(new[]{"app/icons/new--.jpg","docs/release-1.0.1.md"}.All(path=>f.manifest.parts.SelectMany(p=>p.files).Any(e=>e.path==path)),"hyphenated icons and versioned docs included in manifest");
  Ok(!f.engine.Current().automatic,"automatic download is opt-in"); f.Run("auto"); Ok(f.requests.Count==0,"disabled auto performs no HTTP");
  var current=f.manifest; f.manifest=AppUpdates.ReadManifest(Path.Combine(f.root,"app-release.json"));
  Ok(f.Run("check").phase=="current" && f.requests.Count==1,"identical version downloads only manifest"); f.manifest=current; f.requests.Clear();
  var available=f.Run("check"); Ok(available.phase=="available" && available.changed==4,"new/changed files calculated from actual bytes");
  int expected=f.manifest.parts.Count(p=>p.files.Any(e=>!AppUpdates.Matches(AppUpdates.Safe(f.root,e.path),e)));
  Ok(available.packages==expected && available.bytes>0,"component download size calculated");
  Ok(f.Run("download").phase=="ready","verified stage ready");
  Ok(f.requests.Count==expected+1,"only changed components requested");
  Ok(File.ReadAllText(Path.Combine(f.root,"app/main.js"))=="old main","download never mutates running app");
  Ok(new AppUpdates(f.root,f.Download).Current().phase=="ready","ready state persists across restart");
  Ok(!f.manifest.parts.SelectMany(p=>p.files).Any(e=>e.path.Contains("config.json")||e.path.StartsWith("data/")),"publisher excludes private paths");
  AppUpdates.Apply(f.root);
  Ok(File.ReadAllText(Path.Combine(f.root,"app/icons/new--.jpg"))=="new icon" && File.ReadAllText(Path.Combine(f.root,"docs/release-1.0.1.md"))=="versioned notes","hyphenated icons and versioned docs installed");
  Ok(File.ReadAllText(Path.Combine(f.root,"app/main.js"))=="new main" && !File.Exists(Path.Combine(f.root,"app/dropped.js")) && File.Exists(Path.Combine(f.root,"app/added.js")),"whole app apply/add/retire");
  Ok(AppUpdates.ReadManifest(Path.Combine(f.root,"app-release.json")).version=="1.0.1","application receipt upgraded");
  Ok(new AppUpdates(f.root,f.Download).Current().canRollback,"backup advertised after successful install"); f.Personal();
  AppUpdates.Rollback(f.root,false);
  Ok(File.ReadAllText(Path.Combine(f.root,"app/main.js"))=="old main" && File.Exists(Path.Combine(f.root,"app/dropped.js")) && !File.Exists(Path.Combine(f.root,"app/added.js")),"rollback restores originals and removes additions"); f.Personal();
  var h=new Fixture("hash"); h.Run("check"); h.bad=true; Ok(h.Run("download").error=="HASH_MISMATCH","damaged zip rejected"); Ok(File.ReadAllText(Path.Combine(h.root,"app/main.js"))=="old main","hash failure leaves app unchanged"); h.bad=false; Ok(h.Run("download").phase=="ready","retry succeeds");
  var n=new Fixture("network"); n.network=true; Ok(n.Run("check").error=="NETWORK","network failure reported"); n.network=false; n.Run("check"); n.cancelled=true; Ok(n.Run("download").phase=="cancelled","cancellation keeps old app"); n.cancelled=false; n.Run("download");
  var cachedRequests=n.requests.Count; n.Run("download"); Ok(n.requests.Count==cachedRequests,"retry reuses verified stage/packages");
  var tx=new Fixture("transaction"); tx.Run("check"); tx.Run("download");
  bool threw=false; try { AppUpdates.Apply(tx.root,i=>{if(i==3)throw new IOException("injected disk failure");}); } catch(IOException){threw=true;}
  Ok(threw && File.ReadAllText(Path.Combine(tx.root,"app/main.js"))=="old main" && !File.Exists(Path.Combine(tx.root,"app/added.js")),"mid-install failure fully rolls back"); tx.Personal();
  var crash=new Fixture("crash"); crash.Run("check"); crash.Run("download");
  using(var child=Process.Start(new ProcessStartInfo(typeof(UpdateTests).Assembly.Location,"--crash \\""+crash.root+"\\""){UseShellExecute=false,CreateNoWindow=true})) { child.WaitForExit(); Ok(child.ExitCode==77,"simulated process loss during install"); }
  Ok(File.Exists(Path.Combine(crash.root,"data/app-update/recovery.required")),"durable recovery marker survives process loss");
  AppUpdates.Rollback(crash.root,true); Ok(File.ReadAllText(Path.Combine(crash.root,"app/main.js"))=="old main" && !File.Exists(Path.Combine(crash.root,"app/added.js")),"startup recovery from actual process loss"); crash.Personal();
  var locked=new Fixture("locked"); locked.Run("check"); locked.Run("download");
  using(var held=new FileStream(Path.Combine(locked.root,"app/main.js"),FileMode.Open,FileAccess.Read,FileShare.Read)) {
   threw=false; try{AppUpdates.Apply(locked.root);}catch(IOException){threw=true;}
   Ok(threw && File.ReadAllText(Path.Combine(locked.root,"app/main.js"))=="old main","locked application file aborts and restores");
  }
  var auto=new Fixture("automatic"); auto.Run("preferences",true); Ok(new AppUpdates(auto.root,auto.Download).Current().automatic,"auto preference persisted");
  Ok(auto.Run("auto").phase=="ready","opt-in auto prepares update without installing"); int requests=auto.requests.Count; auto.Run("auto"); Ok(auto.requests.Count==requests,"24-hour throttle persists");
  Ok(File.ReadAllText(Path.Combine(auto.root,"app/main.js"))=="old main","automatic download never applies/restarts");
  var invalid=new Fixture("invalid");
  Action<string,Action<AppUpdates.Manifest>> reject=(name,mutate)=>{var m=AppUpdates.Parse(Bytes(invalid.manifest)); mutate(m); bool rejected=false; try{AppUpdates.Parse(Bytes(m));}catch(InvalidDataException){rejected=true;}Ok(rejected,name);};
  reject("path traversal rejected",m=>m.parts[0].files[0].path="../escape.js"); reject("private config path rejected",m=>m.parts[0].files[0].path="tools/config.json");
  reject("alternate stream path rejected",m=>m.parts[0].files[0].path="app/main.js:evil"); reject("duplicate destination rejected",m=>m.parts[0].files[0].path=m.parts[0].files[1].path);
  reject("oversized file rejected",m=>m.parts[0].files[0].size=Int64.MaxValue); reject("future protocol rejected",m=>m.protocol=99);
  reject("missing critical files rejected",m=>m.parts=m.parts.Skip(1).ToArray());
  using(var held=AppUpdates.Lock(Path.Combine(invalid.root,"data/app-update"))) Ok(invalid.Run("check").error=="FILE_BUSY","cross-process lock blocks second updater");
  var packagePath=Path.Combine(invalid.output,"evil.zip"); using(var z=ZipFile.Open(packagePath,ZipArchiveMode.Create)){using(var w=new StreamWriter(z.CreateEntry("../escape.js").Open())) w.Write("bad");}
  threw=false;try{AppUpdates.Extract(packagePath,Path.Combine(invalid.root,"stage"),new AppUpdates.Part{files=new[]{new AppUpdates.Entry{path="app/main.js",size=3,sha256=AppUpdates.Hash(Encoding.UTF8.GetBytes("bad"))}}});}catch(InvalidDataException){threw=true;}
  Ok(threw && !File.Exists(Path.Combine(invalid.root,"escape.js")),"zip-slip entry rejected before write");
  string assets2=Path.Combine(Path.GetDirectoryName(invalid.output),"assets2"); AppUpdatePackage.Build(invalid.target,"1.0.1",assets2);
  Ok(File.ReadAllText(Path.Combine(invalid.output,"app-release.json"))==File.ReadAllText(Path.Combine(assets2,"app-release.json")),"publisher output deterministic");
  var handoff=new Fixture("handoff"); string bin=Path.GetDirectoryName(typeof(UpdateTests).Assembly.Location);
  foreach(var item in new[]{new[]{"launcher.exe",AppUpdates.Launcher},new[]{"worker.exe","tools/desktop/WowAltBoard.Updater.exe"},new[]{"tests.exe","tools/desktop/WowAltBoard.Desktop.exe"}}) {
   File.Copy(Path.Combine(bin,item[0]),AppUpdates.Safe(handoff.root,item[1]),true);
   File.Copy(Path.Combine(bin,item[0]),AppUpdates.Safe(handoff.target,item[1]),true);
   using(var append=new FileStream(AppUpdates.Safe(handoff.target,item[1]),FileMode.Append))append.WriteByte(0);
  }
  AppUpdatePackage.Build(handoff.root,"1.0.0",Path.Combine(Path.GetDirectoryName(handoff.output),"real-base"));
  AppUpdatePackage.Build(handoff.target,"1.0.1",handoff.output);
  using(var launcher=Process.Start(new ProcessStartInfo(Path.Combine(handoff.root,AppUpdates.Launcher),"--wait"){UseShellExecute=false,CreateNoWindow=true})) {
   var timer=Stopwatch.StartNew(); while(!File.Exists(Path.Combine(handoff.root,"data/launcher-ready")) && timer.ElapsedMilliseconds<10000)Thread.Sleep(50);
   Ok(File.Exists(Path.Combine(handoff.root,"data/launcher-ready")),"real old launcher waiting with its binary locked");
   using(var host=Process.Start(new ProcessStartInfo(Path.Combine(handoff.root,"tools/desktop/WowAltBoard.Desktop.exe"),"--handoff \\""+handoff.root+"\\" \\""+handoff.output+"\\""){UseShellExecute=false,CreateNoWindow=true})) {
    Ok(host.WaitForExit(20000) && host.ExitCode==0,"actual native handoff exits host");
   }
   Ok(launcher.WaitForExit(10000),"actual exit event closes old launcher cooperatively");
  }
  var restarted=Stopwatch.StartNew();while(!File.Exists(Path.Combine(handoff.root,"data/restarted.txt")) && restarted.ElapsedMilliseconds<20000)Thread.Sleep(50);
  Ok(File.Exists(Path.Combine(handoff.root,"data/restarted.txt")),"actual helper restarts the replaced executable");
  Ok(AppUpdates.ReadManifest(Path.Combine(handoff.root,"app-release.json")).version=="1.0.1","actual helper installed whole app"); handoff.Personal();
  Thread.Sleep(300);
  Console.WriteLine("Application updater: "+checks+" independent assertions passed");
 }
}`;
try {
  fs.writeFileSync(path.join(dir, 'tests.cs'), harness);
  fs.writeFileSync(path.join(dir, 'launcher.cs'), `using System; using System.IO; using System.Text; using System.Threading; using System.Security.Cryptography;
class LauncherFixture { static void Main(string[] args) {
 string root=Path.GetDirectoryName(typeof(LauncherFixture).Assembly.Location); Directory.CreateDirectory(Path.Combine(root,"data"));
 if(args.Length>0) { string key;using(var sha=SHA256.Create())key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToUpperInvariant()))).Replace("-", "").ToLowerInvariant();
 using(var signal=new EventWaitHandle(false,EventResetMode.ManualReset,"Local\\\\WowAltBoard.Update."+key)) { File.WriteAllText(Path.Combine(root,"data/launcher-ready"),"1"); if(!signal.WaitOne(30000))Environment.Exit(9); }
 } else File.WriteAllText(Path.Combine(root,"data/restarted.txt"),"1");
} }`);
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const refs = ['System.dll','System.Core.dll','System.Web.Extensions.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll'];
  for (const [name, sources] of [['launcher', [path.join(dir,'launcher.cs')]], ['worker', ['app-updates.cs','app-update-package.cs','app-update-worker.cs'].map(f=>path.join(root,'tools',f))]]) {
    const compiled=cp.spawnSync(compiler,['/nologo','/target:winexe','/out:'+path.join(dir,name+'.exe'),...refs.concat('System.Windows.Forms.dll').map(r=>'/reference:'+r),...sources],{encoding:'utf8',windowsHide:true,timeout:20000});
    if(compiled.status!==0)throw new Error(compiled.stdout+compiled.stderr);
  }
  let result = cp.spawnSync(compiler, ['/nologo','/target:exe','/main:UpdateTests','/out:'+path.join(dir,'tests.exe'), ...refs.map(r=>'/reference:'+r), path.join(root,'tools/app-updates.cs'), path.join(root,'tools/app-update-package.cs'),path.join(dir,'tests.cs')], {encoding:'utf8',windowsHide:true,timeout:20000});
  if(result.status!==0) throw new Error((result.stdout||'')+(result.stderr||''));
  result=cp.spawnSync(path.join(dir,'tests.exe'),[],{encoding:'utf8',windowsHide:true,timeout:120000});
  process.stdout.write(result.stdout||''); if(result.status!==0) throw new Error(result.stderr||String(result.error||result.status));
} finally {
  const resolved=path.resolve(dir); if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe test cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
}
