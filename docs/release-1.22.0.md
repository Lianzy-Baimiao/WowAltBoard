# v1.22.0 — 看板界面改版 / Board interface redesign

## 中文

### 变化

- **顶栏**：所有按钮统一成一种样式，平时不带底色，鼠标移上去才出现。按同步、明暗、工具、导出、设置分组，组间用细线隔开。窗口够宽时主要按钮带图标；窗口变窄时先去掉图标，尽量保持一行。
- **「注意」提示**：改成带图标的浅色提示框，只有「注意」两个字着色，正文不再整行橙色。
- **统计**：四张卡片合成一条统计条。「宝库待领取」只在真有奖励可领时才变绿。
- **主表**：
  - 搜索框换成放大镜图标，按 `/` 仍可直接搜索。
  - 排序的那一列用强调色下划线标出。
  - 横向滚动之后，冻结的角色列才出现阴影。
  - 有宝库奖励可领的角色，名字前多一道绿边。
  - 分组名（基础、大秘境……）贴着冻结列显示，不再被推到组中间。
  - 操作提示从页脚移到「角色看板」标题旁，并补了一句「拖动表头调整顺序」。
- **侧滑面板**（设置、角色详情、周趋势、备份箱、毕业装备）：右上角的关闭改成 × 图标；角色详情和备份箱的卡片、小标题样式统一。关上的面板会完全隐藏，按 Tab 不会再跳进看不见的面板。毕业装备面板的宽度、页签、装备栏和天赋树都没有改。
- **浅色主题下的皮肤**：青玉、琥珀、紫罗兰在浅色下各有自己的强调色和底色。之前浅色主题会把它们全部盖成石板蓝。
- 切换明暗或皮肤时整页一次换完，按钮不再比页面其他部分晚一拍。
- README 的主看板截图换成了新界面（匿名示例）。

### 修复

- **周趋势打不开**，只显示「历史数据处理失败：tr is not a function」。从 v1.20.0（中英双语界面）起，只要某一周的快照里缺少某个角色就会出现。
- 主表横向滚动条的自定义样式一直没有生效，现在恢复了。
- 斑马纹的偶数行，鼠标移上去时不变色。
- 周趋势里数值为 0 的周和缺数据的周，「·」的深浅不一样；现在都显示成淡灰色。

### 升级

- **v1.18.0 – v1.21.0**：设置 → 其他 → 应用更新 → 检查应用更新，安装 v1.22.0。这次只更新界面文件，启动器、桌面窗口和更新器不会重新下载。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.22.0.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 139 项离线测试、`tests.html`（Edge，解析器 33 项、数据回归 71 项、毕业装备 35 项）、i18n 69 项检查、100 个变异锚点、应用更新器 66 项断言全部通过。
- Edge 巡检（英文界面 / 毕业装备视觉 / 毕业装备页签 / 毕业装备易用性 / 天赋 / 应用更新 / 版本显示）全部通过，无页面错误、无联网请求。毕业装备面板与基准样式对比，面板宽度、装备内容、天赋节点的尺寸和坐标都没有变化。
- 中英文、深浅色、多个窗口宽度的截图逐张看过。
- 启动器、桌面窗口和更新器与 v1.21.0 逐字节相同。

## English

### Changes

- **Top bar**: every button now has the same style, with no fill until you hover over it. The controls are grouped (sync, light/dark, tools, export, settings) with thin dividers between groups. On wide windows the main buttons have icons; as the window gets narrower the icons go first, so the bar stays on one row where possible.
- **Notice banner**: now a light callout with an icon. Only the "Notice" label is coloured; the text itself is no longer all orange.
- **Summary**: the four cards are now one strip. "Vault rewards ready" turns green only when there is a reward to collect.
- **Main table**:
  - The search box has a magnifier icon; `/` still jumps to it.
  - The sorted column is marked with an accent underline.
  - The frozen character column casts a shadow only after you scroll sideways.
  - Characters with a vault reward to collect get a green edge before their name.
  - Group names (Basics, Mythic+, ...) sit right after the frozen column instead of being pushed to the middle of their group.
  - The how-to line moved from the footer to beside the "Character board" title, and now also mentions that headers can be dragged to reorder columns.
- **Slide-over panels** (settings, character details, weekly trends, backup vault, best gear): Close is now an × icon in the top-right corner, and the cards and section titles in character details and the backup vault share one style. A closed panel is fully hidden, so Tab no longer moves into a panel you cannot see. The best-gear panel's width, tabs, gear slots and talent trees are unchanged.
- **Skins on the light theme**: Jade, Amber and Violet now each have their own accent and background on the light theme. Before, the light theme overrode all of them with slate blue.
- Switching light/dark or the skin now repaints the whole page at once; the buttons no longer change a moment after everything else.
- The main board screenshot in the README shows the new interface (anonymized example).

### Fixes

- **Weekly trends would not open** and showed "Could not process history data: tr is not a function" instead. Since v1.20.0 (the bilingual interface) this happened whenever a weekly snapshot was missing one of the characters.
- The custom style of the main table's horizontal scrollbar never took effect; it works again.
- Even rows of the striped table did not highlight on hover.
- In weekly trends, a week with a value of 0 and a week with no data showed "·" in different shades; both are now a faint grey.

### Upgrading

- **v1.18.0 – v1.21.0**: Settings → Other → App updates → Check for updates, then install v1.22.0. Only interface files change; the launcher, desktop window and updater are not downloaded again.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.22.0.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- All 139 offline tests, `tests.html` (Edge: 33 parser, 71 data regression and 35 best-gear tests), 69 i18n checks, 100 mutation anchors and 66 application-updater assertions pass.
- The Edge sweeps (English UI / best-gear visual / best-gear tabs / best-gear usability / talents / app updates / version display) all pass with no page errors and no network requests. Compared with the baseline stylesheet, the best-gear panel's width, gear content, and talent node sizes and positions are unchanged.
- Screenshots in Chinese and English, light and dark, and at several window widths were reviewed one by one.
- The launcher, desktop window and updater are byte-identical to v1.21.0.
