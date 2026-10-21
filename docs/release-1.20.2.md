# v1.20.2 — 修复 1.18–1.19 无法应用内更新、更新数据报错 / Fix in-app updates from 1.18–1.19 and the data-update error

## 中文

### 修复内容

- **v1.18.0–v1.19.0 无法应用内更新到 v1.20.x**：检查更新时提示「更新清单不合法，未安装。」。原因是 v1.20.0 起在发布包根目录加了 `README.en.md`，而这些旧版本的更新器只认它们自己的文件白名单，清单里出现一个不认识的路径就整份拒绝。现在英文 README 移到 `docs/README.en.md`（中文 README 顶部的切换链接同步更新），新清单能被 v1.18.0 起的所有更新器读取。
- 打包脚本会用冻结的 v1.18.0–v1.19.0 白名单逐条检查新清单，有旧版本不认识的路径就直接打包失败，不会再把这种清单发出去。
- **更新数据.bat 第 1 步（class-names）报错「两条「玩家职业」定义不一致 … TRAVELER」**：暴雪 DB2 新增了一个还没开放的隐藏职业「旅行者」，带 4 个专精（其中 3 个名字还是英文占位），骗过了原来「专精数 ≥ 3 才算玩家职业」的判定。现在改为「至少 2 个专精带精通法术」，生成的职业名表只保留玩家职业的专精（顺带去掉了不属于玩家职业的「冒险者」专精）。13 个职业、全部专精的中文名没有变化。
- 更新数据时如果游戏插件目录里没有 GearInsight，提示改为说明这不是错误：毕业装备 / 天赋样本沿用发布包自带的数据，也可以用 `-Lua` 指定别的插件目录。

### 数据

- 天赋树已从 raidbots 与暴雪 DB2 重新下载并生成，与 v1.20.1 自带的逐字节一致。
- raider.io 装备分布、Warcraft Logs 团本天赋仍是 2026-10-21 的数据。
- guide 编辑推荐仍是 2026-10-01 的快照：更新数据.bat 按来源访问政策不抓取 guide。

### 升级

- **v1.18.0 – v1.20.1**：设置 → 其他 → 应用更新 → 检查应用更新，直接安装 v1.20.2。之前报「更新清单不合法」的 1.18 / 1.19 用户现在可以正常更新。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.20.2.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 用 v1.19.0 的更新器源码编译出清单解析器，逐个读取历次发布的清单：v1.18.0 / v1.18.1 / v1.19.0 通过，v1.20.0 / v1.20.1 复现「清单不合法」，v1.20.2 通过。
- 新增职业名生成回归：用临时目录里的假 DB2 跑生成器，确认隐藏职业和宠物专精被排除、产物与仓库一致；隐藏职业带精通但没有天赋树、DB2 缺精通列时都会硬失败且不写文件。把判定改回旧规则，这条测试会报出用户遇到的同一个错误。
- 139 项离线测试、`tests.html`（Edge 中英文各跑一遍）、i18n 70 项检查、格式校验和 116 个变异锚点全部通过；启动器、桌面窗口和更新器与 v1.20.1 逐字节相同，应用内更新不会重新下载它们。

## English

### Fixes

- **v1.18.0–v1.19.0 could not update to v1.20.x in-app**: checking for updates reported "The update manifest is invalid; nothing was installed." Since v1.20.0 the package root contained `README.en.md`, and those older updaters only accept their own file whitelist, rejecting the entire manifest over one unknown path. The English README now lives at `docs/README.en.md` (the language switcher in the Chinese README follows it), so every updater since v1.18.0 can read the new manifest.
- The release script now checks every manifest path against a frozen copy of the v1.18.0–v1.19.0 whitelist and fails the build on any path those versions would reject, so such a manifest cannot ship again.
- **更新数据.bat step 1 (class-names) failed with "两条「玩家职业」定义不一致 … TRAVELER"**: Blizzard's DB2 gained an unreleased hidden class, Traveler, with 4 specializations (3 of them still English placeholders). That fooled the old "a class with ≥ 3 specs is playable" rule. The rule is now "at least 2 specs with a mastery spell", and the generated names table keeps only specs of playable classes (which also drops the non-player Adventurer spec). No Chinese class or spec name changed.
- When GearInsight is not installed in the game's AddOns folder, the data updater now says this is not an error: the gear/talent samples bundled with the release are kept, and `-Lua` can point at another AddOns folder.

### Data

- Talent trees were re-downloaded from raidbots and Blizzard DB2 and regenerated; the result is byte-identical to the copy bundled with v1.20.1.
- raider.io gear distributions and Warcraft Logs raid talents remain the 2026-10-21 data.
- guide editor picks remain the 2026-10-01 snapshot: per the source's access policy, 更新数据.bat does not fetch guide.

### Upgrading

- **v1.18.0 – v1.20.1**: Settings → Other → Application updates → Check for updates, then install v1.20.2. Users on 1.18 / 1.19 who saw "The update manifest is invalid" can now update normally.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.20.2.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- Built a manifest parser from the v1.19.0 updater source and fed it every published manifest: v1.18.0 / v1.18.1 / v1.19.0 pass, v1.20.0 / v1.20.1 reproduce "manifest invalid", v1.20.2 passes.
- Added a class-names generation regression: the generator runs against a fake DB2 in a temp folder; hidden classes and pet specs are excluded and the output matches the repository; a hidden class with masteries but no talent tree, or a DB2 without the mastery column, fails hard without writing a file. Reverting to the old rule makes this test report exactly the error users saw.
- All 139 offline tests, `tests.html` (run in Edge in Chinese and English), 70 i18n checks, format checks and 116 mutation anchors pass; the launcher, desktop window and updater are byte-identical to v1.20.1, so the in-app update does not re-download them.
