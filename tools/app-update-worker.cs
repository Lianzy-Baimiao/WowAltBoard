using System;
using System.Globalization;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

internal static class AppUpdateWorker
{
    // Only these two messages are user-facing; the update protocol itself is
    // machine-readable and never translated.
    static bool UseEn;
    static string L(string zh, string en) { return UseEn ? en : zh; }
    static bool DetectUseEn(string root) {
        try {
            string cfg = Path.Combine(root, "tools", "config.json");
            if (File.Exists(cfg)) {
                System.Text.RegularExpressions.Match m = System.Text.RegularExpressions.Regex.Match(
                    File.ReadAllText(cfg), "\"uiLang\"\\s*:\\s*\"(zh|en)\"");
                if (m.Success) return m.Groups[1].Value == "en";
            }
        } catch { }
        return CultureInfo.CurrentUICulture.TwoLetterISOLanguageName != "zh";
    }

    [STAThread] static int Main(string[] args) {
        if (args.Length == 4 && args[0] == "--build") {
            try { AppUpdatePackage.Build(args[1], args[2], args[3]); return 0; }
            catch (Exception ex) { try { File.WriteAllText(Path.Combine(args[3], "build-error.txt"), ex.ToString()); } catch { } return 1; }
        }
        if (args.Length < 2 || (args[0] != "--apply" && args[0] != "--rollback" && args[0] != "--recover")) return 2;
        string root = Path.GetFullPath(args[1]), cache = AppUpdates.Safe(root, "data/app-update");
        UseEn = DetectUseEn(root);
        bool started = false;
        try {
            // Hold the request event open until the tray/window are gone; no arbitrary process is terminated.
            using (var signal = new EventWaitHandle(false, EventResetMode.ManualReset, AppUpdates.ExitEvent(root))) {
                signal.Set();
                foreach (string id in args) {
                    int pid; if (!Int32.TryParse(id, out pid)) continue;
                    try { using (var process = Process.GetProcessById(pid)) {
                        if (!process.WaitForExit(90000)) throw new IOException(
                            L("\u8bf7\u5173\u95ed\u6240\u6709\u770b\u677f\u7a97\u53e3\u540e\u91cd\u8bd5\uff0c\u539f\u6587\u4ef6\u5c1a\u672a\u6539\u52a8\u3002",
                              "Close all board windows and try again. No files have been changed yet."));
                    } } catch (ArgumentException) { }
                }
                // Retain a pre-existing recovery marker on failure. The next launch must recover, not open mixed files.
                if (args[0] == "--apply") AppUpdates.Apply(root);
                else AppUpdates.Rollback(root, args[0] == "--recover");
                string marker = AppUpdates.Safe(cache, "recovery.required");
                if (File.Exists(marker)) File.Delete(marker);
                signal.Reset();
            }
            started = true;
            Process.Start(new ProcessStartInfo(AppUpdates.Safe(root, AppUpdates.Launcher)) { UseShellExecute = false, WorkingDirectory = root });
            return 0;
        } catch (Exception ex) {
            try { AppUpdates.WriteJson(AppUpdates.Safe(cache, "result.json"), new AppUpdates.Result { phase = "error", error = "INSTALL_FAILED" }); } catch { }
            MessageBox.Show(L(
                "\u5e94\u7528\u66f4\u65b0\u672a\u5b8c\u6210\u3002\u5df2\u5907\u4efd\u7684\u5e94\u7528\u6587\u4ef6\u4f1a\u5728\u4e0b\u6b21\u542f\u52a8\u65f6\u6062\u590d\uff1b\u89d2\u8272\u6570\u636e\u548c\u8bbe\u7f6e\u4e0d\u4f1a\u88ab\u8986\u76d6\u3002\n\n" + ex.Message,
                "The app update did not finish. The backed-up app files will be restored on the next launch; character data and settings are not overwritten.\n\n" + ex.Message),
                L("\u9b54\u517d\u770b\u677f\u66f4\u65b0", "WowAltBoard update"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            // Do not loop automatically when recovery or restart fails.
            if (!started && !File.Exists(AppUpdates.Safe(cache, "recovery.required"))) {
                try { Process.Start(new ProcessStartInfo(AppUpdates.Safe(root, AppUpdates.Launcher)) { UseShellExecute = false, WorkingDirectory = root }); } catch { }
            }
            return 1;
        }
    }
}
