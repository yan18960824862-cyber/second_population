# 局部群落接入接口

V1 第一批：所有视图共用 Census.state，包含 view、camera / cameraId、currentTime、paused、selectedObjectId、filter、globalViewTransform。globalView 保存全局筛选、归一化视角、扫掠位置和档案卡状态。请通过现有事件或 API 接入，不再建立第二份对象数据库。

对象新增 cameraId、timeRange、categoryOriginal、eligibilityStatus、auditEvidence、modelStatus、resourceVerificationStatus。Census.candidateRecords 为 63 条待核验候选；Census.contextRecords 为 12 条上下文。它们是观察记录视图，不能当作已经物理去重的人造物数量。

当前 #objectWeb 内接入 Second Population Universe，右侧与全屏复用同一渲染器和统一记录。原 ObjectWeb DOM 保留为 ?visual=web 对照；原 B 全景引擎保留为兼容回退。主界面的三个来源图片、识别进度和实时代码继续使用原系统；下方 version 1 订阅接口不变。再次 mount 会清理当前宇宙模块，不要并行安装两套局部订阅。

新宇宙加载时一次建立 Census.candidateRecords 的全部 63 条记录，onScene 仅更新来源高亮，onFrame 仅更新可见时间信息，onObject 不用于增生粒子。数据口径和视觉功能类请复用：

```js
const { universeCategory, organizeUniverse } = await import('./universe-structure.js');
await Census.ready;
const layout = organizeUniverse(Census.candidateRecords);
// layout.nodes 一一对应真实观察；layout.groups 含五类、记录数与来源子群。
const functionalGroup = universeCategory(Census.get('SP-ST1-0003'));
// id / label / color：照明与监测。原 category/categoryOriginal 仍保持不变。
```

组员交付后，在自己的模块内接入：

```js
const unmount = SecondPopulationLocalCommunity.mount({
  onScene({ sceneId, scene, objects }) {
    // 更新来源高亮；对象含 canonicalId、sourceId、category、thumb、resourceData。
    // 使用常驻宇宙时，不按视频时间或场景变化重建全部节点。
  },
  onFrame({ sceneId, time, duration, visibleIds }) {
    // 来自监控视频 currentTime；visibleIds 为 canonicalId 数组。
  },
  onSelect({ canonicalId, sourceId, sceneId }) {},
  onObject({ canonicalId, category, color, object }) {
    // 每场景首次发现事件，可更新标注回放状态；常驻宇宙不在这里生成节点。
    // object.populationEligible: false=排除，null=待核验，true=经核验纳入。
  },
  dispose() { /* 停止自己的 RAF，移除监听器和 GPU 资源。 */ }
});

SecondPopulationLocalCommunity.select('SP-ST2-0001');
// 从局部群落打开相同对象的主站档案。
unmount();
```

`mount` 自动交付当前场景，并返回卸载函数；再次 mount 会清理上一订阅。底层数据入口为 `Census.ready`、`Census.records`、`Census.get(canonicalId)`、`Census.resolve(sourceId, sceneId)`。不要重新 fetch 独立 tracks 文件作为另一份运行数据。

`street1`–`street4` 是 B 的四个实际采样片段；`legacy` 是 A 的原始 STREET 02 77–107 秒片段，不能套用 B STREET 02 15–45 秒的追踪框。每个对象的 `resourceData.status` 为 unverified-estimate；示意数字不应当成为经过核验的环境评级。

`integration/visual-rules.js` 与原六个 visualGroupId/color 字段保留为历史兼容；当前宇宙的五类及冷色统一来自 universe-structure.js，两者不能混作同一分类。派生类不覆盖四个原始 category。空间是类别—来源的抽象排布，不是地理位置；类别布局包络体积随记录数缩放，不是物体真实体积。`Census.populationView` 仅返回已核验纳入的记录；当前显示“待核验”，不宣称已经核验的人口总量。

`ObjectUniverse.open(canonicalId)`、select(id)、focusCategory(id)、overview() 提供当前三层阅读入口；getState() 含 layoutVersion:2、groups、sources、selected 与生命周期计数。viewState 带 layoutVersion，旧布局的保存视角会回到新总览，避免沿用错误空间坐标。文件与原始对象数据仍共用现有 Census，禁止为新模块复制一份对象数据库。

自有 Canvas 动画可使用 `RenderLifecycle.loop(name, draw, () => RenderLifecycle.stageVisible())`。暂停、全屏星图、档案、标签页可见性请使用自己的可见性规则；关闭后必须取消 RAF。`RenderLifecycle.snapshot()` 提供已登记循环的帧计数，便于核对。
