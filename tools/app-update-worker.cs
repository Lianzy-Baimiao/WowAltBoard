using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

internal static class AppUpdateWorker
{
    [STAThread] static int Main(string[] args) {
        if (args.Length == 4 && args[0] == "--build") {
            try { AppUpdatePackage.Build(args[1], args[2], args[3]); return 0; }
            catch (Exception ex) { try { File.WriteAllText(Path.Combine(args[3], "build-error.txt"), ex.ToString()); } catch { } return 1; }
        }
        if (args.Length < 2 || (args[0] != "--apply" && args[0] != "--rollback" && args[0] != "--recover")) return 2;
        string root = Path.GetFullPath(args[1]), cache = AppUpdates.Safe(root, "data/app-update");
        bool started = false;
        try {
            // Hold the request event open until the tray/window are gone; no arbitrary process is terminated.
            using (var signal = new EventWaitHandle(false, EventResetMode.ManualReset, AppUpdates.ExitEvent(root))) {
                signal.Set();
                foreach (string id in args) {
                    int pid; if (!Int32.TryParse(id, out pid)) continue;
                    try { using (var process = Process.GetProcessById(pid)) {
                        if (!process.WaitForExit(90000)) throw new IOException("请关闭所有看板窗口后重试，原文件尚未改动。");
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
            MessageBox.Show("应用更新未完成。已备份的应用文件会在下次启动时恢复；角色数据和设置不会被覆盖。\n\n" + ex.Message, "魔兽看板更新", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            // Do not loop automatically when recovery or restart fails.
            if (!started && !File.Exists(AppUpdates.Safe(cache, "recovery.required"))) {
                try { Process.Start(new ProcessStartInfo(AppUpdates.Safe(root, AppUpdates.Launcher)) { UseShellExecute = false, WorkingDirectory = root }); } catch { }
            }
            return 1;
        }
    }
}
