# In-app incremental updates

[简体中文](application-updates.md) | **English**

## For users

This feature covers the **whole board application**, not just best-gear data. It
includes the launcher, native window, scanner, UI, the gear/talent data shipped
with each version, icons and documentation.

1. Open the board with `魔兽看板.exe`, then click "Check for updates" under
   **Settings → Other → Application updates**. With the native window open, the
   tray's "Check for updates" opens the same updater.
2. It shows the target version, number of changed files, number of component
   packages and download size. Start the download; you can keep using the board
   while it runs.
3. Once the download is verified, click "Restart and install update" and confirm
   again; the board exits, installs and reopens automatically.
4. The optional "check automatically and download in the background" is off by
   default. It only runs while the board is open, at most once every 24 hours,
   and **never installs or forces a restart by itself**.
5. After a successful install you can "restore the previous application
   version". This restores application files only, not character data or
   personal settings; restoring manually turns automatic downloads off.

The increment here is **per component**, not an EXE binary diff. If only the UI
changed, the native runtime and unchanged icon components are not downloaded
again. Icons are bucketed and data files grouped so a small data edit does not
re-download the whole app. If a local file was modified or damaged, the
component that owns it is prepared again.

### First migration and publishing rules

- v1.17.3 and older do not have this updater; upgrade once with the full package
  to v1.18.0 or newer, then use in-app updates. Exit the old version, back up the
  folder and overwrite the application files, keeping the existing `data/` and
  `tools/config.json`; never overwrite personal configuration with the empty
  config from the package.
- Since v1.18.0, official Releases provide the full ZIP, `app-release.json` and
  all component packages. Regular users only need the full ZIP or the in-app
  updater; they never handle component packages manually. Missing manifests or
  components and network failures are reported explicitly and never shown as
  "updated".
- Browsers and the old desktop program have neither file-replacement permission
  nor protocol support, so the full release page remains the compatibility
  entry point and is not disguised as an automatic update.
- The old `更新数据.bat` is a maintainer tool for collecting/converting data,
  **not an application updater**. New versions no longer require regular users
  to install Node.js, apply for WCL credentials or scrape sites themselves.
- An application update does not mean every upstream dataset is current or
  optimal. Each source keeps its own date, restrictions and methodology, and
  source limits such as guide's are not bypassed.

## Safety and recovery boundaries

- The official GitHub Release address is fixed; arbitrary URLs, paths or
  commands offered by the page are not accepted. Only the exact local
  `index.html` can call the native update bridge.
- Every ZIP and every extracted file is checked against SHA-256 and size; entry
  count, package size and total size are capped, and path traversal, duplicate
  paths, ZIP Slip and reparse points are rejected.
- **SHA-256 is an integrity check, not a publisher signature.** Trust currently
  comes from the official GitHub account, HTTPS and its release assets. No code
  signing or offline signature verification is claimed.
- Only application files on the release manifest whitelist are managed. `data/`,
  `tools/config.json`, WCL credentials and user-created files are never
  overwritten. Full-package builds also replace the local config with an empty
  one so no game paths are published.
- Downloads go to `data/app-update/` and never replace running files.
  Cancellation is supported, and verified ZIPs/staging files are reused on
  retry; byte-range resume inside a ZIP is not supported.
- The install helper is a separate EXE shipped with the current program. It is
  first copied into the cache and waits for this application's processes to
  exit. It never kills other processes and never requests administrator rights.
  If a file remains locked, installation aborts and is restored.
- Installation and character scanning share the same scan mutex. A backup and a
  transaction journal are fully written before replacement, and files are
  replaced atomically one by one; **this is not one atomic directory swap**.
  After a process interruption the launcher restores with the retained helper
  before opening the board.
- The application backup from just before the latest install is kept; after a
  successful install the download ZIP and staging directory are cleaned up. Do
  not delete `data/app-update/` during an update or recovery. Corrupt backups or
  unwritable disks stop the process with a message; success is never invented.
- Keeping one local backup of the application does not protect the disk itself;
  this is not a personal-data backup feature.

## Maintainer release process

1. Collect/convert data according to the existing source rules; run data
   validation and the new updater tests. **Building the update package does not
   collect game data.**
2. Set an incremented official `X.Y.Z` version in `tools/scan.ps1`. Never rewrite
   assets of an already published version, and never republish a v1.17.3 package
   that was used for development validation as v1.17.3.
3. Run:
   ```powershell
   node tools/run-tests.js
   powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-release.ps1
   ```
4. The build outputs the full `WowAltBoard-vX.Y.Z.zip` and
   `WowAltBoard-vX.Y.Z-updates/`:
   - `app-release.json`: version, protocol, each component's SHA-256/size and
     each file's path/SHA-256/size.
   - `update-<sha256>.zip`: deterministic component packages. Only publishable
     files are allowed; personal data is excluded. The manifest is also included
     in the full package.
5. Create a **draft** GitHub Release; the tag must be `vX.Y.Z`. Upload the full
   package, the manifest and **all component packages listed in the manifest**
   as release assets. Publish as latest only after reviewing completeness. Do not
   publish the manifest first and add packages later, and do not upload only the
   ZIPs that changed this time: users may upgrade from any older version.
6. Keep old Release assets so users who already have that version's manifest can
   keep downloading. Target component downloads are bound to the version tag and
   never mix in mutable files from the main branch.

Manifest discovery address:
`https://github.com/Lianzy-Baimiao/WowAltBoard/releases/latest/download/app-release.json`

Component address:
`https://github.com/Lianzy-Baimiao/WowAltBoard/releases/download/vX.Y.Z/update-<sha256>.zip`

Only HTTPS and qualified redirects from GitHub Releases to their asset CDN are
allowed. Widening the file whitelist or changing the protocol in the future must
consider compatibility with old updaters; an incompatible manifest must never be
silently served to old clients. `tools/build-release.ps1` checks every path of a
new manifest against a frozen copy of the v1.18.0–v1.19.0 whitelist and fails the
build on any path those clients would reject (v1.20.0/v1.20.1 shipped
`README.en.md` at the root, and those clients reported "The update manifest is
invalid").

## Modules and verification

- `tools/app-updates.cs`: checks, incremental staging, whitelist/verification,
  persistence, install transaction and recovery.
- `tools/app-update-package.cs`: deterministic maintainer component builds; it
  does not fetch data. The full-package build also cross-checks the incremental
  manifest file by file and fails immediately when a publishable file such as an
  icon or document is missing.
- `tools/app-update-worker.cs`: wait for exit, standalone install/recovery,
  restart.
- `tools/desktop-host.cs`: fixed message bridge, restart confirmation, progress.
- `app/app-updates.js`: UI state; never touches the filesystem directly and never
  hot-replaces the current page.
- `tools/check-app-updates.js`: isolated temporary directories and the real .NET
  module, covering download/verification/delta/file locks/rollback and recovery
  after a child process dies mid-replacement.
- `tools/check-app-update-browser.cjs`: real Edge, file:// page, simulated native
  message transport, checking interaction and light/dark width. It is not a
  public-network release test.

Browser tests used during development need a separate Playwright installation;
regular users need neither Node.js nor Playwright to run the application.
