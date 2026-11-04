# 修改与新增文件

原件保留在原位置；当前为独立运行副本。完整 SHA-256 清单见 delivery-manifest.json。

## A 的局部修改

- ac-archive/experience.js
- archive/catalog.js
- archive/inspection.js
- archive/motion.js
- glitch.js
- index.html
- model-loader/model-engine.js
- objectweb.js
- panels.js
- README.md
- tracker.js

index.html 仅增加模块入口、场景/星图控制和正确的媒体预载；tracker.js 保留原追踪与档案，改为统一数据适配并修复旧片段条件；glitch.js 保留视觉引擎，修复作用域与停止逻辑；panels.js 加入生命周期；objectweb.js 保留局部布局并共享颜色；catalog.js 读取统一库中的档案扩展；motion.js/model-engine.js/inspection.js 完成后台暂停与三视图；README 为整合版说明。

## 新增运行模块

- integration/camera-prelude.js：程序化三维摄像头、透视坠落、旋转收束空间与信号交接。
- integration/census-store.js、visual-rules.js：统一数据与功能配色。
- integration/lifecycle.js：可见性与 RAF 管理。
- integration/master.js、master.css：独立入口、四场景汇总、取证档案及局部模块接口。
- integration/global-survey-engine.js、global-survey.html：B 星图核心的独立提取，移除表格与子站逻辑，加入静止休眠、30fps 上限与光晕缓存。
- data/：统一库、别名和匹配报告。
- tools/build-unified.cjs、verify-data.cjs、preview.cjs、start-preview.cmd：生成、校验和启动。
- integration/LOCAL-COMMUNITY-API.md：后续组员模块接入。

## 原包、备份和证据

street_census/ 的 96 个原始文件完整保留且校验一致，包括原数据、缩略图、四段视频、catalogue.js 和 build_catalogue.py。A 的 165 个原始文件同样已备份校验。audit/ 包含初始审计、最终逐项回归、性能和关键页面截图；.tools/ 为本地测试辅助工具，不属于运行依赖。
