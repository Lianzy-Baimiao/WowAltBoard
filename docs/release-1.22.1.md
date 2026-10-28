# v1.22.1 — 浅色主题配色修复 / Light theme colour fixes

## 中文

### 修复

- **浅色主题下职业色失真**：v1.22.0 用同一个公式把 13 个职业色一律压暗、压灰：圣骑士的粉变成暗紫红，盗贼的金变成橄榄绿，其他职业也都发暗发灰；死亡骑士、恶魔猎手、萨满本来就够深，也被压灰了。现在每个职业有自己的浅色版本：保留原来的色相，只压暗到白底上至少 4:1，并加粗显示。本来就够深的三个职业保持原色；牧师的白色没有色相可保留，改成冷灰。主表、角色详情、周趋势、设置里的角色列表和毕业装备的职业页签都用这套颜色。
- **物品品质色、属性色、来源色和钥石颜色**是游戏给深色界面配的，在白底上看不清：白色品质的物品名和白底一个颜色，绿色品质只有 1.4:1，暴击、急速、全能的数值和属性条也偏淡（急速约 2:1）。浅色主题和打印时改用同色相、白底上至少 4.5:1 的版本；深色主题不变。
- **说明文字和状态色**：浅灰色的说明文字，以及绿、橙、灰三种状态色，在浅色底上只有 2.6–3.8:1，现在都至少 4.5:1。石板蓝、青玉、琥珀三个皮肤在浅色下的强调色也略微加深。「旧赛季」「N 天未更新」这类提示标签、周趋势的涨跌标记、毕业装备部位栏里你自己的那件装备，对比度也都补够了。
- **从深色主题打印**时，纸上沿用深色主题的浅色文字，只有 1.3–3:1。现在打印时不管屏幕上是哪个主题，都用浅色配色。

### 升级

- **v1.18.0 – v1.22.0**：设置 → 其他 → 应用更新 → 检查应用更新，安装 v1.22.1。这次只更新界面文件，启动器、桌面窗口和更新器不会重新下载。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.22.1.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 145 项离线测试（新增 6 项浅色配色测试）、`tests.html`（Edge，解析器 33 项、数据回归 71 项、毕业装备 41 项）、i18n 69 项检查、100 个变异锚点、应用更新器 66 项断言全部通过。
- 新增的浅色主题巡检覆盖石板蓝、紫罗兰下的 22 个界面，青玉、琥珀下的 5 个主要界面，以及从深色、浅色两种主题打印。它逐段量文字对实际所在背景的对比度，全部达标；也没有任何元素还在用游戏给深色界面配的原色。
- 深色主题与 v1.22.0 相同：22 个界面上 2,778 段文字的颜色、底色和字重逐一相同，主看板截图逐字节相同。
- 其余七个 Edge 巡检（英文界面 / 毕业装备视觉 / 毕业装备页签 / 毕业装备易用性 / 天赋 / 应用更新 / 版本显示）全部通过，无页面错误、无联网请求。
- 启动器、桌面窗口和更新器与 v1.22.0 逐字节相同。

## English

### Fixes

- **Class colours were distorted on the light theme.** v1.22.0 darkened and greyed all 13 class colours with one formula: paladin pink turned plum, rogue gold turned olive, and every other class came out darker and duller; death knight, demon hunter and shaman, already dark enough, were greyed too. Each class now has its own light-theme colour: the same hue, darkened only until it reaches at least 4:1 on white, and drawn bold. The three that were already dark enough keep their own colour; priest white has no hue to keep and becomes a cool grey. The main table, character details, weekly trends, the character list in Settings and the best-gear class tabs all use these colours.
- **Item quality, stat, source and keystone colours** are the game's, made for its dark UI, and were hard to read on white: common item names were white on white, uncommon green was 1.4:1, and the crit, haste and versatility numbers and bars were pale (haste about 2:1). The light theme and printing now use versions with the same hue and at least 4.5:1 on white; the dark theme is unchanged.
- **Secondary text and status colours**: the grey secondary text and the green, orange and grey status colours were 2.6–3.8:1 on the light surfaces; all are now at least 4.5:1. The Slate, Jade and Amber accents are slightly darker on the light theme. Tags such as "Old season" and "N days without an update", the up/down markers in weekly trends and your own item in a best-gear slot header now have enough contrast too.
- **Printing from the dark theme** put the dark theme's light text on white paper, at 1.3–3:1. Printing now always uses the light colours, whichever theme is on screen.

### Upgrading

- **v1.18.0 – v1.22.0**: Settings → Other → App updates → Check for updates, then install v1.22.1. Only interface files change; the launcher, desktop window and updater are not downloaded again.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.22.1.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- All 145 offline tests (6 of them new light-palette tests), `tests.html` (Edge: 33 parser, 71 data regression and 41 best-gear tests), 69 i18n checks, 100 mutation anchors and 66 application-updater assertions pass.
- A new light-theme sweep covers 22 screens on Slate and Violet, 5 main screens on Jade and Amber, and printing from both the dark and the light theme. It measures every text against the background it actually sits on: all meet their floor, and no element still uses one of the game's dark-UI colours.
- The dark theme matches v1.22.0: on 22 screens, the colour, background and weight of all 2,778 texts are the same, and the main board screenshot is byte-identical.
- The other seven Edge sweeps (English UI / best-gear visual / best-gear tabs / best-gear usability / talents / app updates / version display) pass with no page errors and no network requests.
- The launcher, desktop window and updater are byte-identical to v1.22.0.
