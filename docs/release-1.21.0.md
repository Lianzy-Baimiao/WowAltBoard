# v1.21.0 — 毕业装备改用 SimulationCraft 默认配置 / Best gear now uses SimulationCraft default profiles

## 中文

### 变化

- **毕业装备的默认视角换成「模拟配装」**：数据来自 SimulationCraft 仓库 `profiles/MID2` 的默认配置（GPL-3.0），是模拟器维护者给每个专精配好、拿来跑默认模拟的那一套 —— 每个部位一件，团本和大秘境共用，不是排行榜，也不是使用率统计。29 个专精有配置（有的专精按英雄天赋各一份，共 47 份），一个专精有几份时可以切换。
- **装等、附魔、宝石、制造副属性**按配置原样显示。738 个部位里 686 个的装等是配置给的（写明的，或按 bonus_id 查升级轨道顶格表得到）；其余多是制造装备，借本机实测数据并标明来源，两边都查不到就不填。物品和附魔的中文名来自暴雪 DB2。
- **没有 SimC 配置的 11 个专精**（7 个治疗专精，以及平衡 / 守护德鲁伊、湮灭 / 增辉唤魔师）退到「实战分布」，页面上会说明原因。
- **天赋页**先画 SimC 配置的那一套，串原样转发，可以直接导入。两条英雄天赋都点了的配置（野性德鲁伊、射击猎人）和没点满的配置（冰霜死亡骑士）会单独标出来。「榜上热门天赋串」和插件统计照旧。
- **原来的「最佳推荐」视角已移除**，连同它的可刷替代、饰品分级和出手顺序；对应的数据文件和抓取工具不再随包发布。应用内更新到本版时，旧版本留下的这些文件会被自动删除。
- `更新数据.bat` 新增「模拟配装」一步：从 GitHub 上的 SimulationCraft 仓库取默认配置（默认走本机代理）；天赋树更新失败时跳过这一步，保留上次的数据。

### 许可

`app/simc-data.js` 衍生自 SimulationCraft 的配置文件，按 GPL-3.0 发布；来源提交和许可全文见 `docs/LICENSE-simulationcraft.md`、`docs/LICENSE-GPL-3.0.md`。看板其余部分仍是 MIT。

### 发布页与仓库历史

GitHub 上 v1.15.0 – v1.20.3 的发布和标签已移除，本版是目前的下载来源。仓库历史也一并改写，从 v1.15.0 起的提交号都变了：以前克隆过源码的，请重新克隆，不要在旧克隆上 `git pull`。v1.14.0 及更早的标签不受影响。

### 升级

- **v1.18.0 – v1.20.x**：设置 → 其他 → 应用更新 → 检查应用更新，直接安装 v1.21.0。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.21.0.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 新数据有自己的校验：`app/simc-data.js` 6335 项检查（用另一份独立写的解码器重新解天赋串、核对点数和英雄子树），生成器的解析另有 18 项离线回归；SimC 天赋页 29 个专精、80 次渲染，画出来的树和高亮的那一份配置逐节点对上，复制出去的串和产物逐字节相同。
- 139 项离线测试、`tests.html`（Edge）、i18n 69 项检查、格式校验和 100 个变异锚点全部通过；10 组变异测试共 111 个变异体全部被目标断言抓到。Edge 巡检（毕业装备 / 天赋 / 英文界面 / 视觉 / 应用更新 / 版本显示）无页面错误、无联网请求。
- 用 v1.18.0、v1.19.0、v1.20.3 三代更新器的源码分别编译，把解压出来的 v1.20.3 安装包更新到本版：旧数据文件和抓取工具被删掉，新文件就位，安装后每个文件与新清单逐字节一致，角色数据和游戏路径保留。启动器、桌面窗口和更新器与 v1.20.3 逐字节相同，应用内更新不会重新下载它们。

## English

### Changes

- **The default view of the best-gear panel is now "Simulated gear"**: the data comes from the default profiles in `profiles/MID2` of the SimulationCraft repository (GPL-3.0) — the set the simulator maintainers configure for each spec's default simulation. One item per slot, shared by raid and Mythic+; it is neither a ranking nor a usage statistic. 29 specs have a profile (some specs have one per hero talent, 47 in total); when a spec has several, you can switch between them.
- **Item levels, enchants, gems and crafted stats** are shown as the profile gives them. 686 of the 738 slots get their item level from the profile (stated directly, or looked up from bonus_id in the top-of-upgrade-track table); the rest are mostly crafted items, which borrow item levels from local measured data and say so, or stay blank when neither source has them. Localized item and enchant names come from Blizzard DB2.
- **The 11 specs without a SimC profile** (the 7 healer specs, plus Balance / Guardian Druid and Devastation / Augmentation Evoker) fall back to "Live distribution", and the page says why.
- **The talent page** draws the SimC profile's build first; its string is passed through as-is and imports directly. Profiles that spend points in both hero talents (Feral Druid, Marksmanship Hunter) and profiles that do not spend all their points (Frost Death Knight) are flagged. "Popular talent strings on the leaderboard" and the addon statistics are unchanged.
- **The former "Best picks" view has been removed**, together with its farmable alternatives, trinket tiers and rotation priorities; its data file and fetch tools are no longer shipped. Updating in-app to this version deletes the files older versions left behind.
- `更新数据.bat` gains a "simulated gear" step that takes the default profiles from the SimulationCraft repository on GitHub (through the local proxy by default); when the talent-tree update fails, the step is skipped and the previous data is kept.

### License

`app/simc-data.js` is derived from SimulationCraft's profiles and distributed under GPL-3.0; the source commit and the full license text are in `docs/LICENSE-simulationcraft.md` and `docs/LICENSE-GPL-3.0.md`. The rest of WowAltBoard remains MIT.

### Releases page and repository history

The v1.15.0 – v1.20.3 releases and tags have been removed from GitHub; this version is the current download. The repository history was rewritten as well, so every commit from v1.15.0 on has a new ID: if you cloned the source before, clone it again instead of running `git pull` on the old clone. Tags up to v1.14.0 are unchanged.

### Upgrading

- **v1.18.0 – v1.20.x**: Settings → Other → Application updates → Check for updates, then install v1.21.0.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.21.0.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- The new data has its own checks: 6335 checks on `app/simc-data.js` (talent strings re-decoded with a separately written decoder, points and hero subtrees cross-checked), plus 18 offline regressions for how the generator parses profiles; on the talent page, 29 specs across 80 renders draw a tree that matches the highlighted profile node by node, and the copied string is byte-identical to the data.
- All 139 offline tests, `tests.html` (Edge), 69 i18n checks, format checks and 100 mutation anchors pass; all 111 mutants across 10 mutation suites are caught by the assertion they target. The Edge sweeps (best gear / talents / English UI / visual / app updates / version display) report no page errors and no network requests.
- Updaters compiled from the v1.18.0, v1.19.0 and v1.20.3 sources each upgraded an extracted v1.20.3 install to this version: the old data file and fetch tools are deleted, the new files are in place, every installed file is byte-identical to the new manifest, and character data and game paths are kept. The launcher, desktop window and updater are byte-identical to v1.20.3, so the in-app update does not re-download them.
