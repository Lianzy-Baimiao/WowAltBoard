# v1.20.1 — 修复 1.20.0 打开后显示 404 / Fix the 404 when opening v1.20.0

## 中文

### 修复内容

- 修复 v1.20.0 双击 `魔兽看板.exe` 后，原生窗口（或回退的 Edge / Chrome 应用窗口）直接显示 404 / 找不到文件的问题。
- 原因：启动器为传递界面语言，给本地文件地址拼了 `?lang=zh`。.NET Framework 会把 `file://` 地址里的 `?` 转义进路径（变成 `index.html%3F lang=zh`），浏览器于是去找一个不存在的文件。现在改用 `#lang=zh` 片段传递语言，文件路径保持干净。
- 页面同时支持 `?lang=` 和 `#lang=`；设置里显式保存的语言仍然优先。

### 升级

- **正在使用 v1.20.0**：设置 → 其他 → 应用更新 → 检查应用更新，安装 v1.20.1 后即可正常打开。
- 如果当前打不开看板，也可以直接下载 **`WowAltBoard-v1.20.1.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。
- 1.19.0 及更早版本按原方式升级即可。

### 验证

- 新增 `#lang=` 解析测试，并覆盖“查询串优先于片段”“片段带其他参数”“没有语言参数时跟随浏览器”等情况；i18n 检查 70 项全过。
- 真实 Edge 用 `file://...#lang=en` 在中文系统上打开页面，确认界面为英文，证明原生窗口使用的片段传参路径可用。
- 139 项离线测试、格式校验和 116 个变异锚点全部通过；启动器、桌面窗口和更新器重新编译。

## English

### Fix

- Fixed v1.20.0 showing 404 / file not found immediately after opening `魔兽看板.exe` in the native window (or the Edge / Chrome app fallback).
- Cause: to pass the UI language, the launcher appended `?lang=zh` to a local file URL. .NET Framework escapes `?` inside a `file://` URI into the path (`index.html%3F lang=zh`), so the browser looked for a file that does not exist. The language is now passed as the `#lang=zh` fragment, leaving the file path untouched.
- The page accepts both `?lang=` and `#lang=`; a language explicitly saved in settings still wins.

### Upgrading

- **On v1.20.0**: Settings → Other → Application updates → Check for updates. After installing v1.20.1 the board opens normally.
- If the board cannot be opened at all, download **`WowAltBoard-v1.20.1.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.
- v1.19.0 and older upgrade as usual.

### Verification

- Added `#lang=` parsing tests, including query-over-fragment priority, extra fragment parameters and falling back to the browser language; all 70 i18n checks pass.
- Real Edge opens `file://...#lang=en` on a Chinese system and shows English, proving the fragment path used by the native window works.
- All 139 offline tests, format checks and 116 mutation anchors pass; the launcher, desktop window and updater were rebuilt.
