# v1.22.3 — 漫游团本列跟着每周走 / Timewalking raid column follows the week

## 中文

### 修复

- **漫游团本列一直显示过去某一周的团本。** AlterEgo 只在角色上线时更新它的副本锁定记录，周重置时也不清这份记录。所以一个号锁着本下线、之后不再上线，它的记录就一直写着「锁定中」。主表原来只看「锁定中」，分不清这是本周的还是早就到期的：两个 8 月下旬之后没上过线的号，让「奥杜尔 时空漫游」这一列在主表上挂了 7 周，那周的漫游团本早就换了。普通团本列也有同样的问题。
- 现在一条锁定要同时满足两点才算本周：游戏说它锁着，并且到扫描时还没到期。漫游团本列于是自动跟着每周走：
  - 有号打了本周的漫游团本，这一列就出现，没打的号显示「·」；
  - 周重置后锁定到期，这一列自己消失；
  - 下一周有号打了新的漫游团本，换成新的那一列。
- 鼠标移到漫游团本的表头上，会说明这一点。
- 已知限制：存档里没有「本周轮到哪个漫游团本」的信息，所以在还没有任何一个号进过本周的漫游团本之前，表上没法提前列出它。
- 角色详情和导出用的是同一个判断。深色、浅色主题的样式都不变。

### 升级

- **v1.18.0 – v1.22.2**：设置 → 其他 → 应用更新 → 检查应用更新，安装 v1.22.3。这次只更新界面文件，启动器、桌面窗口和更新器不会重新下载。
- **v1.17.3 及更早**：没有应用内更新器，请下载 **`WowAltBoard-v1.22.3.zip`**，退出程序后覆盖应用文件；保留 `data/` 和 `tools/config.json`。

### 验证

- 144 项离线测试（新增「本周」的判断，以及一份合成快照：漫游团本列有人打了就出现、久不上线的号留不住它、周重置后自己消失）、`tests.html`（Edge，解析器 33 项、数据回归 72 项、毕业装备 39 项）、i18n 69 项检查、100 个变异锚点、应用更新器 66 项断言全部通过。
- 把扫描时间往后挪一周（周重置后还没人打团本）再跑一遍也全部通过：原来会因为没有团本列而失败的两项，改为验合成快照。
- 故意把判断改回「只看锁定」或「只看到期」，测试都会报错。
- 浅色主题巡检加上了漫游团本列，所有文字对比度达标；深色主题与 v1.22.2 相同：22 个界面上 2,809 段文字的颜色、底色和字重逐一相同。
- 其余七个 Edge 巡检（英文界面 / 毕业装备视觉 / 毕业装备页签 / 毕业装备易用性 / 天赋 / 应用更新 / 版本显示）全部通过，无页面错误、无联网请求。
- 启动器、桌面窗口和更新器与 v1.22.2 逐字节相同。

## English

### Fixes

- **The timewalking raid column kept showing a raid from some past week.** AlterEgo only refreshes a character's lockouts when that character logs in, and its weekly reset does not clear them. So a character that logged off while locked and has not been back still reads as "locked". The main table only looked at "locked" and could not tell this week's lockouts from long-expired ones: two characters offline since late August kept the "Ulduar Timewalking" column on the main table for seven weeks, long after that week's timewalking raid had rotated. Regular raid columns had the same problem.
- A lockout now counts for this week only when the game says it is locked and it has not expired by the time of the scan. The timewalking raid column now follows the week by itself:
  - it appears once any character has run this week's timewalking raid, and characters that have not show "·";
  - it goes away when the lockout ends at the weekly reset;
  - next week it is replaced by the new raid once someone runs it.
- Hovering over the timewalking raid header explains this.
- Known limit: the saved data does not say which raid is this week's timewalking raid, so the table cannot list it before at least one character has entered it.
- Character details and exports use the same rule. Dark and light themes look the same as before.

### Upgrading

- **v1.18.0 – v1.22.2**: Settings → Other → App updates → Check for updates, then install v1.22.3. Only interface files change; the launcher, desktop window and updater are not downloaded again.
- **v1.17.3 and older**: there is no in-app updater; download **`WowAltBoard-v1.22.3.zip`**, exit the app and overwrite the application files; keep `data/` and `tools/config.json`.

### Verification

- All 144 offline tests (new: the "this week" rule, and a synthetic snapshot in which the timewalking column appears when someone has run it, is not kept alive by a character that has been offline for weeks, and goes away after the reset), `tests.html` (Edge: 33 parser, 72 data regression and 39 best-gear tests), 69 i18n checks, 100 mutation anchors and 66 application-updater assertions pass.
- With the scan time moved a week later (the reset has passed and nobody has raided yet) everything passes too: the two tests that used to fail for lack of a raid column now check the synthetic snapshot.
- Changing the rule back to "locked only" or "expiry only" on purpose makes the tests fail.
- The light-theme sweep now includes a timewalking raid column, and every text meets its contrast floor. The dark theme matches v1.22.2: on 22 screens, the colour, background and weight of all 2,809 texts are the same.
- The other seven Edge sweeps (English UI / best-gear visual / best-gear tabs / best-gear usability / talents / app updates / version display) pass with no page errors and no network requests.
- The launcher, desktop window and updater are byte-identical to v1.22.2.
