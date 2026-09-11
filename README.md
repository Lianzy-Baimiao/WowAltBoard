# 魔兽多角色看板（WowAltBoard）

[![许可 MIT](https://img.shields.io/badge/许可-MIT-blue?style=flat-square)](LICENSE)
[![赞赏 爱发电](https://img.shields.io/badge/赞赏-爱发电-946ce6?style=flat-square)](https://ifdian.net/a/lianzy)

把游戏里插件存下来的数据汇总成一个本地网页：**所有战网账号、所有角色**的大秘境、宝库、
地下堡、藏宝图、团本、纹章、猎物、装备、金币、专业，一张表里横向对比。截图为匿名示例数据。

![主看板](docs/images/dashboard.png)

## 下载安装

**[去 Releases 下载最新版 ZIP](https://github.com/Lianzy-Baimiao/WowAltBoard/releases/latest)**

下载附件里的 `WowAltBoard-vX.Y.Z.zip`（**不是**「Source code」那个压缩包），
解压到一个**可写**的目录，双击 `魔兽看板.exe`，完事。

不需要安装任何环境：Windows 10/11 自带的 PowerShell、.NET 和 Edge 就够用了。
想要桌面图标的话，托盘菜单里有「创建桌面快捷方式」。

## 快速开始

1. 安装并启用 [AlterEgo](https://www.curseforge.com/wow/addons/alterego) 插件（数据来源，必装）
2. 登录每个想看的角色，`/reload` 或退出游戏让插件写盘
3. 双击 `魔兽看板.exe`：它扫描游戏目录、打开看板窗口，然后常驻托盘，
   游戏写盘后自动重扫
4. 想要**专业**列就再装 [BagSync](https://www.curseforge.com/wow/addons/bagsync)；
   **备份箱**需要 MySlot 或编辑模式缓存。两个都是可选的，没装只是少几列

托盘右键菜单：打开看板 / 立即重新扫描 / **设置游戏目录** / 创建桌面快捷方式 / 退出。
默认只读正式服；要连经典怀旧服一起读，改 `tools/config.json` 的 `includeFlavors`。

## 主要功能

* **一张表对比所有角色**：多账号、跨服务器，60+ 列按需显示，点表头排序，
  按住表头拖动换列位置，整组也能搬家；调好的视图可以存成命名「布局方案」一键切换
* **角色详情**：点任意一行看逐本最佳记录、宝库三档、装备 16 槽位、狩猎清单
* **周趋势**：按游戏周对比评分、装等、宝库、藏宝图的变化
* **毕业装备 / 天赋**（顶栏「毕业装备」）：全部 40 个专精的毕业装推荐、
  和自己角色的对照、属性目标，以及排行榜热门天赋串——数据都在包里，离线可用
* **导出**：Excel / CSV / 打印成 PDF，导出的就是当前屏幕上的列和行
* **本地运行**：整个文件夹拷到 U 盘、别的电脑都能用；页面本身不联网

![毕业装备与天赋](docs/images/bis-talents.png)

天赋面板里点「复制」拿到官方导入串，到游戏里按 `N` → 右下角「导入/导出」→「导入」粘贴即可。

## 常见问题

**找不到游戏目录**　托盘菜单 →「设置游戏目录」选一下；或编辑 `tools/config.json`
的 `wowPaths`（反斜杠要写两个）。

**扫不出数据**　看板会弹对话框说明具体原因（没装插件 / 装了没启用 / 从没登录过）。
最常见的修法：装好 AlterEgo，登录角色后 `/reload`，回来点「重新扫描」。

**杀毒软件把 exe 隔离了**　exe 是发布时现场编译的，个别杀软会误报。
用 `启动.bat` 代替，功能一样（会开一个控制台窗口）。

**想读经典怀旧服**　`tools/config.json` 里把 `includeFlavors` 改成 `[]`（全读）
或列出想要的版本。

**毕业装备 / 天赋的数据怎么更新**　它们是打进包里的静态参照表，不会自己更新。
两种方式：①面板里「数据过期了？更新这些数据 → 在线拉最新数据」——点击才联网，
本次打开立即生效、不写盘，拉不到自动用包里的；②换赛季或想彻底刷新时双击
`更新数据.bat`（要联网；最慢的实战分布一步限速跑约 47 分钟，不想要它就用
命令行 `-SkipRio` 跳过），面板里也带可复制的完整命令。团本天赋串那一步需要
在 [Warcraft Logs](https://www.warcraftlogs.com/api/clients/) 免费申请一个
API 凭证（面板里的悬停说明有具体步骤），没有会跳过这一步。

## 数据与隐私

* 所有数据都从本机的插件存档（`WTF/Account/.../SavedVariables`）读取，
  解析结果写进看板文件夹的 `data/`——那是你的角色名、服务器、公会、金币、
  账号文件夹名和绝对路径，**不要把 `data/` 上传或分享给别人**
* 页面完全本地运行；唯一联网的是启动器问 GitHub「有没有新版本」（可在
  config 里把 `checkForUpdates` 设为 `false` 关掉）
* 备份串（MySlot 等）只在本地保存，不会发出任何地方

## 已知限制

* 只能看到**装了 AlterEgo 且登录过**的角色
* 专业列依赖 BagSync，没装就没有
* 主表货币没有图标（存档只给游戏内部 ID）；毕业装备面板的图标是打包好的
* 狩猎首领名是英文（游戏没把中文名写进存档）
* 天赋树是只读的展示，不是模拟器；改天赋用面板给的导入串

## 开发

```
node tools\run-tests.js        # 离线测试套件；或开 tests.html
tools\build-launcher.ps1       # 编译启动器 exe
tools\build-release.ps1        # 打发布 ZIP
```

仓库不包含 `data/`（个人数据，已 gitignore）和 exe（Release 附件分发）。
换赛季更新参照数据的抓取脚本在 `tools/` 里（`gen-bis.js`、`gen-talents.js`、
`fetch-*.js`，需要联网）。

作者：白描（[GitHub](https://github.com/Lianzy-Baimiao)）　许可：MIT

## 赞赏

工具免费，没有广告也没有内购。如果它帮你省下了每周翻小号的时间，欢迎请我喝一杯：
**<https://ifdian.net/a/lianzy>**　（看板里也有入口：设置 → 赞赏）
