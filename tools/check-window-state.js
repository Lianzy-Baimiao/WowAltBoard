/* Real native-window lifecycle without showing a window or starting WebView2. */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
var root = path.resolve(__dirname, '..');
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'WowAltBoard-window-state-'));
function write(name, text) { fs.writeFileSync(path.join(tmp, name), text); }
try {
  ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll'].forEach(function (name) {
    fs.copyFileSync(path.join(root, 'tools', 'desktop', name), path.join(tmp, name));
  });
  var launcher = fs.readFileSync(path.join(root, 'tools', 'build-launcher.ps1'), 'utf8');
  var geometryStart = launcher.indexOf('    // ----------------------------------------------------- window geometry');
  var geometryEnd = launcher.indexOf('    // ------------------------------------------------------- close behaviour', geometryStart);
  var restore = /    static void RestoreGeometry\(IntPtr hWnd\)[\s\S]*?\r?\n    }/.exec(launcher);
  if (geometryStart < 0 || geometryEnd < 0 || !restore) throw Error('Missing actual launcher geometry handlers');
  write('launcher.cs', `using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Windows.Forms;
public static class LauncherGeometryProbe {
    static string BaseDir;
    const uint SWP_NOZORDER = 4, SWP_NOACTIVATE = 16;
    const int SW_SHOWMAXIMIZED = 3;
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int w, int h, uint flags);
` + launcher.slice(geometryStart, geometryEnd) + restore[0] + `
    public static void Verify(Form native, string root) {
        BaseDir = root;
        Directory.CreateDirectory(Path.GetDirectoryName(GeometryFile));
        string old = "70 80 800 500 0";
        File.WriteAllText(GeometryFile, old);
        Rectangle desired = native.Bounds;
        SaveGeometry(native.Handle);
        if (File.ReadAllText(GeometryFile) != old) throw new Exception("Tray overwrote native geometry");
        RestoreGeometry(native.Handle);
        if (native.Bounds != desired) throw new Exception("Tray restored stale geometry over native state");
        using (Form browser = new Form()) {
            browser.StartPosition = FormStartPosition.Manual;
            browser.Bounds = desired;
            SaveGeometry(browser.Handle);
            if (File.ReadAllText(GeometryFile) == old) throw new Exception("Browser geometry no longer saves");
            browser.Bounds = new Rectangle(desired.X + 10, desired.Y + 10, desired.Width + 10, desired.Height + 10);
            RestoreGeometry(browser.Handle);
            if (browser.Bounds != desired) throw new Exception("Browser geometry no longer restores");
        }
    }
}
`);
  write('test.cs', `using System;
using System.IO;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;
using System.Web.Script.Serialization;
public static class WindowStateTest {
    static Form Open(string root) {
        return (Form)Activator.CreateInstance(typeof(DashboardWindow), BindingFlags.Instance | BindingFlags.NonPublic,
            null, new object[] { root }, null);
    }
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static string StateFile(string root) { return Path.Combine(root, "data", "desktop-window.json"); }
    static DesktopWindowState.Record Read(string root) {
        return new JavaScriptSerializer().Deserialize<DesktopWindowState.Record>(File.ReadAllText(StateFile(root)));
    }
    static void CloseAt(string root, Rectangle bounds, FormWindowState state, bool minimize) {
        using (Form form = Open(root)) {
            form.WindowState = FormWindowState.Normal;
            // Hidden forms do not get the OS WM_SIZE message: deliver the real
            // Resize event explicitly, as Windows does for a visible frame.
            typeof(Form).GetMethod("OnResize", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(form, new object[] { EventArgs.Empty });
            form.Bounds = bounds;
            IntPtr handle = form.Handle;
            form.WindowState = state;
            typeof(Form).GetMethod("OnResize", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(form, new object[] { EventArgs.Empty });
            if (minimize) form.WindowState = FormWindowState.Minimized;
            form.Close();
        }
    }
    [STAThread] public static int Main(string[] args) {
        try {
            string root = args[0];
            Rectangle area = Screen.PrimaryScreen.WorkingArea;
            Rectangle desired = new Rectangle(area.Left + 45, area.Top + 55, 900, 600);
            using (Form first = Open(root)) {
                first.StartPosition = FormStartPosition.Manual;
                first.Bounds = desired;
                IntPtr handle = first.Handle; // real close path, never Show() / WebView2 startup
                first.Close();
            }
            using (Form second = Open(root)) {
                Console.WriteLine("Reopen: expected " + desired + ", actual " + second.Bounds);
                Check(second.Bounds == desired && second.StartPosition == FormStartPosition.Manual,
                    "Moving/resizing then closing and reopening must restore the saved rectangle");
            }
            using (Form native = Open(root)) {
                IntPtr handle = native.Handle;
                LauncherGeometryProbe.Verify(native, root);
                // End-of-drag saves even before close; no 2-second polling race.
                native.Bounds = new Rectangle(desired.X + 10, desired.Y + 10, 950, 650);
                typeof(Form).GetMethod("OnResizeEnd", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(native, new object[] { EventArgs.Empty });
                Check(Read(root).Width == 950, "resize end must persist immediately");
                // Simulate initial DPI autoscaling before Load: saved physical bounds win.
                typeof(Form).GetMethod("OnLoad", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(native, new object[] { EventArgs.Empty });
                Check(native.Bounds == desired, "Load must undo initial autoscaling of saved screen pixels");
            }
            CloseAt(root, desired, FormWindowState.Maximized, false);
            Check(Read(root).Maximized && Read(root).Width == desired.Width, "save restored rectangle, not screen-size rectangle");
            using (Form maximum = Open(root)) {
                Check(maximum.WindowState == FormWindowState.Maximized, "maximize state must reopen");
                maximum.WindowState = FormWindowState.Normal;
                Check(maximum.Bounds == desired, "restoring maximized window must recover original rectangle");
            }
            CloseAt(root, desired, FormWindowState.Maximized, true);
            Check(Read(root).Maximized, "minimizing a maximized window must retain maximized state");
            using (Form maximum = Open(root)) {
                Check(maximum.WindowState == FormWindowState.Maximized, "never reopen minimized");
            }
            CloseAt(root, desired, FormWindowState.Normal, true);
            Check(!Read(root).Maximized && Read(root).Width == desired.Width, "minimized normal window keeps normal rectangle");
            using (Form normal = Open(root)) {
                Check(normal.WindowState == FormWindowState.Normal && normal.Bounds == desired, "normal/minimized close must reopen normally");
            }
            Size min = new Size(640, 420);
            Rectangle primary = new Rectangle(0, 40, 1920, 1040);
            Rectangle left = new Rectangle(-1920, 0, 1920, 1080);
            Rectangle negative = new Rectangle(-1800, 50, 900, 600);
            Check(DesktopWindowState.Fit(negative, new[] { primary, left }, min) == negative, "negative monitor coordinates must survive");
            Rectangle missing = DesktopWindowState.Fit(negative, new[] { primary }, min);
            Check(primary.Contains(missing), "unplugged monitor must not strand window offscreen");
            Rectangle oversized = DesktopWindowState.Fit(new Rectangle(100, 50, 4000, 3000), new[] { primary }, min);
            Check(primary.Contains(oversized), "smaller monitor/DPI change must clamp saved size");
            Rectangle tiny = DesktopWindowState.Fit(new Rectangle(100, 50, 1, 1), new[] { primary }, min);
            Check(tiny.Size == min, "respect minimum window size");
            Rectangle gap = DesktopWindowState.Fit(new Rectangle(2050, 60, 300, 500),
                new[] { primary, new Rectangle(2500, 0, 1920, 1080) }, min);
            Check(primary.Contains(gap), "a gap between monitors is not a visible working area");
            File.Delete(StateFile(root));
            File.WriteAllText(Path.Combine(root, "data", "window.txt"),
                desired.X + " " + desired.Y + " " + desired.Width + " " + desired.Height + " 0");
            using (Form legacy = Open(root)) { Check(legacy.Bounds == desired, "import previous launcher record"); }
            foreach (string bad in new[] { "not json", "null", "{}", @"{""X"":2147483647,""Width"":900,""Height"":600}" }) {
                File.WriteAllText(StateFile(root), bad);
                using (Form broken = Open(root)) {
                    Check(broken.StartPosition == FormStartPosition.CenterScreen, "invalid settings must use default placement");
                }
            }
            File.Delete(StateFile(root));
            Directory.CreateDirectory(StateFile(root)); // deterministic write failure, even when running as admin
            CloseAt(root, desired, FormWindowState.Normal, false);
            Console.WriteLine("Native window: close/reopen, drag, maximize/minimize, DPI-load, monitor changes, legacy import, corrupt/read-only storage, tray/browser ownership passed");
            return 0;
        } catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}`);
  var refs = ['System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', 'System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll',
    path.join(tmp, 'Microsoft.Web.WebView2.Core.dll'), path.join(tmp, 'Microsoft.Web.WebView2.WinForms.dll')];
  var csc = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  var args = ['/nologo', '/target:exe', '/main:WindowStateTest', '/out:' + path.join(tmp, 'test.exe')]
    .concat(refs.map(function (ref) { return '/reference:' + ref; }))
    .concat([path.join(root, 'tools', 'desktop-host.cs'), path.join(root, 'tools', 'desktop-scan.cs'), path.join(root, 'tools', 'desktop-window-state.cs'), path.join(root, 'tools', 'app-updates.cs'), path.join(tmp, 'launcher.cs'), path.join(tmp, 'test.cs')]);
  var result = cp.spawnSync(csc, args, { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  process.stdout.write((result.stdout || '') + (result.stderr || ''));
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Window harness compilation failed');
  var dataRoot = path.join(tmp, 'Board with spaces');
  fs.mkdirSync(dataRoot);
  result = cp.spawnSync(path.join(tmp, 'test.exe'), [dataRoot], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  process.stdout.write((result.stdout || '') + (result.stderr || ''));
  if (result.error) throw result.error;
  process.exitCode = result.status === 0 ? 0 : 1;
} finally {
  var full = path.resolve(tmp), prefix = path.resolve(os.tmpdir()) + path.sep;
  if (full.indexOf(prefix) !== 0 || !path.basename(full).startsWith('WowAltBoard-window-state-')) throw Error('unsafe cleanup');
  fs.rmSync(full, { recursive: true, force: true });
}
