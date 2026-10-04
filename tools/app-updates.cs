// Whole portable-application updates. Only release-owned files may be touched.
// HTTPS publisher -> bounded manifest/packages -> verified stage -> exit -> journalled replacement.
using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Net;
using System.Linq;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

internal sealed class AppUpdates
{
    internal sealed class Entry { public string path, sha256; public long size; }
    internal sealed class Part { public string sha256; public long size; public Entry[] files; }
    internal sealed class Manifest { public int protocol; public string version; public Part[] parts; }
    internal sealed class Preferences { public bool automatic; public string checkedAt, ready; }
    internal sealed class Result {
        public int protocol = 1;
        public string phase = "idle", error, currentVersion, version, checkedAt;
        public bool automatic, canRollback, ready;
        public int changed, packages, completed, total;
        public long bytes;
    }
    internal sealed class Backup { public string path, sha256; public long size; public bool existed; }
    internal sealed class Journal { public string phase; public Backup[] files; }
    internal const string Launcher = "魔兽看板.exe";
    const string Publisher = "https://github.com/Lianzy-Baimiao/WowAltBoard/releases/";
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
    readonly string root, cache;
    readonly Func<Uri, long, CancellationToken, byte[]> download;
    readonly object gate = new object();
    Preferences prefs;
    Manifest pending;
    Result last;
    internal AppUpdates(string directory, Func<Uri, long, CancellationToken, byte[]> adapter = null) {
        root = Path.GetFullPath(directory); cache = Safe(root, "data/app-update");
        Directory.CreateDirectory(cache); download = adapter ?? Download;
        ReadPreferences(); last = Status("idle");
        if (prefs.ready != null) {
            try { pending = ReadManifest(Safe(cache, "ready.json"));
                if (pending.version == prefs.ready && new Version(pending.version) > new Version(VersionInstalled()) && ValidateStage(pending)) last = Status("ready");
                else pending = null;
            } catch { pending = null; }
        }
        try {
            var outcome = Json.Deserialize<Result>(File.ReadAllText(Safe(cache, "result.json")));
            if (outcome != null && last.phase != "ready") { last.phase = outcome.phase; last.error = outcome.error; }
        } catch { }
    }
    void ReadPreferences() {
        prefs = new Preferences();
        try { var f = Safe(cache, "preferences.json"); if (new FileInfo(f).Length < 16384) prefs = Json.Deserialize<Preferences>(File.ReadAllText(f)) ?? prefs; } catch (IOException) { }
        catch (ArgumentException) { } catch (InvalidOperationException) { }
    }
    void SavePreferences(Preferences next) { WriteJson(Safe(cache, "preferences.json"), next); prefs = next; }
    internal Result Current() { lock (gate) return last; }
    string VersionInstalled() {
        try { return ReadManifest(Safe(root, "app-release.json")).version; } catch { }
        try { var match = System.Text.RegularExpressions.Regex.Match(File.ReadAllText(Safe(root, "tools/scan.ps1")), @"\$TOOL_VERSION\s*=\s*'([0-9.]+)'"); if (match.Success) return match.Groups[1].Value; } catch { }
        return "0.0.0";
    }
    Result Status(string phase) {
        bool rollback = false;
        try { rollback = ReadJournal(cache).phase == "committed"; } catch { }
        return new Result { phase = phase, currentVersion = VersionInstalled(), version = pending == null ? null : pending.version,
            automatic = prefs.automatic, checkedAt = prefs.checkedAt, canRollback = rollback, ready = pending != null && prefs.ready == pending.version };
    }
    Result Report(string phase, Action<Result> report) {
        last = Status(phase); if (report != null) report(last); return last;
    }
    internal Result Run(string command, bool automatic, CancellationToken cancel, Action<Result> report = null) {
        lock (gate) {
            try {
                using (var held = Lock(cache)) {
                    ReadPreferences(); cancel.ThrowIfCancellationRequested();
                    if (command == "preferences") {
                        SavePreferences(new Preferences { automatic = automatic, checkedAt = prefs.checkedAt, ready = prefs.ready });
                        return Report(pending != null && prefs.ready == pending.version ? "ready" : "idle", report);
                    }
                    if (command == "status") return last;
                    if (command == "auto") {
                        DateTime checkedAt;
                        if (!prefs.automatic || (DateTime.TryParse(prefs.checkedAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out checkedAt)
                            && DateTime.UtcNow - checkedAt.ToUniversalTime() < TimeSpan.FromHours(24))) return last;
                        if (prefs.ready != null && pending != null && ValidateStage(pending)) return Report("ready", report);
                    }
                    if (command == "check" || command == "auto") {
                        SavePreferences(new Preferences { automatic = prefs.automatic, checkedAt = DateTime.UtcNow.ToString("o"), ready = prefs.ready });
                        Report("checking", report);
                        var next = Parse(download(new Uri(Publisher + "latest/download/app-release.json"), 4 * 1024 * 1024, cancel));
                        cancel.ThrowIfCancellationRequested();
                        if (new Version(next.version) <= new Version(VersionInstalled())) return Report("current", report);
                        pending = next;
                        if (prefs.ready == pending.version && ValidateStage(pending)) return Report("ready", report);
                        var available = Report("available", null);
                        foreach (var part in pending.parts) {
                            available.changed += part.files.Count(e => !Matches(Safe(root, e.path), e));
                            if (part.files.Any(e => !Matches(Safe(root, e.path), e)) && !PackageCached(part)) { available.packages++; available.bytes += part.size; }
                        }
                        if (report != null) report(available);
                        if (command == "check") return available;
                    }
                    if (command != "download" && command != "auto") throw new InvalidDataException("BAD_COMMAND");
                    if (pending == null) throw new InvalidDataException("CHECK_FIRST");
                    Stage(cancel, report); return Report("ready", report);
                }
            } catch (OperationCanceledException) { last = Status("cancelled"); }
            catch (InvalidDataException ex) { last = Status("error"); last.error = ex.Message; }
            catch (WebException ex) { last = Status("error"); last.error = cancel.IsCancellationRequested ? "CANCELLED" :
                (ex.Response is HttpWebResponse && ((HttpWebResponse)ex.Response).StatusCode == HttpStatusCode.NotFound ? "NOT_PUBLISHED" : "NETWORK"); }
            catch (UnauthorizedAccessException) { last = Status("error"); last.error = "NO_WRITE_ACCESS"; }
            catch (IOException) { last = Status("error"); last.error = "FILE_BUSY"; }
            catch { last = Status("error"); last.error = "UPDATE_FAILED"; }
            if (report != null) report(last); return last;
        }
    }
    string StageDir(Manifest manifest) { return Safe(cache, "stage-" + manifest.version); }
    string PackageFile(Part part) { return Safe(cache, "package-" + part.sha256 + ".zip"); }
    bool PackageCached(Part part) { return Matches(PackageFile(part), new Entry { size = part.size, sha256 = part.sha256 }); }
    bool ValidateStage(Manifest manifest) {
        try { return manifest.parts.SelectMany(p => p.files).All(e => Matches(Safe(StageDir(manifest), e.path), e)); } catch { return false; }
    }
    void Stage(CancellationToken cancel, Action<Result> report) {
        string stage = StageDir(pending); Directory.CreateDirectory(stage);
        int completed = 0;
        foreach (var part in pending.parts) {
            cancel.ThrowIfCancellationRequested();
            bool missing = false;
            foreach (var file in part.files) {
                string dest = Safe(stage, file.path);
                if (Matches(dest, file)) continue;
                if (Matches(Safe(root, file.path), file)) { Directory.CreateDirectory(Path.GetDirectoryName(dest)); File.Copy(Safe(root, file.path), dest, true); }
                else missing = true;
            }
            last = Status("downloading"); last.completed = completed; last.total = pending.parts.Length;
            if (report != null) report(last);
            if (missing) {
                if (!PackageCached(part)) {
                    var content = download(new Uri(Publisher + "download/v" + pending.version + "/update-" + part.sha256 + ".zip"), part.size, cancel);
                    cancel.ThrowIfCancellationRequested();
                    if (content.LongLength != part.size || Hash(content) != part.sha256) throw new InvalidDataException("HASH_MISMATCH");
                    AtomicBytes(PackageFile(part), content);
                }
                Extract(PackageFile(part), stage, part);
            }
            completed++;
        }
        cancel.ThrowIfCancellationRequested();
        if (!ValidateStage(pending)) throw new InvalidDataException("HASH_MISMATCH");
        WriteJson(Safe(cache, "ready.json"), pending);
        SavePreferences(new Preferences { automatic = prefs.automatic, checkedAt = prefs.checkedAt, ready = pending.version });
    }
    internal static void Extract(string archive, string stage, Part part) {
        var expected = part.files.ToDictionary(e => e.path, StringComparer.Ordinal);
        using (var zip = ZipFile.OpenRead(archive)) {
            if (zip.Entries.Count != expected.Count) throw new InvalidDataException("PACKAGE_INVALID");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in zip.Entries) {
                Entry entry;
                if (!expected.TryGetValue(item.FullName, out entry) || !seen.Add(item.FullName) || item.Length != entry.size) throw new InvalidDataException("PACKAGE_INVALID");
                byte[] bytes;
                using (var input = item.Open()) using (var output = new MemoryStream()) {
                    CopyBounded(input, output, entry.size, CancellationToken.None); bytes = output.ToArray();
                }
                if (bytes.LongLength != entry.size || Hash(bytes) != entry.sha256) throw new InvalidDataException("HASH_MISMATCH");
                string dest = Safe(stage, entry.path); Directory.CreateDirectory(Path.GetDirectoryName(dest)); AtomicBytes(dest, bytes);
            }
        }
    }
    internal static bool Allowed(string path) {
        if (String.IsNullOrEmpty(path) || path.Length > 180 || path.Contains("..") || path.Contains(":") || path.Contains("\\")) return false;
        if (new[] { "index.html", "tests.html", "README.md", "LICENSE", "启动.bat", "更新数据.bat", Launcher }.Contains(path)) return true;
        return System.Text.RegularExpressions.Regex.IsMatch(path,
            @"^(app/[a-zA-Z0-9_-]+\.(js|css|svg)|app/(icons|talent-icons)/[a-z0-9_-]+\.jpg|docs/[a-zA-Z0-9_.-]+\.md|docs/images/[a-zA-Z0-9_-]+\.(png|jpg|svg)|tools/[a-zA-Z0-9_-]+\.(js|ps1|cs)|tools/(spell-names-zh|talent-truth)\.json|tools/desktop/[a-zA-Z0-9_.-]+\.(exe|dll|txt)|tools/desktop/(x86|x64|arm64)/WebView2Loader\.dll)$");
    }
    internal static Manifest ReadManifest(string file) {
        if (new FileInfo(file).Length > 4 * 1024 * 1024) throw new InvalidDataException("MANIFEST_INVALID");
        return Parse(File.ReadAllBytes(file));
    }
    internal static Manifest Parse(byte[] bytes) {
        if (bytes.Length > 4 * 1024 * 1024) throw new InvalidDataException("MANIFEST_INVALID");
        Manifest manifest;
        try { manifest = Json.Deserialize<Manifest>(Encoding.UTF8.GetString(bytes)); } catch { throw new InvalidDataException("MANIFEST_INVALID"); }
        if (manifest == null || manifest.protocol != 1) throw new InvalidDataException("APP_UPDATE_REQUIRED");
        Version version;
        if (manifest.version == null || !System.Text.RegularExpressions.Regex.IsMatch(manifest.version, @"^\d{1,5}\.\d{1,5}\.\d{1,5}$") || !Version.TryParse(manifest.version, out version)
            || manifest.parts == null || manifest.parts.Length == 0 || manifest.parts.Length > 80) throw new InvalidDataException("MANIFEST_INVALID");
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var parts = new HashSet<string>(); long bytesTotal = 0, compressedTotal = 0;
        foreach (var part in manifest.parts) {
            if (part == null || !IsHash(part.sha256) || !parts.Add(part.sha256) || part.size <= 0 || part.size > 64 * 1024 * 1024 || part.files == null || part.files.Length == 0) throw new InvalidDataException("MANIFEST_INVALID");
            compressedTotal += part.size;
            foreach (var file in part.files) {
                if (file == null || !Allowed(file.path) || !seen.Add(file.path) || !IsHash(file.sha256) || file.size < 0 || file.size > 32 * 1024 * 1024) throw new InvalidDataException("MANIFEST_INVALID");
                bytesTotal += file.size;
            }
        }
        if (seen.Count > 8000 || compressedTotal > 256 * 1024 * 1024 || bytesTotal > 256 * 1024 * 1024 || new[] { "index.html", "app/main.js", "app/panel.js", "app/app-updates.js", "tools/scan.ps1", Launcher, "tools/desktop/WowAltBoard.Desktop.exe", "tools/desktop/WowAltBoard.Updater.exe" }.Any(f => !seen.Contains(f))) throw new InvalidDataException("MANIFEST_INVALID");
        return manifest;
    }
    internal static bool IsHash(string value) { return value != null && System.Text.RegularExpressions.Regex.IsMatch(value, "^[a-f0-9]{64}$"); }
    internal static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
    internal static bool Matches(string file, Entry entry) {
        try { return File.Exists(file) && new FileInfo(file).Length == entry.size && Hash(File.ReadAllBytes(file)) == entry.sha256; } catch (IOException) { return false; }
    }
    internal static string Safe(string parent, string relative) {
        string full = Path.GetFullPath(Path.Combine(parent, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("UNSAFE_PATH");
        for (string check = full; !String.IsNullOrEmpty(check); check = Path.GetDirectoryName(check)) {
            if ((File.Exists(check) || Directory.Exists(check)) && (File.GetAttributes(check) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("UNSAFE_PATH");
        }
        return full;
    }
    internal static FileStream Lock(string cache) { return new FileStream(Safe(cache, "update.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
    internal static void AtomicBytes(string target, byte[] bytes) {
        string temp = target + ".tmp"; Safe(Path.GetDirectoryName(target), Path.GetFileName(temp));
        using (var file = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
        if (File.Exists(target)) File.Replace(temp, target, null); else File.Move(temp, target);
    }
    internal static void WriteJson(string file, object value) { AtomicBytes(file, new UTF8Encoding(false).GetBytes(Json.Serialize(value))); }
    internal static Journal ReadJournal(string cache) {
        string file = Safe(cache, "transaction.json");
        if (new FileInfo(file).Length > 4 * 1024 * 1024) throw new InvalidDataException("JOURNAL_INVALID");
        var journal = Json.Deserialize<Journal>(File.ReadAllText(file));
        if (journal == null || journal.files == null || journal.files.Length > 8001 || !new[] { "applying", "committed", "restoring", "restored" }.Contains(journal.phase)) throw new InvalidDataException("JOURNAL_INVALID");
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var f in journal.files) if (f == null || (f.path != "app-release.json" && !Allowed(f.path)) || !seen.Add(f.path) || (f.existed && (!IsHash(f.sha256) || f.size < 0 || f.size > 32 * 1024 * 1024))) throw new InvalidDataException("JOURNAL_INVALID");
        return journal;
    }
    // No arbitrary shell commands or process kills: the worker waits for these exact application processes.
    internal void LaunchWorker(bool rollback) {
        lock (gate) using (var held = Lock(cache)) {
            if (!rollback && (pending == null || prefs.ready != pending.version || !ValidateStage(pending))) throw new InvalidDataException("CHECK_FIRST");
            if (rollback && ReadJournal(cache).phase != "committed") throw new InvalidDataException("NO_ROLLBACK");
            string worker = Safe(cache, "worker.exe");
            File.Copy(Safe(root, "tools/desktop/WowAltBoard.Updater.exe"), worker, true);
            if (rollback) SavePreferences(new Preferences { automatic = false, checkedAt = prefs.checkedAt });
            string args = (rollback ? "--rollback" : "--apply") + " \"" + root + "\"";
            foreach (var p in Process.GetProcesses()) using (p) {
                try {
                    string file = p.MainModule.FileName;
                    if (String.Equals(file, Safe(root, Launcher), StringComparison.OrdinalIgnoreCase) || String.Equals(file, Safe(root, "tools/desktop/WowAltBoard.Desktop.exe"), StringComparison.OrdinalIgnoreCase)) args += " " + p.Id;
                } catch { }
            }
            Process.Start(new ProcessStartInfo(worker, args) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
            SignalExit(root);
        }
    }
    internal static string ExitEvent(string root) { return "Local\\WowAltBoard.Update." + Hash(Encoding.UTF8.GetBytes(Path.GetFullPath(root).TrimEnd('\\').ToUpperInvariant())); }
    internal static void SignalExit(string root) { using (var signal = new EventWaitHandle(false, EventResetMode.ManualReset, ExitEvent(root))) signal.Set(); }
    sealed class ScanLease : IDisposable {
        readonly Mutex mutex; bool owned;
        internal ScanLease(string root) {
            string key = Hash(Encoding.UTF8.GetBytes(Path.GetFullPath(root).TrimEnd('\\').ToUpperInvariant())).ToUpperInvariant();
            mutex = new Mutex(false, "Local\\WowAltBoard.Scan-" + key);
            try { try { owned = mutex.WaitOne(30000); } catch (AbandonedMutexException) { owned = true; }
                if (!owned) throw new IOException("SCAN_BUSY");
            } catch { mutex.Dispose(); throw; }
        }
        public void Dispose() { if (owned) mutex.ReleaseMutex(); mutex.Dispose(); }
    }
    // Native recursive cleanup is confined to updater-owned staging dirs; reject every reparse point before descending.
    static void DeleteTree(string parent, string name) {
        string dir = Safe(parent, name);
        foreach (string file in Directory.GetFiles(dir)) File.Delete(Safe(dir, Path.GetFileName(file)));
        foreach (string child in Directory.GetDirectories(dir)) DeleteTree(dir, Path.GetFileName(child));
        Directory.Delete(dir, false);
    }
    static void Cleanup(string cache) {
        try {
            foreach (var dir in Directory.GetDirectories(cache)) {
                string name = Path.GetFileName(dir);
                if (System.Text.RegularExpressions.Regex.IsMatch(name, @"^stage-\d{1,5}\.\d{1,5}\.\d{1,5}$")) DeleteTree(cache, name);
            }
            foreach (var file in Directory.GetFiles(cache)) {
                string name = Path.GetFileName(file);
                if (System.Text.RegularExpressions.Regex.IsMatch(name, @"^package-[a-f0-9]{64}\.zip$")) File.Delete(Safe(cache, name));
            }
        } catch { /* cleanup is best-effort and can never undo an installed update */ }
    }
    // Called only by the helper after the launcher and native windows have exited.
    internal static void Apply(string root, Action<int> afterWrite = null) {
        string cache = Safe(root, "data/app-update"); using (var held = Lock(cache)) using (var scan = new ScanLease(root)) {
            var manifest = ReadManifest(Safe(cache, "ready.json")); string stage = Safe(cache, "stage-" + manifest.version);
            var entries = manifest.parts.SelectMany(p => p.files).ToArray();
            if (!entries.All(e => Matches(Safe(stage, e.path), e))) throw new InvalidDataException("HASH_MISMATCH");
            string journalPath = Safe(cache, "transaction.json");
            if (File.Exists(journalPath)) { var previous = ReadJournal(cache); if (previous.phase == "applying" || previous.phase == "restoring") throw new InvalidDataException("RECOVERY_REQUIRED"); }
            // Last successful backup is retired BEFORE touching its contents; a interrupted backup is not rollback-able.
            var paths = new HashSet<string>(entries.Select(e => e.path), StringComparer.OrdinalIgnoreCase);
            try { foreach (var f in ReadManifest(Safe(root, "app-release.json")).parts.SelectMany(p => p.files)) paths.Add(f.path); } catch (FileNotFoundException) { }
            paths.Add("app-release.json");
            var journal = new Journal { phase = "applying", files = paths.OrderBy(p => p, StringComparer.Ordinal).Select(p => new Backup { path = p }).ToArray() };
            if (File.Exists(journalPath)) File.Delete(journalPath);
            string backup = Safe(cache, "backup");
            if (Directory.Exists(backup)) DeleteTree(cache, "backup");
            Directory.CreateDirectory(backup);
            foreach (var file in journal.files) {
                string original = Safe(root, file.path), copy = Safe(backup, file.path);
                file.existed = File.Exists(original);
                if (file.existed) {
                    var content = File.ReadAllBytes(original); file.size = content.Length; file.sha256 = Hash(content);
                    Directory.CreateDirectory(Path.GetDirectoryName(copy)); AtomicBytes(copy, content);
                }
            }
            WriteJson(journalPath, journal); // durable undo log exists before the first app file is changed
            AtomicBytes(Safe(cache, "recovery.required"), Encoding.UTF8.GetBytes("1"));
            try {
                int count = 0;
                foreach (var file in journal.files) {
                    string dest = Safe(root, file.path);
                    var entry = entries.FirstOrDefault(e => e.path == file.path);
                    if (file.path == "app-release.json") WriteJson(dest, manifest);
                    else if (entry != null) {
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        if (!Matches(dest, entry)) AtomicBytes(dest, File.ReadAllBytes(Safe(stage, file.path)));
                    } else if (File.Exists(dest)) File.Delete(dest);
                    if (afterWrite != null) afterWrite(++count);
                }
                journal.phase = "committed"; WriteJson(journalPath, journal);
                WriteJson(Safe(cache, "result.json"), new Result { phase = "updated" });
                ClearReady(cache);
                File.Delete(Safe(cache, "recovery.required"));
            } catch { Restore(root, cache, journal); throw; }
            Cleanup(cache);
        }
    }
    static void ClearReady(string cache) {
        Preferences p = new Preferences();
        try { p = Json.Deserialize<Preferences>(File.ReadAllText(Safe(cache, "preferences.json"))) ?? p; } catch { }
        p.ready = null; WriteJson(Safe(cache, "preferences.json"), p);
    }
    internal static void Rollback(string root, bool recovery) {
        string cache = Safe(root, "data/app-update"); using (var held = Lock(cache)) using (var scan = new ScanLease(root)) {
            var journal = ReadJournal(cache);
            if (recovery && journal.phase != "applying" && journal.phase != "restoring") return;
            if (!recovery && journal.phase != "committed") throw new InvalidDataException("NO_ROLLBACK");
            Restore(root, cache, journal);
        }
    }
    static void Restore(string root, string cache, Journal journal) {
        string backup = Safe(cache, "backup");
        // Validate ALL backups before restoring ANY file. Never erase a file to compensate for a missing backup.
        foreach (var f in journal.files) if (f.existed && !Matches(Safe(backup, f.path), new Entry { size = f.size, sha256 = f.sha256 })) throw new InvalidDataException("BACKUP_INVALID");
        AtomicBytes(Safe(cache, "recovery.required"), Encoding.UTF8.GetBytes("1"));
        journal.phase = "restoring"; WriteJson(Safe(cache, "transaction.json"), journal);
        foreach (var f in journal.files) {
            string dest = Safe(root, f.path);
            if (f.existed) {
                if (!Matches(dest, new Entry { size = f.size, sha256 = f.sha256 })) { Directory.CreateDirectory(Path.GetDirectoryName(dest)); AtomicBytes(dest, File.ReadAllBytes(Safe(backup, f.path))); }
            } else if (File.Exists(dest)) File.Delete(dest);
        }
        journal.phase = "restored"; WriteJson(Safe(cache, "transaction.json"), journal);
        ClearReady(cache); WriteJson(Safe(cache, "result.json"), new Result { phase = "restored" });
        File.Delete(Safe(cache, "recovery.required"));
    }
    static void CopyBounded(Stream input, Stream output, long limit, CancellationToken cancel) {
        var deadline = Stopwatch.StartNew();
        var buffer = new byte[32768]; int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0) {
            cancel.ThrowIfCancellationRequested(); if (deadline.Elapsed > TimeSpan.FromMinutes(3)) throw new InvalidDataException("NETWORK"); if (output.Length + read > limit) throw new InvalidDataException("DOWNLOAD_INVALID"); output.Write(buffer, 0, read);
        }
    }
    static byte[] Download(Uri uri, long limit, CancellationToken cancel) {
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        for (int hop = 0; hop < 5; hop++) {
            // GitHub release assets redirect to GitHub's CDN; never follow to an arbitrary host or plain HTTP.
            if (uri.Scheme != "https" || !(uri.AbsoluteUri.StartsWith(Publisher, StringComparison.Ordinal) || uri.Host == "release-assets.githubusercontent.com" || uri.Host == "objects.githubusercontent.com")) throw new InvalidDataException("UNSAFE_SOURCE");
            var request = (HttpWebRequest)WebRequest.Create(uri); request.AllowAutoRedirect = false;
            request.Timeout = 20000; request.ReadWriteTimeout = 20000; request.UserAgent = "WowAltBoard-Updater/1";
            using (cancel.Register(request.Abort)) using (var response = (HttpWebResponse)request.GetResponse()) {
                if ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400) { uri = new Uri(uri, response.Headers["Location"]); continue; }
                if (response.StatusCode != HttpStatusCode.OK || response.ContentLength > limit) throw new InvalidDataException("DOWNLOAD_INVALID");
                using (var input = response.GetResponseStream()) using (var output = new MemoryStream()) { CopyBounded(input, output, limit, cancel); return output.ToArray(); }
            }
        }
        throw new InvalidDataException("NETWORK");
    }
}
