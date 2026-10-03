// Fixed-command scan worker for the native window. No paths or commands come from JS.
using System;
using System.Diagnostics;
using System.IO;

internal static class DesktopScanner
{
    // A null result means success; otherwise return a small, non-sensitive code.
    internal static string Run(string root, int timeoutMs = 120000)
    {
        string script = Path.Combine(root, "tools", "scan.ps1");
        if (!File.Exists(script)) return "MISSING_SCRIPT";
        try
        {
            var info = new ProcessStartInfo();
            info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                "WindowsPowerShell", "v1.0", "powershell.exe");
            info.Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"";
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            using (var process = new Process())
            {
                process.StartInfo = info;
                string error = "SCAN_FAILED";
                // Drain both pipes asynchronously. A verbose failure must not
                // deadlock, and raw logs / account paths never cross the JS bridge.
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
                    if (e.Data != null && e.Data.StartsWith("SCAN_ERROR=", StringComparison.Ordinal))
                    {
                        string code = e.Data.Substring(11).Trim();
                        if (System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z_]{1,40}$")) error = code;
                    }
                };
                process.ErrorDataReceived += delegate { };
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                if (!process.WaitForExit(timeoutMs))
                {
                    process.Kill();
                    process.WaitForExit();
                    return "TIMEOUT";
                }
                // The timed overload may return before the output callbacks drain.
                process.WaitForExit();
                return process.ExitCode == 0 ? null : error;
            }
        }
        catch { return "START_FAILED"; }
    }
}
