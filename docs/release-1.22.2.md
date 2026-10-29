# v1.22.2 — 浅色主题改用游戏原色 / Light theme keeps the game's exact colours

## 中文

### 修复

- **浅色主题下职业色仍然偏色。** v1.22.1 给每个职业做了一个压暗的版本当字色，但浅色的职业色压到白底上能读，就已经不是原来那个颜色了：盗贼的黄成了芥末色，法师的浅蓝成了青色，武僧的薄荷绿成了深绿。现在浅色主题和打印里，职业名是一个用**游戏原色**填充的色块，字用近黑或白，取对比度高的那个，13 个职业都至少 4.5:1。主表、周趋势、角色详情、设置里的角色列表和毕业装备的职业页签都是这样。
- **其他游戏色也一律用原色**：
  - 钥石层数、属性（暴击 / 急速 / 精通 / 全能）和来源标签做成原色色块。
  - 物品名：蓝色和紫色品质在白底上本来就够读，直接用原色当字色；绿色、橙色、神器和传家宝品质做成原色色块；白色品质用正文色，灰色品质用够读的灰。
  - 属性条和图标边框直接用原色。
- 打印时色块照常印出来，不受「背景图形」开关影响。
- 深色主题不变。

### 升级

- **v1.18.0 – v1.22.1**：设置 → 其他 → 应用更新 → 检查应用更新，安装 v1.22.2。这次只更新界面文件，启动器、桌面窗口和更新器不会重新下载。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.22.2.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 143 项离线测试（浅色配色的 4 项按新规则重写）、`tests.html`（Edge，解析器 33 项、数据回归 71 项、毕业装备 39 项）、i18n 69 项检查、100 个变异锚点、应用更新器 66 项断言全部通过。
- 浅色主题巡检覆盖石板蓝、紫罗兰下的 22 个界面，青玉、琥珀下的 5 个主要界面，以及从深色、浅色两种主题打印：每段文字对实际背景的对比度都达标；每个色块的底色、每段游戏色文字和每根属性条都是游戏原色。同一套检查在 v1.22.1 上会报错，因为它把颜色压暗了。
- 故意改坏 20 处配色代码和样式（单元测试 13 处、浅色巡检 7 处，两边各有一处就是退回 v1.22.1 的压暗做法），全部被测试抓到。
- 深色主题与 v1.22.1 相同：22 个界面上 2,778 段文字的颜色、底色和字重逐一相同；主看板、角色详情、周趋势和毕业装备职业页签的截图逐字节相同。
- 其余七个 Edge 巡检（英文界面 / 毕业装备视觉 / 毕业装备页签 / 毕业装备易用性 / 天赋 / 应用更新 / 版本显示）全部通过，无页面错误、无联网请求。
- 启动器、桌面窗口和更新器与 v1.22.1 逐字节相同。

## English

### Fixes

- **Class colours were still off on the light theme.** v1.22.1 drew each class name in a darker version of its colour, but a light class colour darkened enough to read on white is no longer that colour: rogue yellow turned mustard, mage light blue teal, monk mint dark green. On the light theme and in print a class name is now a chip filled with the **game's own colour**, with near-black or white text, whichever has more contrast; all 13 classes reach at least 4.5:1. This applies to the main table, weekly trends, character details, the character list in Settings and the best-gear class tabs.
- **Every other game colour is exact as well**:
  - Keystone levels, stats (crit / haste / mastery / versatility) and source tags are chips in their own colour.
  - Item names: blue and purple qualities already read on white and keep their colour as text; green, orange, artifact and heirloom qualities are chips in their colour; white quality uses the text colour and grey quality a readable grey.
  - Stat bars and icon borders use the exact colour.
- Chips print, even with background graphics turned off.
- The dark theme is unchanged.

### Upgrading

- **v1.18.0 – v1.22.1**: Settings → Other → App updates → Check for updates, then install v1.22.2. Only interface files change; the launcher, desktop window and updater are not downloaded again.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.22.2.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- All 143 offline tests (the 4 light-palette tests rewritten for the new rule), `tests.html` (Edge: 33 parser, 71 data regression and 39 best-gear tests), 69 i18n checks, 100 mutation anchors and 66 application-updater assertions pass.
- The light-theme sweep covers 22 screens on Slate and Violet, 5 main screens on Jade and Amber, and printing from both the dark and the light theme: every text meets its contrast floor against the background it sits on, and every chip fill, game-coloured text and stat bar is the game's own colour. The same check fails on v1.22.1, which darkened the colours.
- Breaking the colour code and styles on purpose in 20 places (13 for the unit tests, 7 for the light-theme sweep; on each side one of them is going back to v1.22.1's darkening) is caught every time.
- The dark theme matches v1.22.1: on 22 screens, the colour, background and weight of all 2,778 texts are the same, and the screenshots of the main board, character details, weekly trends and the best-gear class tabs are byte-identical.
- The other seven Edge sweeps (English UI / best-gear visual / best-gear tabs / best-gear usability / talents / app updates / version display) pass with no page errors and no network requests.
- The launcher, desktop window and updater are byte-identical to v1.22.1.
