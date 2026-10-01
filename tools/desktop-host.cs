// Native frame; only the local dashboard is allowed to send theme messages.
using System;
using System.IO;
using System.Drawing;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class DashboardWindow : Form
{
    readonly string root;
    readonly Uri page;
    readonly WebView2 view = new WebView2();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly string themeFile;
    bool dark = true;
    Color surface = Color.FromArgb(20, 22, 26);
    Color foreground = Color.FromArgb(223, 228, 236);
    Color border = Color.FromArgb(47, 53, 63);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadLibrary(string path);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    DashboardWindow(string baseDir)
    {
        root = baseDir;
        page = new Uri(Path.Combine(root, "index.html"));
        themeFile = Path.Combine(root, "data", "desktop-theme.json");
        Text = "\u9b54\u517d\u591a\u89d2\u8272\u770b\u677f";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1440, 900);
        MinimumSize = new Size(640, 420);
        AutoScaleMode = AutoScaleMode.Dpi;
        try { Icon = Icon.ExtractAssociatedIcon(Path.Combine(root, "\u9b54\u517d\u770b\u677f.exe")); } catch { }
        try { ApplyTheme(File.ReadAllText(themeFile), false); } catch { }
        BackColor = surface;
        view.DefaultBackgroundColor = surface;
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        Shown += async delegate {
            try {
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(root, "data", "webview2"));
                await view.EnsureCoreWebView2Async(env);
                view.CoreWebView2.Settings.AreHostObjectsAllowed = false;
                view.CoreWebView2.Settings.IsStatusBarEnabled = false;
                view.CoreWebView2.Settings.IsWebMessageEnabled = true;
                view.CoreWebView2.NavigationStarting += delegate(object s, CoreWebView2NavigationStartingEventArgs e) {
                    if (IsDashboard(e.Uri)) return;
                    e.Cancel = true;
                    OpenExternal(e.Uri);
                };
                view.CoreWebView2.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs e) {
                    e.Handled = true;
                    OpenExternal(e.Uri);
                };
                view.CoreWebView2.WebMessageReceived += delegate(object s, CoreWebView2WebMessageReceivedEventArgs e) {
                    if (!IsDashboard(e.Source)) return;
                    try { ApplyTheme(e.WebMessageAsJson, true); } catch { }
                };
                view.Source = page;
            } catch (Exception ex) {
                try { File.WriteAllText(Path.Combine(root, "data", "desktop-error.log"), ex.ToString()); } catch { }
                MessageBox.Show("\u684c\u9762\u7a97\u53e3\u521d\u59cb\u5316\u5931\u8d25\uff0c\u8bf7\u7528\u6d4f\u89c8\u5668\u6253\u5f00 index.html\u3002", Text);
                // Do not open a normal browser tab here: the tray owns this window
                // and must never accidentally close the user's unrelated browser tabs.
                Close();
            }
        };
    }
    bool IsDashboard(string value)
    {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.IsFile &&
            String.Equals(uri.LocalPath, page.LocalPath, StringComparison.OrdinalIgnoreCase);
    }
    static void OpenExternal(string value)
    {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || (uri.Scheme != "https" && uri.Scheme != "http")) return;
        try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); } catch { }
    }
    static Color ReadColor(Dictionary<string, object> data, string key)
    {
        object value;
        if (!data.TryGetValue(key, out value) || !(value is string) ||
            !System.Text.RegularExpressions.Regex.IsMatch((string)value, "^#[0-9a-fA-F]{6}$")) throw new FormatException();
        return ColorTranslator.FromHtml((string)value);
    }
    void ApplyTheme(string text, bool persist)
    {
        if (text.Length > 1024) return;
        var data = json.Deserialize<Dictionary<string, object>>(text);
        if (!data.ContainsKey("type") || (string)data["type"] != "theme") return;
        Color bg = ReadColor(data, "background"), fg = ReadColor(data, "foreground"), line = ReadColor(data, "border");
        bool isDark = data.ContainsKey("dark") && data["dark"] is bool && (bool)data["dark"];
        surface = bg; foreground = fg; border = line; dark = isDark;
        BackColor = surface;
        view.DefaultBackgroundColor = surface;
        if (IsHandleCreated) PaintFrame();
        if (persist) { try { Directory.CreateDirectory(Path.GetDirectoryName(themeFile)); File.WriteAllText(themeFile, text); } catch { } }
    }
    void PaintFrame()
    {
        // Unsupported attributes return HRESULTs: Win10 retains native colors.
        int mode = dark ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20, ref mode, 4);
        int bg = ColorTranslator.ToWin32(surface), fg = ColorTranslator.ToWin32(foreground), line = ColorTranslator.ToWin32(border);
        DwmSetWindowAttribute(Handle, 34, ref line, 4);
        DwmSetWindowAttribute(Handle, 35, ref bg, 4);
        DwmSetWindowAttribute(Handle, 36, ref fg, 4);
    }
    protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); PaintFrame(); }
    [STAThread] static int Main(string[] args)
    {
        string architecture = IntPtr.Size == 8 ? "x64" : "x86";
        LoadLibrary(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, architecture, "WebView2Loader.dll"));
        try { CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch { return 2; }
        if (Array.IndexOf(args, "--check-runtime") >= 0) return 0;
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
        if (!File.Exists(Path.Combine(root, "index.html"))) return 3;
        Application.Run(new DashboardWindow(root));
        return 0;
    }
}
