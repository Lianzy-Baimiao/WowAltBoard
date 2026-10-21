# v1.20.0 — 中英双语界面，默认跟随系统 / Bilingual UI, follows the system by default

## 中文

### 界面多语言

- 看板界面支持**简体中文和 English**，默认跟随系统语言：中文系统显示简体中文，其他系统显示 English。英文环境第一次打开也是完整英文，不需要手动切换。
- 「设置 → 外观 → 界面语言」可选「自动（跟随系统）/ 简体中文 / English」，切换后立即重新加载页面。选择会保存，之后优先于系统语言。
- 启动器托盘菜单、扫描提示、失败原因对话框、应用更新确认框，以及原生桌面窗口的标题和消息，也都会跟随系统语言。需要固定语言时，可以给 `魔兽看板.exe` 或原生窗口加 `--lang=zh` / `--lang=en`，或在 `tools/config.json` 里写 `"uiLang": "en"`。
- 游戏数据不翻译：角色名、物品、副本、团本、职业、专精和天赋名仍然跟随游戏客户端语言，和之前一样。列名、按钮、提示、毕业装备/天赋面板的说明文字都已翻译。
- 已保存的布局、列设置、宝箱数据、更新设置不受语言影响；切换语言不会重置任何个人设置。

### 文档与发布

- 新增英文 README（[README.en.md](../README.en.md)），中英文顶部都有切换链接；新增英文版应用更新说明（[docs/application-updates.en.md](application-updates.en.md)）。
- 发布包同时包含 `README.md` 和 `README.en.md`；应用更新清单也覆盖这两个文件，更新后不会丢。
- `data/说明.txt` 改为中英双语。

### 升级

- **正在使用 v1.18.0 / v1.18.1 / v1.19.0**：设置 → 其他 → 应用更新 → 检查应用更新，下载完成后确认「重启并安装更新」。角色数据和个人配置都会保留。
- 首次使用、浏览器模式，或 v1.17.3 及更早版本：下载 **`WowAltBoard-v1.20.0.zip`**。覆盖前先退出应用并备份旧目录，保留原来的 `data/` 和 `tools/config.json`。
- 新增的 `app/i18n.js`、`app/i18n-en.js` 会随增量更新一起下载；旧版本升级后首次启动即可看到英文界面。

### 验证

- 139 项离线测试、装备渲染、天赋树渲染、guide 天赋方案、无障碍、四项格式校验、天赋串解码和 116 个变异锚点全部通过。
- 新增 65 项 i18n 检查：语言解析优先级、模板/上下文/单复数、目录重复键与占位符一致性，以及 `index.html` 和 22 个界面模块的中文字面量覆盖；英文目录共 869 条。
- 英文界面巡检用真实 Edge 走完主页、设置 5 个页签、角色详情、周趋势、备份箱、导出菜单、毕业装备和天赋页签：无漏翻、无残留中文，切回中文正常。
- 中文界面回归（天赋、毕业装备 Tab、易用性、视觉、应用更新、版本显示）全部通过；66 项独立更新器检查通过。
- 三个原生 EXE 重新编译：启动器、桌面窗口、更新器。中文系统下托盘/对话框为中文，`--lang=en` 时为英文。

## English

### Bilingual interface

- The board now ships in **Simplified Chinese and English** and follows the system language by default: a Chinese system shows Chinese, anything else shows English. On an English system the very first launch is fully English with no manual switch.
- **Settings → Appearance → Interface language** offers Auto (follow system) / 简体中文 / English and reloads the page immediately. The choice is saved and takes priority over the system language afterwards.
- The launcher tray menu, scan messages, failure dialogs, update confirmation, and the native desktop window's title and messages also follow the system language. To pin a language, pass `--lang=zh` / `--lang=en` to `魔兽看板.exe` or the native window, or set `"uiLang": "en"` in `tools/config.json`.
- Game data is not translated: character names, items, dungeons, raids, classes, specs and talent names still follow the game client language, exactly as before. Column names, buttons, tips and the best-gear/talent panel text are translated.
- Saved layouts, column settings, vault data and update preferences are unaffected by language; switching never resets personal settings.

### Documentation and packaging

- Added an English README ([README.en.md](../README.en.md)) with a language switcher at the top of both versions, plus an English application-updates guide ([docs/application-updates.en.md](application-updates.en.md)).
- Releases now include both `README.md` and `README.en.md`; the application update manifest covers both, so updates keep them in sync.
- `data/说明.txt` is now bilingual.

### Upgrading

- **On v1.18.0 / v1.18.1 / v1.19.0**: Settings → Other → Application updates → Check for updates, then confirm "Restart and install update" after the download. Character data and personal settings are preserved.
- First-time users, browser mode, or v1.17.3 and older: download **`WowAltBoard-v1.20.0.zip`**. Exit the app and back up the old folder before overwriting; keep the existing `data/` and `tools/config.json`.
- The new `app/i18n.js` and `app/i18n-en.js` arrive through the incremental update; older versions show the English UI on the first launch after upgrading.

### Verification

- All 139 offline tests, gear rendering, talent-tree rendering, guide talent builds, accessibility, four format suites, talent-string decoding against ground truth and 116 mutation anchors pass.
- 65 new i18n checks cover resolution priority, templates/context/plurals, duplicate keys and placeholder parity, and every Chinese literal in `index.html` and the 22 UI modules; the English catalog has 869 entries.
- The English browser sweep uses real Edge through the home page, all 5 settings tabs, character details, weekly trends, the vault, the export menu, best gear and the talent tab: no missed keys, no leftover Chinese, and switching back to Chinese works.
- Chinese regression checks (talents, best-gear tabs, usability, visual, application updates, version display) pass; 66 independent updater assertions pass.
- All three native EXEs were rebuilt: launcher, desktop window and updater. On a Chinese system the tray/dialogs are Chinese; `--lang=en` makes them English.
