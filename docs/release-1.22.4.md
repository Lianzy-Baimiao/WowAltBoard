# v1.22.4 — 「漫游团本」改成固定的一列 / One fixed "Timewalking raid" column

## 中文

### 变化

- **团队副本里的漫游团本改成固定的一列。** 原来每个漫游团本各算一列，每周换一个团本就换一列，勾选和拖好的位置都跟着丢；本周没人打的时候，设置里连这个勾选框都没有。
- 现在 设置 → 列 → 团队副本 里一直有「漫游团本」：
  - 勾着时，本周有任何一个号打了漫游团本，主表上就出现这一列，表头是本周那个团本（例如「奥杜漫」），没打的号显示「·」；本周没人打，这一列不显示，设置里写着「本周没人打」。
  - 勾掉就一直不显示。
  - 勾选和拖好的位置换团本之后也保留。
- 鼠标移到这个勾选框或表头上有说明。角色详情和导出用的是同一个判断；「本周」仍按 v1.22.3 的规则：锁着并且到扫描时还没到期。

### 升级

- **v1.18.0 – v1.22.3**：设置 → 其他 → 应用更新 → 检查应用更新，安装 v1.22.4。这次只更新界面文件，启动器、桌面窗口和更新器不会重新下载。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.22.4.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 144 项离线测试（新增：漫游团本不按团本建列、固定的这一列本周有人打才显示、周重置后列还在只是藏起来、主表真写出来的隐藏规则、格子和导出给同一个答案）、`tests.html`（Edge，解析器 33 项、数据回归 72 项、毕业装备 39 项）、i18n 70 项检查、100 个变异锚点、应用更新器 66 项断言全部通过。
- 故意改坏 4 处（空列不藏、漫游又按团本建列、没人打就不建这一列、导出不跟格子），测试都会报错。
- 浅色主题巡检全部达标；深色主题和 v1.22.3 相比，只有设置里这个勾选框的文字变了，其余 22 个界面上的文字颜色、底色和字重逐一相同。
- 其余七个 Edge 巡检（英文界面 / 毕业装备视觉 / 毕业装备页签 / 毕业装备易用性 / 天赋 / 应用更新 / 版本显示）全部通过，无页面错误、无联网请求。
- 启动器、桌面窗口和更新器与 v1.22.3 逐字节相同。

## English

### Changes

- **The timewalking raid is now one fixed column in the raid group.** Before, each timewalking raid was its own column, so every weekly rotation brought a new column and lost its checkbox state and dragged position, and in a week nobody had run it there was no checkbox at all.
- Settings → Columns → Raid now always has "Timewalking raid":
  - While it is ticked, the column appears on the main table as soon as any character has run this week's timewalking raid, headed by that raid's name, and characters that have not show "·"; if nobody has run it this week the column stays hidden and Settings says so.
  - Untick it to hide it for good.
  - The checkbox and the dragged position survive the rotation.
- Hover over the checkbox or the header for an explanation. Character details and exports use the same rule, and "this week" still means what v1.22.3 made it mean: locked, and not yet expired at the time of the scan.

### Upgrading

- **v1.18.0 – v1.22.3**: Settings → Other → App updates → Check for updates, then install v1.22.4. Only interface files change; the launcher, desktop window and updater are not downloaded again.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.22.4.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- All 144 offline tests (new: timewalking raids no longer get a column each, the fixed column only shows when someone has run it this week, it stays in Settings after the reset and is only hidden, the hide rule the main table really writes, and the cell and the export give the same answer), `tests.html` (Edge: 33 parser, 72 data regression and 39 best-gear tests), 70 i18n checks, 100 mutation anchors and 66 application-updater assertions pass.
- Breaking four places on purpose (empty column not hidden, timewalking back to one column per raid, no column at all when nobody has run it, export not matching the cell) makes the tests fail every time.
- Every text in the light-theme sweep meets its contrast floor. Compared with v1.22.3 the dark theme only changes the text of this checkbox in Settings; on the other 22 screens the colour, background and weight of every text are the same.
- The other seven Edge sweeps (English UI / best-gear visual / best-gear tabs / best-gear usability / talents / app updates / version display) pass with no page errors and no network requests.
- The launcher, desktop window and updater are byte-identical to v1.22.3.
