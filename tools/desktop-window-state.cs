// Own the native frame's geometry; browser-window polling is deliberately separate.
using System;
using System.IO;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class DesktopWindowState
{
    internal const string OwnerProperty = "WowAltBoard.NativeWindowState";
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern bool SetProp(IntPtr window, string name, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr RemoveProp(IntPtr window, string name);
    IntPtr handle;

    public sealed class Record
    {
        public int X, Y, Width, Height;
        public bool Maximized;
    }
    readonly Form form;
    readonly string file;
    readonly Record restored;
    bool applying;
    bool maximized;

    public DesktopWindowState(Form window, string root)
    {
        form = window;
        file = Path.Combine(root, "data", "desktop-window.json");
        // The tray still manages legacy browser windows. Mark this frame so it
        // neither overwrites our saved state nor reapplies its old, DPI-scaled rect.
        form.HandleCreated += delegate {
            handle = form.Handle;
            SetProp(handle, OwnerProperty, new IntPtr(1));
        };
        form.HandleDestroyed += delegate {
            if (handle != IntPtr.Zero) RemoveProp(handle, OwnerProperty);
            handle = IntPtr.Zero;
        };
        restored = Read(root);
        Apply();
        // WinForms performs initial DPI autoscaling before Load. Apply the saved
        // screen-pixel rectangle again afterwards, not an auto-scaled copy of it.
        form.Load += delegate { Apply(); };
        form.Resize += delegate {
            if (!applying && form.WindowState != FormWindowState.Minimized)
                maximized = form.WindowState == FormWindowState.Maximized;
        };
        form.ResizeEnd += delegate { Save(); };
        form.FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (!e.Cancel) Save();
        };
    }
    Record Read(string root)
    {
        try
        {
            Record value;
            if (File.Exists(file))
                value = new JavaScriptSerializer().Deserialize<Record>(File.ReadAllText(file));
            else
            {
                // Import the old launcher's record on the first native run.
                string[] p = File.ReadAllText(Path.Combine(root, "data", "window.txt"))
                    .Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
                if (p.Length < 4) return null;
                value = new Record { X = int.Parse(p[0]), Y = int.Parse(p[1]),
                    Width = int.Parse(p[2]), Height = int.Parse(p[3]),
                    Maximized = p.Length > 4 && p[4] == "1" };
            }
            if (value == null || value.Width <= 0 || value.Height <= 0 ||
                value.Width > 100000 || value.Height > 100000 ||
                Math.Abs((long)value.X) > 1000000 || Math.Abs((long)value.Y) > 1000000) return null;
            return value;
        }
        catch { return null; } // Missing, damaged or inaccessible settings must not prevent launch.
    }
    internal static Rectangle Fit(Rectangle bounds, Rectangle[] areas, Size minimum)
    {
        Rectangle area = areas[0];
        long best = 0;
        foreach (Rectangle candidate in areas)
        {
            Rectangle intersection = Rectangle.Intersect(bounds, candidate);
            long visible = (long)Math.Max(0, intersection.Width) * Math.Max(0, intersection.Height);
            if (visible > best) { best = visible; area = candidate; }
        }
        int width = Math.Min(area.Width, Math.Max(minimum.Width, bounds.Width));
        int height = Math.Min(area.Height, Math.Max(minimum.Height, bounds.Height));
        int x = best == 0 ? area.Left + (area.Width - width) / 2
            : Math.Max(area.Left, Math.Min(bounds.X, area.Right - width));
        int y = best == 0 ? area.Top + (area.Height - height) / 2
            : Math.Max(area.Top, Math.Min(bounds.Y, area.Bottom - height));
        return new Rectangle(x, y, width, height);
    }
    void Apply()
    {
        if (restored == null) return;
        applying = true;
        try
        {
            Rectangle primary = Screen.PrimaryScreen.WorkingArea;
            Rectangle[] areas = new[] { primary }.Concat(Screen.AllScreens
                .Where(screen => !screen.Primary).Select(screen => screen.WorkingArea)).ToArray();
            Rectangle bounds = Fit(new Rectangle(restored.X, restored.Y, restored.Width, restored.Height),
                areas, form.MinimumSize);
            form.StartPosition = FormStartPosition.Manual;
            // Seed the normal rectangle even when restoring a maximized window.
            form.WindowState = FormWindowState.Normal;
            form.Bounds = bounds;
            maximized = restored.Maximized;
            if (maximized) form.WindowState = FormWindowState.Maximized;
        }
        finally { applying = false; }
    }
    void Save()
    {
        if (applying) return;
        try
        {
            Rectangle bounds = form.WindowState == FormWindowState.Normal ? form.Bounds : form.RestoreBounds;
            if (bounds.Width <= 0 || bounds.Height <= 0) return;
            var value = new Record { X = bounds.X, Y = bounds.Y, Width = bounds.Width, Height = bounds.Height,
                Maximized = form.WindowState == FormWindowState.Maximized ||
                    (form.WindowState == FormWindowState.Minimized && maximized) };
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            string temporary = file + ".tmp";
            File.WriteAllText(temporary, new JavaScriptSerializer().Serialize(value));
            if (File.Exists(file)) File.Replace(temporary, file, null);
            else File.Move(temporary, file);
        }
        catch { /* Read-only or unavailable storage must never block closing. */ }
    }
}
