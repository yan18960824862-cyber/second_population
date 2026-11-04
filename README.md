# 第二人口 · 分类群落与监控证据工作版

2026-11-02：在第一批数据与跳转修改上，按用户追加确认接入滚动摄像头与黑白影像漩涡，落到同一三维空间内的四台复古监视器。点击实体屏幕直接进入对应现场，取消中间的 ENTER 和卡片选择。主监控改为上方大画面、下方另外三个视角的图片；右侧依次为局部群落、识别进度和实时代码。A、B 原件及 master-integration 基线均未覆盖。

当前结果见 [分类与来源交付报告](audit-v1/universe-structure/DELIVERY.md)、[截图预览](audit-v1/index.html)、[本轮修改清单](audit-v1/current-changes.json)。[第一批报告](audit-v1/PHASE-1-REPORT.md) 和 audit/ 为较早阶段的记录，不代替当前回归结果。

最新可读性修复：全局入口每次居中显示全部记录，页头压缩，点与字体放大提亮；顶部五个大分类按钮与右侧完整物体清单支持直接选择，个体页提供上一个/下一个，底部可一键重置。见 [全景可读性与操作修复](audit-v1/universe-usability/REPORT.md)。旧 ZIP 是各自时间点的快照，不会自动更新。

## 启动

本副本预览： http://127.0.0.1:8040/ 。8030 是原整合基线，不是本次工作副本。

服务停止后，安装有 Node.js 的环境可在本目录运行：

```powershell
node tools/preview.cjs
```

也可以双击 start-preview.cmd。无需构建步骤、外部模型服务或运行依赖。需要 HTTP 服务，不要用 file:// 直接打开。端口已被当前预览占用时不必重复启动。

## 观看路径

向下滚动：摄像头坠落 → 黑白监控影像漩涡 → 四台复古监视器的三维观察台 → 点击一块实体屏幕 → 镜头推进并匹配到该路监控。可反向滚动回看，也可跳过过场直接抵达观察台。上方“四路观察台”可返回同一电脑空间；从那里返回当前监控会保留原时间和暂停状态。

进入现场后，上方主画面一次只播放当前监控，下面三个图片预览可切换为主视角。右侧宇宙按五个展示功能类别组织，每类内部按四路来源分区；切换监控改变来源高亮，不生成或重排粒子。分类数、来源数和对象数均从统一记录计算。全屏使用同一个宇宙和对象编号，支持类别下钻、个体取证图、模型、原档案及视频定位。

右侧和全屏当前采用 Second Population Universe，背景星云退为淡蓝灰气氛；旧 ObjectWeb 可用 ?visual=web 对照，原组员订阅接口保留。默认 63 条待核验候选；“来源资料”默认展示 12 条上下文，可切换全部 75 条。旧视频和 40 条观察收进来源资料的历史素材，不作为第五机位。空调仍为独立深度体验。模型是档案模型族或类别结构示意，不是现场精确扫描；取证图的精确帧时间缺失时标 DATA PENDING。

## 数据与统计

B 四场景的 75 条原始数据全部保留。A 与 B 的另外三场景有 54 条完全相同的注记，合并同一观察实例；A STREET 02 与 B STREET 02 为同一源录像的 77–107 秒和 15–45 秒，不能强行合并物理身份。统一库的 115 个存储项含旧片段、骑手上下文与独立空调演示，不是 115 个人造物。

原始四类与旧六功能分组字段不变；新宇宙在显示层派生五类：交通工具 40、导向与信息 4、照明与监测 4、道路围护与停放 5、地表基础设施 10。映射与冷色体系集中在 integration/universe-structure.js，不改写原始 category。人/骑手语境与自然对象不纳入候选视图，其他人造物候选尚待核验。resourceData 带原注记路径、单位和模拟属性，不能当作实测环境评估。

修改源轨迹或 archive/records.json 后运行：

```powershell
node tools/build-unified.cjs
node tools/verify-data.cjs
```

运行时统一读取 data/census.json。data/id-crosswalk.json 保存别名；data/matching-report.json 保存确证与待核验关联。原 B build_catalogue.py 与完整原包存于 street_census/，未对原件作修改。

## 交付内容

- [逐项测试报告](audit/FINAL-TEST-REPORT.md)
- [性能实测](audit/PERFORMANCE.md)
- [修改文件清单](MODIFIED-FILES.md)
- [局部群落接入接口](integration/LOCAL-COMMUNITY-API.md)
- audit/：测试 JSON、浏览器 trace、关键截图与原件校验。
- 上一级 second-population-backups/：A、B 原始 ZIP 备份。

当前回归工具位于 .tools/，需要该目录的 Playwright 依赖。运行 node .tools/test-universe-structure.cjs、node .tools/test-object-universe.cjs、node .tools/test-monitor-layout.cjs、node .tools/test-monitor-room.cjs、node .tools/test-room-fallback.cjs，核对语义、宇宙交互、主界面、入口与故障返回。node .tools/verify-current.cjs 核对原基线与本轮变更；数据仍用 node tools/verify-data.cjs 检查。已交付的 18:47 ZIP 保持原快照，不是此后分类修改的更新包。

较早的 verify.cjs、extended.cjs 等脚本保留为历史工具，部分固定使用 8030，不作为当前工作副本的回归入口。.tools/integrate.cjs 是旧的一次性迁移脚本，不用于重跑或启动。
