using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Collections.Generic;

internal static class AppUpdatePackage
{
    // Stable components, not binary-diff patches: small UI/data changes do not redownload native DLLs/icons.
    internal static string Group(string path) {
        if (path.StartsWith("app/icons/") || path.StartsWith("app/talent-icons/")) return path.Split('/')[1] + "-" + AppUpdates.Hash(Encoding.UTF8.GetBytes(path))[0];
        if (path.StartsWith("app/") && (path.EndsWith("-data.js") || path.StartsWith("app/talent-") || path == "app/item-icons.js")) return path.Replace('/', '-');
        if (path == "tools/desktop/WowAltBoard.Desktop.exe" || path == "tools/desktop/WowAltBoard.Updater.exe") return "native-host";
        if (path.StartsWith("tools/desktop/")) return "native-runtime";
        if (path == AppUpdates.Launcher) return "launcher";
        return path.Contains("/") ? path.Split('/')[0] : "root";
    }
    internal static void Build(string directory, string version, string output) {
        directory = Path.GetFullPath(directory); output = Path.GetFullPath(output);
        if (output.StartsWith(directory.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Output must be outside the package");
        Directory.CreateDirectory(output);
        var files = Directory.GetFiles(directory, "*", SearchOption.AllDirectories)
            .Select(f => f.Substring(directory.Length + 1).Replace('\\', '/')).Where(AppUpdates.Allowed).OrderBy(p => p, StringComparer.Ordinal).ToArray();
        var parts = new List<AppUpdates.Part>();
        foreach (var group in files.GroupBy(Group).OrderBy(g => g.Key, StringComparer.Ordinal)) {
            string temp = AppUpdates.Safe(output, "building.zip");
            if (File.Exists(temp)) File.Delete(temp);
            var entries = new List<AppUpdates.Entry>();
            using (var zip = ZipFile.Open(temp, ZipArchiveMode.Create)) {
                foreach (string path in group) {
                    var bytes = File.ReadAllBytes(AppUpdates.Safe(directory, path));
                    entries.Add(new AppUpdates.Entry { path = path, size = bytes.Length, sha256 = AppUpdates.Hash(bytes) });
                    var entry = zip.CreateEntry(path, CompressionLevel.Optimal); entry.LastWriteTime = new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);
                    using (var stream = entry.Open()) stream.Write(bytes, 0, bytes.Length);
                }
            }
            var content = File.ReadAllBytes(temp); string hash = AppUpdates.Hash(content);
            string dest = AppUpdates.Safe(output, "update-" + hash + ".zip");
            if (!File.Exists(dest)) File.Move(temp, dest); else File.Delete(temp);
            parts.Add(new AppUpdates.Part { sha256 = hash, size = content.Length, files = entries.ToArray() });
        }
        var manifest = new AppUpdates.Manifest { protocol = 1, version = version, parts = parts.ToArray() };
        AppUpdates.Parse(Encoding.UTF8.GetBytes(AppUpdates.Json.Serialize(manifest)));
        AppUpdates.WriteJson(AppUpdates.Safe(output, "app-release.json"), manifest);
        AppUpdates.WriteJson(AppUpdates.Safe(directory, "app-release.json"), manifest);
    }
}
