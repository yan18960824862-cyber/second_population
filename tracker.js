/* ═══════════════════════════════════════════════════
   TRACKER.JS — 识别模块
   职责：加载 tracks.json 坐标数据 → 按视频时间轴插值
   渲染识别框 → 跟随 / 悬停高亮 / 点击返回统一 objectId
   ═══════════════════════════════════════════════════ */
"use strict";

(async function () {
  const video      = document.getElementById("cam");
  const layer      = document.getElementById("trackLayer");
  const viewport   = document.getElementById("viewport");
  const layout     = document.querySelector(".layout");
  const timelineHandle = document.getElementById("timelineHandle");
  const timelineTip    = document.getElementById("timelineTip");
  const idToast    = document.getElementById("idToast");
  const playBtn    = document.getElementById("playBtn");
  const timeline   = document.getElementById("timeline");
  const timelineFill = document.getElementById("timelineFill");
  const timecode   = document.getElementById("timecode");
  const recTime    = document.getElementById("recTime");
  const hudClock   = document.getElementById("hudClock");
  const detectCount = document.getElementById("detectCount");
  const detectTotal = document.getElementById("detectTotal");
  const targetList = document.getElementById("targetList");
  const statObjects = document.getElementById("statObjects");
  const statEnergy  = document.getElementById("statEnergy");
  const statWater   = document.getElementById("statWater");
  const statPersons = document.getElementById("statPersons");
  const tpPct       = document.getElementById("tpPct");
  const tpBar       = document.getElementById("tpBar");
  const tpCount     = document.getElementById("tpCount");
  const tpTotal     = document.getElementById("tpTotal");
  const camLabel    = document.getElementById("camLabel");
  const zoneLabel   = document.getElementById("zoneLabel");
  const sceneNav    = document.getElementById("sceneNav");


  /* 面板（panels.js）：数据可视化 / 3D 群像 / 档案库 / 实时代码 */
  const Panels = window.Panels || {
    dataViz: { update() {} }, crowd: { update() {} },
    library: { build() {}, markActive() {} }, code: { update() {} }
  };

  /* Unified registry: four B captures plus A's separately timed legacy take. */
  const SCENES = Object.fromEntries((await window.Census.ready).scenes.map(s=>[s.key,{...s,tracks:s.sourceFile}]));
  let scenePromise=Promise.resolve();
  let discoveredIds=new Set();

  let objects = [];
  let duration = 30;
  let maxEnergy = 1;
  let order = [];
  let idToOrderIndex = new Map();
  let currentOrderIndex = 0;
  let currentScene = null;
  let loadToken = 0;

  /* ── 框层与视频实际渲染区域对齐（contain / cover） ── */
  function applyFit(videoEl, layerEl, mode) {
    if (!videoEl || !layerEl || !videoEl.videoWidth) return;
    const cw = videoEl.clientWidth, ch = videoEl.clientHeight;
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!cw || !ch) return;
    const s = mode === "cover" ? Math.max(cw / vw, ch / vh) : Math.min(cw / vw, ch / vh);
    const w = vw * s, h = vh * s;
    layerEl.style.left = ((cw - w) / 2) + "px";
    layerEl.style.top = ((ch - h) / 2) + "px";
    layerEl.style.width = w + "px";
    layerEl.style.height = h + "px";
  }

  const mainLayer = layer; // #trackLayer
  let lastMainSize = "";
  // 缓存 #trackLayer 的像素尺寸，供 transform:translate 定位使用
  // （只在 resize 时同步读取一次，避免每帧读 clientWidth 触发同步布局）
  let layerW = 0, layerH = 0;
  let lastT = 0;   // 帧间时间戳，用于缓动 dt

  /* ── 状态 ── */
  let selectedId = null;
  let focusId = null;
  let trackingEl = null;
  /* 离线检测：四段全部读烘焙 JSON，播放时不做推理；street3 优先用增强版 hi */
  const DET_FILES = {
    street1: ["data/detections/street_01.json"],
    street2: ["data/detections/street_02.json"],
    street3: ["data/detections/street_03_hi.json", "data/detections/street_03.json"],
    street4: ["data/detections/street_04.json"]
  };
  let detData = null;                 // {frames, binding: recordId→trackId, trk: Map(trackId→{cls,static,samples})}
  const detGhostEls = new Map();      // 5.4.2 起不再创建无档案 ghost，保留容器仅为兼容旧引用

  /* ── 5.4.2 框色：按物理类别分组，取 8780 参考图星云五色（实测色相 184/97/268/49/341），
     亮度提到糖果级；不透明度 1、3px 实线；标签与框同色。 ── */
  const FRAME_HUES = { transit: 184, person: 184, equipment: 97, ground: 49, signage: 341, lighting: 268, other: 184 };
  const FRAME_COLORS = {
    transit: "#86e3ea", person: "#86e3ea", equipment: "#acea86",
    ground: "#ead786", signage: "#ea86a5", lighting: "#b486ea", other: "#86e3ea"
  };
  function frameClassOf(obj) {
    if (obj && obj.category === "appliance") return "equipment";
    const up = window.UniversePalette;
    if (up && typeof up.physicalClass === "function") {
      const cls = up.physicalClass(obj);
      if (FRAME_COLORS[cls]) return cls;
    }
    return "ground";
  }
  let manualFocus = false;
  let toastTimer = null;
  const boxEls = new Map();   // objectId → DOM
  const lockEls = new Map();  // objectId → 档案卡内锁定进度条 <i>
  const listEls = new Map();  // objectId → li

  // 空调档案模块（v7 handoff）：同源 iframe 集成状态
  const acFrame = document.getElementById("acArchive");
  const acFrameClose = document.getElementById("acArchiveClose");
  let acApi = null;
  let acArchiveOpen = false;
  let acCloseBound = false;

  /* ── 档案卡挂载方向：贴右边界改左挂，贴顶边改下挂（沿用 4 场景版本） ── */
  const CARD_W = 176;
  const CARD_H = 210;
  function placeCard(box) {
    const lr = layer.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const leftIn = br.left - lr.left;
    const topIn = br.top - lr.top;
    const sideW = (document.querySelector(".sidebar") || {}).offsetWidth || 232;
    const toLeft = leftIn + 14 + CARD_W > lr.width - 4;
    box.classList.toggle("align-r", toLeft);
    const off = toLeft ? 14 : Math.max(14, sideW + 16 - leftIn);
    box.style.setProperty("--card-x", off + "px");
    box.classList.toggle("side-b", topIn < CARD_H);
  }

  /* ── 构建左侧目标清单（按场景重建） ── */
  function buildSceneUI() {
  // 切换场景时先清空上一场景的清单 / 识别框 / 映射
  targetList.innerHTML = "";
  layer.querySelectorAll(".track-box").forEach((el) => el.remove());
  boxEls.clear(); lockEls.clear(); listEls.clear();

  // 档案遍历顺序（按出现时间排序），供上/下一个目标使用
  order = objects.slice().sort((a, b) => a.appear - b.appear);
  idToOrderIndex = new Map(order.map((o, i) => [o.objectId, i]));
  currentOrderIndex = 0;

  detectTotal.textContent = "/ " + String(objects.length).padStart(2, "0");
  tpTotal.textContent = String(objects.length).padStart(2, "0");
  objects.forEach((obj) => {
    const li = document.createElement("li");
    li.className = "target-item" + (obj.isAc ? " ac-item" : "");
    li.dataset.id = obj.objectId;
    const acBadge = obj.isAc ? '<span class="ac-badge">AC</span>' : "";
    const timeText = obj.isAc
      ? "固定目标 · 点击进入空调档案"
      : "出现 " + obj.appear.toFixed(1) + "s — " + obj.disappear.toFixed(1) + "s · CONF " + obj.conf.toFixed(2);
    li.innerHTML =
      '<div class="t-name"><span><span class="t-status"></span>' + obj.label + acBadge + "</span>" +
      '<span class="t-id">' + obj.objectId + "</span></div>" +
      '<div class="t-time">' + timeText + "</div>";
    li.addEventListener("click", () => {
      video.currentTime = obj.appear + 0.05;
      selectObject(obj.objectId);
    });
    targetList.appendChild(li);
    listEls.set(obj.objectId, li);
  });

  /* ── 为每个目标创建识别框 DOM ── */
  objects.forEach((obj) => {
    const box = document.createElement("div");
    // person 类别 → 白色描边（参考图：人物框为白色）
    box.className = "track-box cat-" + (obj.category || "default") + (obj.isAc ? " ac-box" : "");
    box.dataset.id = obj.objectId;
    box.dataset.canonicalId = obj.canonicalId;
    box.style.display = "none";
    const en = obj.labelEn || obj.label || obj.objectId;
    const energyPct = Math.min(100, Math.round(((obj.energyKwh || 0) / 45000) * 100));
    const midT = ((obj.appear + obj.disappear) / 2).toFixed(1);

    // 5.4.2 类别色：同一类别同色（与星云同一色相），标签文字跟随框色
    const fcls = frameClassOf(obj);
    const fcol = FRAME_COLORS[fcls] || FRAME_COLORS.other;
    box.dataset.fclass = fcls;
    box.dataset.hue = String(FRAME_HUES[fcls]);
    box.style.setProperty("--box-stroke", fcol);
    box.style.setProperty("--box-tag", fcol);
    box.style.setProperty("--box-track", fcol + "33");

    box.innerHTML =
      '<div class="box-tag"><span class="tid">' + en + " " + obj.objectId + "</span>" +
      '<span class="box-meter"><i></i></span></div>' +
      '<div class="box-card">' +
        '<div class="card-leader"></div>' +
        '<div class="card-tag">' +
          '<span class="t-label">' + en + "</span>" +
          '<span class="t-conf">' + obj.conf.toFixed(2) + "</span>" +
          '<span class="lock"><i></i></span>' +
        "</div>" +
        '<div class="card-id"><span class="k">ID:</span><span class="v">' + obj.objectId + "</span></div>" +
        '<div class="card-photo">' +
          '<img src="' + obj.thumb + '" alt="" onerror="this.remove()">' +
          '<span class="ph-cap">EVIDENCE · T+' + midT + "s</span>" +
        "</div>" +
        '<div class="card-rows">' +
          '<div class="card-row"><span class="k">TYPE</span><span class="v">' +
            (obj.category || "—").toUpperCase() + "</span></div>" +
          '<div class="card-row"><span class="k">FUNC</span><span class="v">' +
            (obj.function || "—") + "</span></div>" +
          '<div class="card-row"><span class="k">TRACK</span><span class="v">' +
            obj.appear.toFixed(1) + " – " + obj.disappear.toFixed(1) + "s</span></div>" +
        "</div>" +
        '<div class="card-chip" hidden><span>ENERGY</span>' +
          '<b><i style="width:' + energyPct + '%"></i></b>' +
          "<em>" + (obj.energyKwh || 0).toLocaleString("en-US") + "</em></div>" +
      "</div>";

    // 动态主体（车辆 / 骑手）2px 实线框；静态工业物 1px 淡框（数据仍用原标注，位置固定更准）
    const moving = obj.category === "vehicle" || obj.category === "person";
    box.classList.add(moving ? "subject" : "static");
    // 静态标注过松（bbox 覆盖 >40% 画面）→ 跳过不画，避免一个巨框罩住整片
    const kfs0 = obj.keyframes || [];
    obj._staticTooLarge = !moving && kfs0.some((k) => (k.w || 0) * (k.h || 0) > 0.40);

    box.addEventListener("click", (e) => {
      e.stopPropagation();
      selectObject(obj.objectId);
    });
    box.addEventListener("mouseenter", () => {
      window.Census.emit('hover',{canonicalId:obj.canonicalId,active:true});
      // 静态物只靠 CSS :hover 提亮细框并显示短编号，不弹证据卡、不参与琥珀色追踪
      if (!moving) return;
      focusId = obj.objectId;
      manualFocus = true;
      box.classList.add("focused");
      placeCard(box);
    });
    box.addEventListener("mouseleave", () => {
      window.Census.emit('hover',{canonicalId:obj.canonicalId,active:false});
      if (!moving) return;
      if (manualFocus && focusId === obj.objectId) manualFocus = false;
      box.classList.remove("focused");
    });

    layer.appendChild(box);
    boxEls.set(obj.objectId, box);
    obj._meterEl = box.querySelector(".box-meter i");
    lockEls.set(obj.objectId, box.querySelector(".card-tag .lock i"));
  });

  /* ── 右侧目标蛛网：点位 ↔ 识别框 / 清单行联动 ──
     包 try/catch：蛛网只是辅助视图，出问题不能连累识别框 / 标签的构建 */
  if (window.ObjectWeb) {
   try {
    window.ObjectWeb.build(objects, {
      onSelect: function (oid) {
        const obj = objects.find((o) => o.objectId === oid);
        if (!obj) return;
        const maxT = video.duration || duration;
        video.currentTime = Math.min(maxT, obj.appear + 0.05);
        selectObject(oid);
      },
      onHover: function (oid, on) {
        const b = boxEls.get(oid);
        if (b) b.classList.toggle("web-hover", on);
        const li = listEls.get(oid);
        if (li) li.classList.toggle("web-hover", on);
      }
    });
   } catch (e) { console.warn("[ObjectWeb] 蛛网构建失败，识别框不受影响", e); }
  }
  }

  /* ── 关键帧 Catmull-Rom 样条插值（比线性更顺滑，消除折线顿挫） ── */
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function sampleProp(kfs, t, key) {
    if (t <= kfs[0].t) return kfs[0][key];
    const last = kfs[kfs.length - 1];
    if (t >= last.t) return last[key];
    let i = 0;
    while (i < kfs.length - 1 && !(t >= kfs[i].t && t <= kfs[i + 1].t)) i++;
    const p1 = kfs[i], p2 = kfs[i + 1];
    const seg = (t - p1.t) / ((p2.t - p1.t) || 1);
    const p0 = kfs[i - 1] || p1;   // 端点处退化为线性，避免越界
    const p3 = kfs[i + 2] || p2;
    return cr(p0[key], p1[key], p2[key], p3[key], seg);
  }
  function interpolate(kfs, t) {
    return {
      x: sampleProp(kfs, t, "x"),
      y: sampleProp(kfs, t, "y"),
      w: sampleProp(kfs, t, "w"),
      h: sampleProp(kfs, t, "h")
    };
  }

  /* ── 点击选中 → 返回统一 objectId ── */
  function selectObject(objectId, idx, returnSnapshot) {
    const obj = objects.find((o) => o.objectId === objectId);
    if (!obj) return;
    selectedId = obj.objectId;

    if (idx != null) currentOrderIndex = idx;
    else currentOrderIndex = idToOrderIndex.get(objectId) ?? 0;

    focusId = obj.objectId;
    manualFocus = true;

    // 高亮选中 + 弹出证据卡（悬停 / 选中均可触发，沿用 4 场景版本风格）
    boxEls.forEach((el, id) => {
      const on = id === obj.objectId;
      el.classList.toggle("selected", on);
      if (on) { el.classList.add("focused"); placeCard(el); }
      else el.classList.remove("focused");
    });
    listEls.forEach((el, id) => el.classList.toggle("selected", id === obj.objectId));
    showToast("objectId → " + obj.objectId);

    window.Census.emit('select',{canonicalId:obj.canonicalId,sourceId:obj.objectId,sceneId:currentScene});
    // 树 / 绿篱不属于工业物：保留画面检测框，但不进档案、星图与模型
    if (/\b(TREE|HEDGE)\b/i.test(obj.labelEn || '')) { showToast('自然对象 · 不纳入档案'); return; }
    if(obj.category==='industrial' && /LUMINAIRE|STREETLIGHT/.test(obj.labelEn)){openObjectArchive({...obj,category:'infrastructure',sourceCategory:obj.category});return;}

    // 空调目标：打开全屏 v7 专用档案模块
    if (obj.isAc) { if (objArchiveOpen) closeObjectArchive(); openAcArchive(); return; }

    // 其余目标：照搬 8780 版——点击即进整页加载（全屏扫描，进度 0→100 同时模型旋转），完成后落档案
    openObjectArchive(obj);
  }

  // 上一个 / 下一个目标：按顺序跳转并把视频拉到该目标出现时刻
  function goToOrder(delta) {
    const n = order.length;
    const next = ((currentOrderIndex + delta) % n + n) % n;
    const obj = order[next];
    const maxT = video.duration || duration;
    video.currentTime = Math.min(maxT, obj.appear + 0.1);
    selectObject(obj.objectId, next);
  }

  function showToast(text) {
    idToast.textContent = text;
    idToast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => idToast.classList.remove("show"), 1800);
  }

  /* ── 档案数据分组 ──
     将 info 按 识别 / 运营 / 能耗 分组，能耗强度按真实最大值计算 */
  const GROUP_OF = {
    "生物识别": "ident", "特征": "ident", "备注": "ident",
    "能源类型": "oper", "核定载客": "oper",
    "制造能耗": "energy", "车辆制造能耗": "energy",
    "制造用水": "energy", "年运营碳排放": "energy",
    "年运营耗电": "energy", "状态": "oper",
  };
  const GROUP_TITLE = {
    ident:  "识别档案 · IDENT",
    oper:   "运营参数 · OPERATION",
    energy: "能耗档案 · ENERGY",
  };

  function renderIdentityTable(obj) { return window.ArchiveData.identity(obj); }

  /* ── 播放控制 ── */
  playBtn.addEventListener("click", () => {
    if (video.paused) video.play();
    else video.pause();
  });

  video.addEventListener("play",  () => (playBtn.textContent = "❚❚"));
  video.addEventListener("pause", () => (playBtn.textContent = "▶"));

  timeline.addEventListener("click", (e) => {
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * (video.duration || duration);
  });

  timeline.addEventListener("mousemove", (e) => {
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    timelineTip.style.left = (ratio * 100).toFixed(2) + "%";
    timelineTip.textContent = "00:" + pad(Math.floor(ratio * (video.duration || duration)));
  });

  // 键盘导航：档案打开时左右切换目标，Esc 关闭
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("oaInspectionDialog")?.open) return;
    if (document.getElementById("oaSourceDialog")?.open) return;
    if (acArchiveOpen) {
      if (e.key === "Escape") { e.preventDefault(); closeAcArchive(); }
      return;
    }
    if (objArchiveOpen) {
      if (e.key === "Escape") { e.preventDefault(); closeObjectArchive(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goToOrder(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goToOrder(1); }
      return;
    }
  });

  /* ── 空调档案模块（v7 handoff）同源 iframe 集成 ──
     按 README 推荐方式：先显示 iframe 再 open，监听 sp:archive-close 后隐藏 */
  function ensureAcApi() {
    if (acApi) return acApi;
    try {
      const w = acFrame.contentWindow;
      if (w && w.SecondPopulationArchive) {
        acApi = w.SecondPopulationArchive;
        if (!acCloseBound) {
          w.addEventListener("sp:archive-close", closeAcArchive);
          acCloseBound = true;
        }
      }
    } catch (err) { /* 跨域时不可达；本部署为同源 */ }
    return acApi;
  }

  let acPending = false;
  acFrame.addEventListener("load", () => {ensureAcApi();if(acPending && acApi){acPending=false;openAcArchive();}});
  window.addEventListener("message", (e) => {
    if (e.source===acFrame.contentWindow && e.origin===location.origin && e.data && e.data.type === "sp-ready") ensureAcApi();
  });

  function openAcArchive() {
    if(!acFrame.getAttribute("src")) acFrame.src=acFrame.dataset.src;
    const api = ensureAcApi();
    if (!api) { acPending=true;showToast("AC ARCHIVE 模块加载中…"); return; }
    acArchiveOpen = true;
    rememberScene();
    window.Census.setState({view:'archive'});
    acFrame.hidden = false;          // 先可见，画布才能取得正确尺寸
    acFrameClose.hidden = false;
    video.pause();
    document.body.style.overflow = "hidden";
    window.RenderLifecycle.changed();
    requestAnimationFrame(() => {
      try { api.open("SP-0004"); }   // 直接进入旋转加载 → 档案，跳过模块演示空间
      catch (err) { console.error("[AC] open 失败:", err); }
    });
  }

  function closeAcArchive() {
    if (!acArchiveOpen) return;
    acArchiveOpen = false;
    acFrame.hidden = true;
    acFrameClose.hidden = true;
    document.body.style.overflow = "";
    boxEls.forEach((el) => el.classList.remove("show-card", "focused"));
    if (acApi && typeof acApi.close === "function") {
      try { acApi.close(); } catch (err) {}
    }
    acApi=null;acCloseBound=false;acPending=false;acFrame.removeAttribute('src');
    window.Census.setState({view:'monitor'});
    restoreScene();
    window.RenderLifecycle.changed();
  }

  acFrameClose.addEventListener("click", closeAcArchive);

  /* ─────────────────────────────────────────────────────────────
     通用 OBJECT ARCHIVE —— 全屏两段式档案（与空调 v7 同范式）
       阶段一：几何扫描（线网逐级揭示 + 旋转 + 进度条）
       阶段二：档案（实体模型 + 身份表 + 碳记录 + 资源连接，逐块揭示）
     ───────────────────────────────────────────────────────────── */
  const objArchive      = document.getElementById("objArchive");
  const objArchiveClose = document.getElementById("objArchiveClose");
  const oaScan          = document.getElementById("oaScan");
  const oaDossier       = document.getElementById("oaDossier");
  const oaScanShell     = document.getElementById("oaScanShell");
  const oaScanId        = document.getElementById("oaScanId");
  const oaScanStatus    = document.getElementById("oaScanStatus");
  const oaProgressFill  = document.getElementById("oaProgressFill");
  const oaProgressNum   = document.getElementById("oaProgressNum");
  const oaProgressBar   = document.getElementById("oaProgressBar");
  const oaFootnoteId    = document.getElementById("oaFootnoteId");
  const oaSubject       = document.getElementById("oaSubject");
  const oaName          = document.getElementById("oaName");
  const oaNameEn        = document.getElementById("oaNameEn");
  const oaIdentity      = document.getElementById("oaIdentity");
  const oaCarbonValue   = document.getElementById("oaCarbonValue");
  const oaCarbonNote    = document.getElementById("oaCarbonNote");
  const oaResourceUnit  = document.getElementById("oaResourceUnit");
  const oaFooterNote    = document.getElementById("oaFooterNote");
  const oaViewLabel     = document.getElementById("oaViewLabel");
  const oaSolidCanvas   = document.getElementById("oaSolidCanvas");
  const oaWireCanvas    = document.getElementById("oaWireCanvas");
  const oaProfileCanvas = document.getElementById("oaProfileCanvas");
  const oaCrosses       = document.getElementById("oaCrosses");

  const oaEntry = new window.ArchiveEntry(oaDossier, {reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches});
  let objArchiveOpen = false;
  let oaScanPlayer = null;    // 扫描阶段播放器（线网）
  let oaSolidPlayer = null;   // 档案阶段播放器（实体）
  let oaPhase = "scan";         // scan | dossier
  let oaCurrent = null;         // 当前目标对象
  let oaRevealTimer = null;
  let oaScanRaf = null;
  let oaScanResume=null,oaScanHiddenAt=0;
  document.addEventListener('visibilitychange',()=>{
    if(!objArchiveOpen||oaPhase!=='scan')return;
    if(document.hidden){oaScanHiddenAt=performance.now();cancelAnimationFrame(oaScanRaf);}
    else if(oaScanResume){oaScanResume.shift(performance.now()-oaScanHiddenAt);oaScanRaf=requestAnimationFrame(oaScanResume.step);}
  });

  /* 场景状态记忆：打开档案前记住播放/焦点，关闭时原样恢复（不再强行续播） */
  let sceneState = null;
  function rememberScene() {
    if (!sceneState) sceneState = { sceneId:currentScene,time:video.currentTime,selectedObjectId:selectedId?objects.find(o=>o.objectId===selectedId)?.canonicalId:null,paused: video.paused, focus: document.activeElement, overflow: document.body.style.overflow };
  }
  function restoreScene() {
    const saved = sceneState; sceneState = null;
    document.body.style.overflow = saved?.overflow ?? "";
    if (saved && !saved.paused) video.play().catch(() => {});
    else video.pause();
    if (saved?.focus?.isConnected) saved.focus.focus({ preventScroll: true });
  }

  /* 三维检视弹窗（张娜娜 10/26 新增：可拖拽旋转的真三维视图） */
  const inspection = new window.ArchiveInspection(document.getElementById("oaInspectionDialog"));
  document.getElementById("oaInspect").addEventListener("click", () => {
    if (!oaCurrent || oaPhase !== "dossier") return;
    if (oaSolidPlayer) oaSolidPlayer.stop();
    if (window.ArchiveMotion) window.ArchiveMotion.stop();
    inspection.open(oaCurrent);
  });
  inspection.onClose = () => {
    if (!objArchiveOpen || oaPhase !== "dossier" || !oaCurrent) return;
    oaSolidPlayer?.showSolid(oaCurrent.category, window.ArchiveCatalog.subtype(oaCurrent));
    if(!window.ArchiveCatalog.studyKind(oaCurrent)||oaCurrent.category==='vehicle')window.ArchiveMotion?.start(oaProfileCanvas, oaCurrent);
  };

  if (oaCrosses) oaCrosses.innerHTML = "<span></span>".repeat(20);

  /* 能耗读数：只读取 energy-manifest.json（两份能耗报告的可核算数据），运行时不再生成任何数字 */
  const energyManifest = { map: null, pending: null };
  function loadEnergyManifest() {
    if (!energyManifest.pending) {
      energyManifest.pending = fetch("energy-manifest.json", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(j => {
          const map = new Map();
          (j && j.items || []).forEach(item => { if (item && item.objectId) map.set(item.objectId, item); });
          energyManifest.map = map;
          return map;
        });
    }
    return energyManifest.pending;
  }
  function energyTag(item, field) {
    if (!item) return { text: "未核算", state: "none" };
    const status = field === "daily" ? item.dailyStatus : item.embodiedStatus;
    if (status === "verified") {
      if (field === "daily" && Number(item.dailyKwh) === 0) return { text: "无源", state: "verified" };
      return { text: "可核算", state: "verified" };
    }
    if (status === "estimated") return { text: "估算", state: "estimate" };
    return { text: "未核算", state: "none" };
  }
  function energyNumber(value, unit) {
    const n = Number(value);
    if (value === null || value === undefined || !Number.isFinite(n)) return "—";
    let text;
    const abs = Math.abs(n);
    if (abs === 0) text = "0";
    else if (abs >= 1000) text = Math.round(n).toLocaleString("en-US");
    else if (abs >= 10) text = n.toFixed(1).replace(/\.0$/, "");
    else if (abs >= 1) text = n.toFixed(2).replace(/\.?0+$/, "");
    else text = n.toFixed(2);
    return text + " " + unit;
  }
  function fillEnergyFigures(obj) {
    const daily = document.getElementById("oaDailyValue"), dailyTag = document.getElementById("oaDailyTag");
    const embodied = document.getElementById("oaEmbodiedValue"), embodiedTag = document.getElementById("oaEmbodiedTag");
    if (!daily || !embodied) return;
    const key = obj.canonicalId || obj.objectId;
    daily.textContent = "—"; embodied.textContent = "—";
    dailyTag.textContent = "未核算"; dailyTag.dataset.state = "none";
    embodiedTag.textContent = "未核算"; embodiedTag.dataset.state = "none";
    loadEnergyManifest().then(map => {
      if (!objArchiveOpen || !oaCurrent || (oaCurrent.canonicalId || oaCurrent.objectId) !== key) return;
      const item = map && map.get(key);
      const dTag = energyTag(item, "daily"), eTag = energyTag(item, "embodied");
      if (item) {
        daily.textContent = energyNumber(item.dailyKwh, "kWh/日");
        embodied.textContent = energyNumber(item.embodiedKwh, "kWh");
      }
      dailyTag.textContent = dTag.text; dailyTag.dataset.state = dTag.state;
      embodiedTag.textContent = eTag.text; embodiedTag.dataset.state = eTag.state;
    });
  }

  /* 阶段二：档案内容填充（居民档案版 B + A 的补充观察分支） */
  function populateObjectArchive(obj) {
    const A=window.ArchiveData, kind=window.ArchiveCatalog.subtype(obj);
    const profile=window.residentProfile(kind,obj);
    const azhong=kind==='truck' && obj.objectId==='TRK-0002';
    oaSubject.textContent='居民档案 / '+(obj.canonicalId||obj.objectId);
    oaName.textContent=azhong?'阿重':obj.label;
    oaNameEn.textContent=(azhong?'厢式货车 · ':'')+obj.labelEn;
    const structures={van:'高顶车厢 · 滑门导轨 · 轮组',mpv:'乘员舱 · 侧窗 · 轮组',truck:'驾驶室 · 货厢 · 底盘',suv:'车身 · 轮拱 · 底盘',sedan:'乘员舱 · 风挡 · 轮组',bus:'客舱 · 站立区 · 车门',coach:'乘员舱 · 行李舱 · 轮组',banner:'立杆 · 横撑 · 旗面','bike-rack':'车架 · 轮组 · 停放支架'};
    const rows=[['居民编号',obj.canonicalId||obj.objectId],['来源街区',obj.cameraId||window.Census.get(obj.canonicalId)?.cameraId||'街区观察'],['城市角色',profile.role]];
    if(structures[kind])rows.push(['身体结构',structures[kind]]);
    oaIdentity.innerHTML=rows.map(([k,v])=>'<div class="id-row"><dt>'+k+'</dt><dd>'+A.escape(v)+'</dd></div>').join('');
    document.getElementById('oaDescription').textContent=azhong?'「货物我都护好啦。」　温柔、靠谱、有些慢热。喜欢晚霞和驾驶室里的电台。':profile.story;
    oaViewLabel.textContent='结构研究 / 01';
    oaCarbonValue.textContent=profile.value;
    document.getElementById('oaCarbonUnit').textContent=profile.unit;
    oaCarbonNote.textContent=profile.note;
    fillEnergyFigures(obj);
    const link=document.getElementById('energySource');link.hidden=!profile.url;link.href=profile.url||'';link.textContent=profile.source+' ↗';
    document.getElementById('oaCarbonExpression').innerHTML='<svg viewBox="0 0 32 24" width="52" height="39" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h20l4 4v12l-4 4H6l-4-4V6z"/><path d="M8 9h4m8 0h4M10 15v2h12v-2"/></g></svg><small>工作神态 · '+profile.mood+'</small>';
    oaResourceUnit.textContent=obj.label;
    const icon=document.querySelector('#objArchive .resource-unit svg'),unit=icon.parentElement;
    unit.querySelector('canvas')?.remove();icon.style.display='';
    if(window.ArchiveCatalog.studyKind(obj)){
      icon.style.display='none';
      const tile=document.createElement('canvas');tile.width=154;tile.height=88;tile.style.cssText='width:77px;height:44px;display:block;margin:auto';unit.prepend(tile);
      const model=window.ModelEngine.buildModel(obj.category,kind);
      window.ArchiveEngineering.render(tile.getContext('2d'),model,{w:154,h:88,pitch:.32,glitch:false});
    }else icon.innerHTML=A.symbol(obj);
    document.getElementById('residentRole').textContent=profile.role;
    oaFooterNote.textContent='居民叙事 / 角色创作';
    document.getElementById('oaInsetOne').textContent=(kind==='streetlight'||(window.ArchiveCatalog.studyKind(obj)&&obj.category!=='vehicle'))?'构造 / STRUCTURE':'轮组 / WHEEL';
    document.getElementById('oaInsetTwo').textContent=(window.ArchiveCatalog.studyKind(obj)&&obj.category!=='vehicle')?'侧视 / PROFILE':'机能 / MOTION STUDY';
    document.getElementById('oaSourceText').textContent='观察编号 '+(obj.canonicalId||obj.objectId)+' · '+obj.label+'。形象为结构示意，独白与神态为角色创作。能耗卡使用同类公开资料。';
    oaFooterNote.dataset.base='居民叙事 / 角色创作';
    // 人工补充的静态设施：档案里标「补充观察」，并用当前帧裁切图做临时证据占位
    let ex = document.getElementById('oaExtraEvidence');
    if (obj._extra) {
      const idBox = document.querySelector('#objArchive .identity-box');
      if (!ex && idBox) {
        ex = document.createElement('figure');
        ex.id = 'oaExtraEvidence';
        ex.className = 'oa-extra-evidence';
        ex.innerHTML = '<img alt="补充观察帧裁切"><figcaption>FRAME CROP · 补充观察（人工补充，未入主账）</figcaption>';
        idBox.appendChild(ex);
      }
      if (ex) {
        const img = ex.querySelector('img');
        if (img) img.src = obj._thumbCrop || obj.thumb || '';
        ex.hidden = false;
      }
      oaNameEn.textContent = obj.label + ' / ' + A.type(obj) + ' · 补充观察';
      oaFooterNote.textContent = 'MANUAL SUPPLEMENT / 补充观察：人工补充静态设施，未纳入候选主账。';
    } else if (ex) ex.hidden = true;
  }

  /* 缩略图：线框结构 + 侧影视图（一次性静态渲染） */
  function renderArchiveInsets(obj) {
    if (!window.ModelEngine) return;
    if (window.ArchiveVisuals) { requestAnimationFrame(()=>{ if(oaCurrent!==obj||!objArchiveOpen)return; window.ArchiveVisuals.detail(oaWireCanvas,obj,"wheel");window.ArchiveVisuals.detail(oaProfileCanvas,obj,"assembly"); }); return; }
    const subtype = window.ModelEngine.detectSubtype(obj.category, obj.labelEn);
    const model = window.ModelEngine.buildModel(obj.category, subtype);
    const draw = (canvas, mode, yaw) => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, r.width || 200), h = Math.max(1, r.height || 130);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode === "wire") {
        window.ModelEngine.renderScan(ctx, model, {
          w: w, h: h, yaw: yaw, time: 0, completion: 1, opacity: 1
        });
      } else {
        window.ModelEngine.renderSolid(ctx, model, { w: w, h: h, yaw: yaw, time: 0 });
      }
    };
    // 等布局稳定后再绘制（canvas 需要真实尺寸）
    requestAnimationFrame(function () {
      draw(oaWireCanvas, "wire", -0.5);
      draw(oaProfileCanvas, "solid", -1.35);
    });
  }

  /* 阶段一：扫描 */
  function runScan(obj) {
    oaPhase = "scan";
    inspection.close();
    if(window.ArchiveMotion)window.ArchiveMotion.stop();
    oaEntry.cancel();
    if(oaScanPlayer)oaScanPlayer.stop();
    if(oaSolidPlayer)oaSolidPlayer.stop();
    if(oaScanRaf)cancelAnimationFrame(oaScanRaf);
    if(oaRevealTimer)clearTimeout(oaRevealTimer);
    oaScan.hidden = false;
    oaDossier.hidden = true;
    oaDossier.classList.remove("is-open", "is-revealing");
    oaScanId.textContent = obj.objectId;
    document.getElementById("oaScanType").textContent=(window.ArchiveCatalog.studyKind(obj)?obj.labelEn:window.ArchiveData.type(obj))+" / 01";
    const subtype=window.ArchiveCatalog.subtype(obj);
    const street=window.ArchiveCatalog.studyKind(obj)&&obj.category!=='vehicle';
    const parts=street?['PROFILE','SURFACE','ASSEMBLY','DETAIL']:obj.category==='person'?['HELMET','RIDER','FRAME','DRIVE']:subtype==='truck'?['CAB','CARGO BODY','CHASSIS','RUNNING GEAR']:obj.category==='infrastructure'?['MAST','ARM','LED ARRAY','BASE']:['BODY','GLAZING','RUNNING GEAR','THERMAL'];
    document.getElementById('oaScanParts').replaceChildren(...parts.map(label=>{const span=document.createElement('span');span.textContent=label;return span;}));
    oaFootnoteId.textContent = obj.objectId;
    oaScanStatus.textContent = "INITIALIZING";
    oaScanShell.style.setProperty('--frame-opacity','0');
    oaScanShell.style.setProperty('--content-opacity','0');
    oaScanShell.style.setProperty('--frame-x','.28');
    oaScanShell.style.setProperty('--frame-y','.02');
    oaProgressFill.style.width = "0%";
    oaProgressNum.textContent = "00%";
    oaProgressBar.setAttribute("aria-valuenow", "0");

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1200 : window.ArchiveSequence.duration;
    let start = performance.now();
    const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    const step = () => {
      if(document.hidden||!objArchiveOpen||oaPhase!=='scan')return;
      const el = performance.now() - start;
      const frame=window.ArchiveSequence.frame(el,duration);
      const prog = frame.progress;
      oaProgressFill.style.width = prog + "%";
      oaProgressNum.textContent = String(prog).padStart(2, "0") + "%";
      oaProgressBar.setAttribute("aria-valuenow", String(prog));
      oaScanStatus.textContent=frame.label;
      oaScanShell.style.setProperty('--frame-opacity',frame.frameOpacity.toFixed(3));
      oaScanShell.style.setProperty('--frame-x',frame.frameX.toFixed(3));
      oaScanShell.style.setProperty('--frame-y',frame.frameY.toFixed(3));
      oaScanShell.style.setProperty('--content-opacity',frame.contentOpacity.toFixed(3));
      if (!frame.done) { oaScanRaf = requestAnimationFrame(step); }
    };
    oaScanResume={step,shift:delta=>{start+=delta}};
    oaScanRaf = requestAnimationFrame(step);

    // 模型动画：线网扫描 → 实体
    if (window.ModelEngine) {
      if (!oaScanPlayer) oaScanPlayer = new window.ModelEngine.Player(document.getElementById("oaModelCanvas"));
      oaScanPlayer.attach(document.getElementById("oaModelCanvas"));
      oaScanPlayer.play(obj.category, window.ArchiveCatalog.subtype(obj), {
        duration: duration,
        started: start,
        onDone: function () { if(oaScanPlayer)oaScanPlayer.stop(); if(objArchiveOpen && oaCurrent===obj)showDossier(obj); }
      });
    } else {
      if (oaRevealTimer) clearTimeout(oaRevealTimer);
      oaRevealTimer = setTimeout(function () { showDossier(obj); }, duration);
    }
  }

  /* 阶段二：档案 */
  function showDossier(obj) {
    oaPhase = "dossier";
    // 停掉扫描播放器：避免其在隐藏画布上继续空转渲染
    if (oaScanPlayer) oaScanPlayer.stop();
    oaScan.hidden = true;
    oaDossier.hidden = false;
    oaDossier.scrollTop=0;
    oaDossier.classList.add("is-revealing");
    populateObjectArchive(obj);
    renderArchiveInsets(obj);
    if(window.ArchiveMotion&&(!window.ArchiveCatalog.studyKind(obj)||obj.category==='vehicle'))requestAnimationFrame(()=>{if(objArchiveOpen&&oaCurrent===obj)window.ArchiveMotion.start(oaProfileCanvas,obj);});
    oaEntry.play();
    requestAnimationFrame(function () { if(objArchiveOpen && oaCurrent===obj)oaDossier.classList.add("is-open"); });
    // 实体模型持续渲染（切换到档案阶段的画布）
    if (window.ModelEngine) {
      if (!oaSolidPlayer) oaSolidPlayer = new window.ModelEngine.Player(oaSolidCanvas);
      oaSolidPlayer.attach(oaSolidCanvas);
      oaSolidPlayer.showSolid(obj.category, window.ArchiveCatalog.subtype(obj));
    }
    // 档案滑动到星图：挂在真正滚动的 .dossier-shell 上，滚到底自动进入星图
    const scrollPane = document.querySelector('#objArchive .dossier-shell');
    if (window.PopulationJourney && scrollPane && obj.canonicalId) {
      window.PopulationJourney.mount(scrollPane, obj.canonicalId, () => {
        if (window.ObjectUniverse?.enabled) return window.ObjectUniverse.open(obj.canonicalId);
        const btn = document.getElementById('openGlobalSurvey');
        if (btn) btn.click();
      });
    }
  }

  function openObjectArchive(obj) {
    rememberScene();
    selectedId = obj.objectId;
    oaCurrent = obj;
    boxEls.forEach((el, id) => el.classList.toggle("selected", id === obj.objectId));
    listEls.forEach((el, id) => el.classList.toggle("selected", id === obj.objectId));
    if (Panels.library && Panels.library.markActive) Panels.library.markActive(obj.objectId);
    showToast("objectId → " + obj.objectId);

    objArchiveOpen = true;
    window.Census.setState({view:'archive',selectedObjectId:obj.canonicalId,currentTime:video.currentTime});
    window.Census.emit('archiveopen',{canonicalId:obj.canonicalId,sceneId:currentScene});
    window.RenderLifecycle.changed();
    objArchive.hidden = false;
    objArchive.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    video.pause();
    runScan(obj);
  }

  function closeObjectArchive(options={}) {
    if (!objArchiveOpen) return;
    objArchiveOpen = false;
    inspection.close();
    if (document.getElementById('oaSourceDialog').open) document.getElementById('oaSourceDialog').close();
    if(window.ArchiveMotion)window.ArchiveMotion.stop();
    objArchive.hidden = true;
    objArchive.setAttribute("aria-hidden","true");
    oaEntry.cancel();
    document.body.style.overflow = "";
    boxEls.forEach((el) => el.classList.remove("show-card", "focused"));
    if (oaScanPlayer) oaScanPlayer.stop();
    if (oaSolidPlayer) oaSolidPlayer.stop();
    if (oaScanRaf) cancelAnimationFrame(oaScanRaf);
    if (oaRevealTimer) clearTimeout(oaRevealTimer);
    if (Panels.library && Panels.library.markActive) Panels.library.markActive(null);
    if(options.resume===false){sceneState=null;video.pause();}else{window.Census.setState({view:'monitor'});restoreScene();}
    window.Census.emit('archiveclose',{canonicalId:oaCurrent?.canonicalId,suppressed:options.resume===false});
    window.RenderLifecycle.changed();
  }

  objArchiveClose.addEventListener("click", closeObjectArchive);
  const oaBack = document.getElementById("oaBackToScene");
  if (oaBack) oaBack.addEventListener("click", closeObjectArchive);
  const oaPrevBtn = document.getElementById("oaPrev");
  const oaNextBtn = document.getElementById("oaNext");
  if (oaPrevBtn) oaPrevBtn.addEventListener("click", function (e) { e.stopPropagation(); goToOrder(-1); });
  if (oaNextBtn) oaNextBtn.addEventListener("click", function (e) { e.stopPropagation(); goToOrder(1); });
  const oaReplay = document.getElementById("oaReplay");
  if (oaReplay) oaReplay.addEventListener("click", function () {
    if (oaCurrent) runScan(oaCurrent);
  });

  document.getElementById('oaSource').addEventListener('click',()=>document.getElementById('oaSourceDialog').showModal());
  document.getElementById('oaSourceClose').addEventListener('click',()=>document.getElementById('oaSourceDialog').close());
  window.addEventListener('resize',()=>{if(!objArchiveOpen)return;if(oaPhase==='scan'&&oaScanPlayer)oaScanPlayer.resize();if(oaPhase==='dossier'){if(oaSolidPlayer)oaSolidPlayer.resize();renderArchiveInsets(oaCurrent);}});

  /* ── 数字滚动动画 ── */
  const shown = { objects: 0, energy: 0, water: 0, persons: 0 };
  function tickNumber(el, key, target) {
    if (shown[key] === target) return;
    shown[key] += (target - shown[key]) * 0.12;
    if (Math.abs(target - shown[key]) < 1) shown[key] = target;
    el.textContent = Math.round(shown[key]).toLocaleString("en-US");
  }

  /* ── 时间码格式化 ── */
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtTC(t) {
    return pad(Math.floor(t / 60)) + ":" + pad(Math.floor(t % 60)) + ":" + pad(Math.floor((t % 1) * 25));
  }

  /* ── 离线检测数据（street3 试点）：加载 + 按时间取框 ── */
  const DET_FAM = { person: "person", bicycle: "rider", motorcycle: "rider" };
  function detFam(cls) { return DET_FAM[cls] || "vehicle"; }
  function detIou(a, b) {
    const ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h;
    const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const uni = a.w * a.h + b.w * b.h - inter;
    return uni > 0 ? inter / uni : 0;
  }
  async function loadDetData(scene) {
    const files = DET_FILES[scene];
    if (!files) return null;
    let det = null, file = null;
    try {
      const map = await fetch("data/detections/match-v2.json", { cache: "no-store" }).then((r) => r.json());
      for (const f of files) {
        const r = await fetch(f, { cache: "no-store" });
        if (!r.ok) continue;
        det = await r.json();
        file = f;
        break;
      }
      if (!det || !Array.isArray(det.frames)) return null;
      const binding = {};
      (map.bindings || []).forEach((b) => {
        if (b.scene === scene) binding[b.canonicalId] = b.trackId;
      });
      const trk = new Map();
      det.frames.forEach((fr) => (fr.boxes || []).forEach((b) => {
        let x = Math.max(0, Math.min(1, b.x)), y = Math.max(0, Math.min(1, b.y));
        let w = Math.min(b.w, 1 - x), h = Math.min(b.h, 1 - y);
        if (w <= 0 || h <= 0) return;
        if (!trk.has(b.trackId)) trk.set(b.trackId, { cls: b.cls, samples: [], static: false });
        trk.get(b.trackId).samples.push({ t: fr.t, x, y, w, h, cls: b.cls });
      }));
      trk.forEach((info) => {
        const s = info.samples;
        if (!s.length) return;
        let path = 0;
        for (let i = 1; i < s.length; i++) path += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
        const dur = Math.max(0.1, s[s.length - 1].t - s[0].t + 0.1);
        // 位移 < 画面宽 4%/秒 → 停放物（不给琥珀、弱化显示）
        info.static = path / dur < 0.04;
      });
      // 只保留在本段检测里真实存在的 track 的绑定
      Object.keys(binding).forEach((cid) => { if (!trk.has(binding[cid])) delete binding[cid]; });
      const info = { scene, file, tracks: trk.size, bound: Object.keys(binding).length,
        frames: det.frames.length, duration: det.duration };
      window.__detInfo = Object.assign(window.__detInfo || {}, { [scene]: info });
      console.info("[DET] loaded", JSON.stringify(info));
      return { scene, file, binding, trk, duration: det.duration, video: det.video };
    } catch (err) {
      console.warn("[DET] 检测数据不可用，回退手写标注", scene, err);
      return null;
    }
  }
  function clearDetBoxes() {
    detGhostEls.forEach((el) => el.remove());
    detGhostEls.clear();
    objects.forEach((o) => { o._detTrackId = null; });
  }
  function attachDetData() {
    detGhostEls.forEach((el) => el.remove());
    detGhostEls.clear();
    objects.forEach((o) => {
      const tid = detData ? detData.binding[o.canonicalId] : null;
      o._detTrackId = Number.isFinite(tid) ? tid : null;
      o._fit = null;
    });
    if (!detData) return;
    // 5.4.2 框层退回 B：未绑定轨迹一律不画框（不再创建 ghost）
    // 原 ghost 建框循环已断开，detGhostEls 保持为空，renderDetGhosts 自然空转
  }
  function sampleDetBox(tid, t) {
    const info = detData && detData.trk.get(tid);
    if (!info || !info.samples.length) return null;
    const s = info.samples;
    if (t < s[0].t - 0.15 || t > s[s.length - 1].t + 0.15) return null;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].t < t) lo = mid + 1; else hi = mid; }
    const b = s[lo], a = s[Math.max(0, lo - 1)];
    if (Math.abs(b.t - t) <= 0.06) return b;
    if (a && Math.abs(a.t - t) <= 0.06) return a;
    if (a && b && b.t - a.t <= 0.26 && t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
               w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f, cls: b.cls };
    }
    return null;
  }
  /* 无档案检测框渲染：停放的弱化、叠框去重（person 让位给 motorcycle/bicycle，且有档案框优先） */
  function renderDetGhosts(t, visObjs) {
    if (!detData) return;
    const items = [];
    detGhostEls.forEach((el, tid) => {
      const info = detData.trk.get(tid);
      const b = info ? sampleDetBox(tid, t) : null;
      if (!b) {
        if (el.style.display !== "none") { el.style.display = "none"; el.style.opacity = "0"; el._on = false; }
        return;
      }
      if (el.style.display === "none") el.style.display = "block";
      el.style.left = (b.x * 100).toFixed(3) + "%";
      el.style.top = (b.y * 100).toFixed(3) + "%";
      el.style.width = (b.w * 100).toFixed(3) + "%";
      el.style.height = (b.h * 100).toFixed(3) + "%";
      items.push({ el, b, cls: info.cls, static: info.static });
    });
    const hide = new Set();
    items.forEach((it) => {
      // 与有档案的主体框重叠 → 隐藏副本，避免双层框
      if (visObjs.some((o) => detIou(o.box, it.b) > 0.5)) { hide.add(it.el); return; }
      // person 与 motorcycle/bicycle 同一目标 → 保留车类框
      if (it.cls === "person" && items.some((x) => x !== it && detFam(x.cls) === "rider" && detIou(x.b, it.b) > 0.5)) {
        hide.add(it.el);
      }
    });
    items.forEach((it) => {
      const op = hide.has(it.el) ? "0" : (it.static ? "0.18" : "0.55");
      if (it.el._op !== op) { it.el.style.opacity = op; it.el._op = op; }
    });
  }

  /* ── 主渲染循环 ── */
  let lastDraw = 0;
  function renderFrame(time) {
    // 帧间 dt（用于缓动）
    if (!lastT) lastT = time;
    const dt = Math.min(0.05, (time - lastT) / 1000);
    lastT = time;
    // 限到 ~30fps：识别框位移极慢，不必每帧全量重写 DOM（省主线程，保证点击响应）
    if (time - lastDraw < 33) return;
    lastDraw = time;

    const t = video.currentTime;


    // 框层尺寸对齐（尺寸变化时才重算）
    // 指纹里必须带上 videoWidth：视频元数据晚到时 applyFit 会提前 return，
    // 若指纹只看 clientWidth，letterbox 校准就永远不会再执行，整屏框会错位
    const mainSize = video.clientWidth + "x" + video.clientHeight + "@" + (video.videoWidth || 0);
    if (mainSize !== lastMainSize || !layerW || !layerH) {
      applyFit(video, mainLayer, "contain");
      lastMainSize = mainSize;
      layerW = mainLayer.clientWidth; layerH = mainLayer.clientHeight; // 仅此一次同步布局
      if (!layerW || !layerH) {
        // 兜底：元素处于未布局 / 隐藏状态时 clientWidth 为 0，改用 rect 量一次
        const r = mainLayer.getBoundingClientRect();
        layerW = r.width; layerH = r.height;
      }
    }

    // 时间轴与时间码
    const d = video.duration || duration;
    timelineFill.style.width = ((t / d) * 100).toFixed(2) + "%";
    timelineHandle.style.left = ((t / d) * 100).toFixed(2) + "%";
    timecode.textContent = "00:" + pad(Math.floor(t)) + " / 00:" + pad(Math.floor(d));
    recTime.textContent = "REC 00:" + fmtTC(t);
    hudClock.textContent = "T+" + t.toFixed(2) + "s";

    // 识别框跟随（内容校验 + presence 缓动：出现/消失不硬切、空框不残留）
    let onscreen = 0, energy = 0, water = 0, persons = 0;
    const lockedNow = [];
    const trackPick = [];
    const visObjs = [];
    objects.forEach((obj) => {
      const el = boxEls.get(obj.objectId);
      const li = listEls.get(obj.objectId);
      const kfs = obj.keyframes || [];
      const kfA = kfs.length ? kfs[0].t : Infinity;
      const kfB = kfs.length ? kfs[kfs.length - 1].t : -Infinity;
      // 在场判定：时间字段 ∩ 关键帧覆盖区间。越界/缺段一律不画框（宁可没有，也不挂假框）
      const inWindow = t >= obj.appear && t <= obj.disappear && t >= kfA - 0.05 && t <= kfB + 0.05;
      // 离线检测试点（street3）：已绑定记录直接用烘焙框；检测缺失即不画（不拿手写框冒充）
      const useDet = !!(detData && obj._detTrackId != null);
      const detBox = useDet ? sampleDetBox(obj._detTrackId, t) : null;
      const b0 = kfs.length ? interpolate(kfs, t) : null;

      // 标注框各边等比内缩 12%：直边、无阶梯毛边；宁可略松也不做像素收紧
      const moving = obj.category === "vehicle" || obj.category === "person";
      const fit = b0 ? {
        x: b0.x + b0.w * 0.12,
        y: b0.y + b0.h * 0.12,
        w: b0.w * 0.76,
        h: b0.h * 0.76,
      } : null;
      let bb = null, visible = false;
      if (!detData) {
        // legacy：仍用手写标注
        bb = obj._staticTooLarge ? null : fit;
        visible = inWindow && !!bb;
      } else if (moving) {
        // 动态主体：优先烘焙检测框；检测断档 / 未绑定（如 ST1-0011）回退到关键帧框，保证有框
        bb = detBox ? { x: detBox.x, y: detBox.y, w: detBox.w, h: detBox.h } : ((inWindow && fit) ? fit : null);
        visible = !!bb;
      } else {
        // 静态工业物：位置固定，沿用原标注框（比 YOLO 更准）；过大标注跳过
        bb = (inWindow && !obj._staticTooLarge) ? fit : null;
        visible = !!bb;
      }
      if (bb) obj._fit = bb;
      if (!visible) { obj._fit = null; obj._density = null; }
      const target = visible ? 1 : 0;
      if (obj._pres == null) obj._pres = 0;
      obj._pres += (target - obj._pres) * Math.min(1, dt * 6.5);   // ≈150–250ms 淡入/淡出
      if (!visible && obj._pres < 0.012) {
        if (el.style.display !== "none") el.style.display = "none";
        li.classList.remove("onscreen");
        if (el.classList.contains("tracking")) el.classList.remove("tracking");
        obj._logged = false;
        return; // 完全离场，跳过后续更新
      }
      if (el.style.display === "none") el.style.display = "block";

      if (visible && bb) {
        onscreen++;
        const b = bb;
        // 只把动态主体交给 ghost 去重（静态物不参与叠框判定）
        if (moving) visObjs.push({ el, box: b, cls: useDet ? ((detData.trk.get(obj._detTrackId) || {}).cls || "vehicle") : (obj.category === "person" ? "person" : "vehicle") });
        // 位置改走 GPU 合成（transform:translate），不再写 left/top —— 消除每帧 layout 重排（卡顿主因）
        if (layerW && layerH) {
          obj._tx = Math.round(b.x * layerW * 100) / 100;
          obj._ty = Math.round(b.y * layerH * 100) / 100;
          obj._bw = b.w * layerW;
        }
        // 尺寸仍用 %（bbox 宽高变化少，dirty-check 命中即跳过）
        const W = (b.w * 100).toFixed(3) + "%";
        const H = (b.h * 100).toFixed(3) + "%";
        if (obj._W !== W) { el.style.width = W; obj._W = W; }
        if (obj._H !== H) { el.style.height = H; obj._H = H; }
        // 标签第二行：当日已运行时长 ÷ 日运行时段（census appear→disappear），只画细条不写数字
        if (obj._meterEl) {
          const span = Math.max(0.1, (obj.disappear || 0) - (obj.appear || 0));
          const ratio = Math.min(1, Math.max(0, (t - (obj.appear || 0)) / span));
          const rw = (ratio * 100).toFixed(1) + "%";
          if (obj._meterW !== rw) { obj._meterEl.style.width = rw; obj._meterW = rw; }
          obj._meterRatio = ratio;
          const meterOff = (obj._bw || 0) < 60;   // 框宽 <60px 只留第一行，进度条隐藏
          if (obj._meterOff !== meterOff) { obj._meterOff = meterOff; el.classList.toggle("meter-off", meterOff); }
        }
        {
          const dist = Math.abs(b.x + b.w / 2 - .5) + Math.abs(b.y + b.h / 2 - .45) * 1.4;
          // 5.4.2：唯一的金色框 = 被选中/被追踪的那一个。只有"选中"优先；
          // 未选中时仍只跟随移动主体（悬停不改变框色，标签才能跟随类别色）
          if (obj.objectId === selectedId) {
            trackPick.push({ el, rank: 0, dist });
          } else if (obj.category === "vehicle" || obj.category === "person") {
            trackPick.push({ el, rank: 2, dist });
          }
        }
        // 锁定进度条：目标出现后 1.2s 内填满 → 模拟识别锁定过程
        const lock = lockEls.get(obj.objectId);
        const lockPct = Math.min(100, ((t - obj.appear) / 1.2) * 100);
        if (lock && obj._lock !== lockPct) { lock.style.width = lockPct + "%"; obj._lock = lockPct; }
        li.classList.add("onscreen");
        // 刚刚完成锁定 → 推送到实时代码面板
        if (lockPct >= 100 && !obj._logged) {
          obj._logged = true;
          lockedNow.push(obj);
        }
      }

      // presence → 透明度；5.4.2 起所有框统一 opacity 1（淡入淡出仍由 presence 控制）
      const op = obj._pres.toFixed(3);
      if (obj._op !== op) { el.style.opacity = op; obj._op = op; }
      const sc = (0.90 + 0.10 * obj._pres).toFixed(3);
      const tf = "translate(" + (obj._tx || 0) + "px," + (obj._ty || 0) + "px) scale(" + sc + ")";
      if (obj._tf !== tf) { el.style.transform = tf; obj._tf = tf; }

      // 贴边的框：标签翻向内侧，避免被 .viewport 的 overflow:hidden 整条裁掉
      const tx = obj._tx || 0, ty = obj._ty || 0, bw = obj._bw || 0;
      const tagIn = ty < 22;
      if (obj._tagIn !== tagIn) { el.classList.toggle("tag-in", tagIn); obj._tagIn = tagIn; }
      const tagR = !tagIn && layerW > 0 && tx + bw > layerW - 108;
      if (obj._tagR !== tagR) { el.classList.toggle("tag-r", tagR); obj._tagR = tagR; }

      // 累计统计：已出现过的目标计入普查
      if (t >= obj.appear) {
        energy += obj.energyKwh;
        if (obj.category === "person") persons++;
        const w = obj.info["制造用水"];
        if (w) water += parseFloat(w.replace(/[^0-9.]/g, "")) || 0;
      }
    });

    // 无档案检测框（street3 试点）：按时间取框、停放弱化、叠框去重
    renderDetGhosts(t, visObjs);

    // 正在跟的那个目标：金色；同一时刻画面里最多 1 个（选中 > 画面中心，悬停不改色）
    let bestPick = null, bestScore = 1e9;
    trackPick.forEach((p) => {
      const score = p.rank * 100 + p.dist;
      if (score < bestScore) { bestScore = score; bestPick = p; }
    });
    if (trackingEl && (!bestPick || trackingEl !== bestPick.el)) { trackingEl.classList.remove("tracking"); trackingEl = null; }
    if (bestPick && trackingEl !== bestPick.el) { bestPick.el.classList.add("tracking"); trackingEl = bestPick.el; }

    // The visible code panel consumes canonical discovery/frame events in monitor-layout.js.

    detectCount.textContent = pad(onscreen);

    // 右侧目标蛛网：随识别进度点亮点位（内部脏检查，开销极小）
    if (window.ObjectWeb) window.ObjectWeb.tick(t);
    window.Census.emit("frame",{sceneId:currentScene,time:t,duration:d,visibleIds:objects.filter(o=>t>=o.appear&&t<=o.disappear).map(o=>o.canonicalId)});
    for(const obj of objects){if(t>=obj.appear&&!discoveredIds.has(obj.canonicalId)){discoveredIds.add(obj.canonicalId);window.Census.emit('objectdiscovered',{canonicalId:obj.canonicalId,sceneId:currentScene,category:obj.category,color:obj.color,object:obj});}}

    // 识别跟踪进度：已出现目标数 / 总目标数
    const identified = objects.filter((o) => t >= o.appear).length;
    const pct = Math.round((identified / objects.length) * 100);
    tpPct.textContent = pct + "%";
    tpBar.style.width = pct + "%";
    tpCount.textContent = String(identified).padStart(2, "0");

    tickNumber(statObjects, "objects", identified);


    tickNumber(statPersons, "persons", persons);

    const identifiedObjects=objects.filter(o=>t>=o.appear&&o.populationEligible!==false);
    tickNumber(statEnergy,"energy",identifiedObjects.reduce((a,o)=>a+(o.energyKwh||0),0));
    tickNumber(statWater,"water",identifiedObjects.reduce((a,o)=>a+(parseFloat(String(o.info?.['制造用水']||'').replace(/,/g,''))||0),0));
    // 3D 群像面板：喂入已识别的目标（仅原版场景；低频更新，避免每帧重建）
    if (document.body.classList.contains("on-legacy") && (!renderFrame._crowdAt || time - renderFrame._crowdAt > 700)) {
      renderFrame._crowdAt = time;
      const seen = objects.filter((o) => t >= o.appear);
      if (Panels.crowd && Panels.crowd.update) Panels.crowd.update(seen);
    }
  }

  /* 包装层：单帧内的任何异常都不得中断识别循环。
     过去只要一帧抛错，requestAnimationFrame 就不再续订，整屏识别框与标签会静止/消失。 */
  function render(time) {
    try {
      renderFrame(time);
    } catch (err) {
      if (!render._logged) { render._logged = 1; console.error("[TRACKER] 渲染帧异常（已忽略并继续）:", err); }
    }
  }

  video.addEventListener("loadedmetadata", () => {
    lastMainSize = "";
    if (!objArchiveOpen && !acArchiveOpen && window.RenderLifecycle.stageVisible()) video.play().catch(() => { playBtn.textContent = "▶"; });
  });

  window.addEventListener("resize", () => {
    lastMainSize = "";
  });

  /* ─────────────────────────────────────────────────────────────
     场景切换（Street 01–04）
     - street1–4 使用 B 的原始采样，legacy 单独保留 A 的旧片段。
     - 所有对象共用档案入口，已有模型族进入扫描，其余显示来源取证档案。
     ───────────────────────────────────────────────────────────── */
  /* ── 补充静态标注（data/static-extra.json）：独立于主账，不计入 63/115 与「已识别记录」── */
  let staticExtra = null, staticExtraPromise = null;
  function loadStaticExtra() {
    if (!staticExtraPromise) {
      staticExtraPromise = fetch("data/static-extra.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return staticExtraPromise;
  }
  // 用当前帧按归一化 bbox 裁一张图，作为补充观察的临时证据占位
  function openExtraObject(rec, el) {
    const b = rec.bbox || [0, 0, 0.1, 0.1];
    let crop = "";
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        const cv = document.createElement("canvas");
        cv.width = 240; cv.height = 150;
        cv.getContext("2d").drawImage(video, b[0] * vw, b[1] * vh, b[2] * vw, b[3] * vh, 0, 0, 240, 150);
        crop = cv.toDataURL("image/jpeg", 0.72);
      }
    } catch (e) { crop = ""; }
    const obj = {
      objectId: rec.id, canonicalId: rec.id, sourceId: rec.id,
      category: "infrastructure", label: rec.label, labelEn: rec.labelEn || rec.label,
      function: "STATIC FACILITY · MANUAL SUPPLEMENT", conf: 1,
      appear: 0, disappear: video.duration || duration || 30,
      keyframes: [{ t: 0, x: b[0], y: b[1], w: b[2], h: b[3] }],
      info: "补充观察：人工补充的静态工业设施，未纳入主账",
      energyKwh: 0, _extra: true, _thumbCrop: crop, thumb: crop
    };
    boxEls.set(rec.id, el);
    openObjectArchive(obj);
  }
  async function buildExtraUI(key) {
    try {
      if (!staticExtra) staticExtra = await loadStaticExtra();
      if (currentScene !== key || !Array.isArray(staticExtra)) return;
      const list = staticExtra.filter((e) => e.scene === key && Array.isArray(e.bbox) && e.bbox.length === 4);
      list.forEach((rec, i) => {
        const b = rec.bbox;
        const box = document.createElement("div");
        box.className = "track-box static extra" + (b[1] < 0.05 ? " tag-in" : "") + (b[0] + b[2] > 0.94 ? " tag-r" : "");
        box.dataset.id = rec.id;
        box.dataset.seq = String(i + 1);
        box.style.display = "block";
        box.style.left = (b[0] * 100).toFixed(3) + "%";
        box.style.top = (b[1] * 100).toFixed(3) + "%";
        box.style.width = (b[2] * 100).toFixed(3) + "%";
        box.style.height = (b[3] * 100).toFixed(3) + "%";
        box.style.opacity = "0.55";
        box.innerHTML = '<div class="box-tag"><span class="tid">#' + (i + 1) + "</span></div>";
        box.addEventListener("click", (ev) => { ev.stopPropagation(); openExtraObject(rec, box); });
        box.addEventListener("mouseenter", () => { window.Census.emit('hover', { canonicalId: rec.id, active: true }); });
        box.addEventListener("mouseleave", () => { window.Census.emit('hover', { canonicalId: rec.id, active: false }); });
        layer.appendChild(box);
        boxEls.set(rec.id, box);
      });
      console.info("[STATIC-EXTRA] loaded", JSON.stringify({ scene: key, added: list.length }));
    } catch (e) { console.warn("[STATIC-EXTRA] 补充标注不可用", e); }
  }

  async function loadScene(key) {
    const scene = SCENES[key];
    if (!scene) return;
    if (currentScene === key) return scenePromise;
    if(acPending){acPending=false;acApi=null;acCloseBound=false;acFrame.removeAttribute('src');}
    currentScene = key;
    const token = ++loadToken;

    // 切换场景时若档案 / 空调模块仍打开，先收起，避免残留在新场景之上
    if (objArchiveOpen) closeObjectArchive();
    if (acArchiveOpen) closeAcArchive();

    // 导航高亮
    if (sceneNav) {
      sceneNav.querySelectorAll(".scene").forEach((b) => {
        b.classList.toggle("active", b.dataset.scene === key);
      });
    }

    // 切换视频源
    if (video.getAttribute("src") !== scene.video) {
      video.src = scene.video;
      video.load();
    }

    // Legacy lower panels stay attached to their original take; archives work across scenes.
    document.body.classList.toggle("on-legacy", key === "legacy");

    // 更新 HUD 摄像机 / 区域 / 帧率
    if (camLabel) camLabel.textContent = scene.cam;
    if (zoneLabel) zoneLabel.textContent = scene.zone;
    if (hudFps) hudFps.textContent = "TRACKING @ " + scene.fps + " FPS";

    scenePromise = window.Census.scene(key)
      .then(async (data) => {
        if (token !== loadToken) return; // 已被更新的切换覆盖，丢弃旧结果
        objects = Array.isArray(data) ? data : (data.objects || []);
        discoveredIds=new Set();
        duration = (data && data.duration) || (video.duration || 30);
        maxEnergy = objects.reduce((m, o) => Math.max(m, o.energyKwh || 0), 1);

        // 识别框 / 清单 / 标签必须先于任何异步依赖生成：
        // 档案文案层只是文字补充，绝不能阻塞「实时识别」这一主功能
        buildSceneUI();
        // 5.4.2：static-extra 补充标注（7 条）已废弃 —— 不再加载、不再画框，数据文件保留
        // buildExtraUI(key);
        // 离线检测：四段街道全部读烘焙 JSON（street3 优先 hi）；legacy 仍走手写标注
        if (DET_FILES[key]) {
          detData = await loadDetData(key);
          if (token !== loadToken) return;
          attachDetData();
        } else {
          detData = null;
          clearDetBoxes();
        }
        window.Census.emit("scenechange",{sceneId:key,scene:SCENES[key],objects});
        window.RenderLifecycle.changed();

        // 档案文案层（张娜娜 10/26）：records.json 可编辑文字，与识别坐标分离
        if (key === "legacy" && window.ArchiveCatalog && typeof window.ArchiveCatalog.load === "function") {
          try { await window.ArchiveCatalog.load(objects); }
          catch (e) { console.warn("[ARCHIVE] records 不可用，沿用目标原始标注", e); }
        }
        if (token !== loadToken) return;

        // 预热取证缩略图：场景载入即把图片拉进浏览器缓存，悬停/选中时即时显示，
        // 避免播放中现场请求导致卡顿或短暂加载不出来
        // Card images already own their requests; do not preload them a second time.

        if (key === "legacy") {
          if (Panels.library && Panels.library.build) Panels.library.build(objects);
          showToast("已载入 " + objects.length + " 条观察记录 · 点击目标调档");
        } else {
          if (Panels.library && Panels.library.build) Panels.library.build([]);
          showToast("已载入 " + scene.cam + " · " + objects.length + " 条观察记录");
        }
      })
      .catch((err) => {
        console.error("[loadScene] 加载失败:", err);
        showToast("场景加载失败：" + scene.tracks);
      });
    return scenePromise;
  }

  /* 档案库卡片点击：复用闭包中的 objects（始终指向当前场景） */
  const libTrackEl = document.getElementById("libTrack");
  if (libTrackEl) {
    libTrackEl.addEventListener("click", (e) => {
      const card = e.target.closest(".lib-card");
      if (!card) return;
      const obj = objects.find((o) => o.objectId === card.dataset.id);
      if (!obj) return;
      if (obj.isAc) { openAcArchive(); return; }   // 空调：走 v7 专用模块
      const maxT = video.duration || duration;
      video.currentTime = Math.min(maxT, obj.appear + 0.1);
      selectObject(obj.objectId);
    });
  }

  /* 场景导航点击 */
  if (sceneNav) {
    sceneNav.addEventListener("click", (e) => {
      const btn = e.target.closest(".scene");
      if (!btn) return;
      const key = btn.dataset.scene;
      if (key === currentScene) return;
      loadScene(key);
    });
  }

  /* 供右栏「目标蛛网」的监控卡片使用：切换场景 / 读取当前场景 */
  window.__switchScene = function (key) { return loadScene(key); };
  window.__openCanonical = async function(id,options={}){const record=window.Census.get(id);if(!record)return;await loadScene(record.sceneId);await ensureVideoReady();const saved=options.returnSnapshot;video.currentTime=Math.min(saved?.time??record.appear+.05,video.duration-.01);selectObject(record.sourceId,undefined,saved);if(saved&&sceneState)sceneState={...sceneState,...saved};};
  window.__activeScene = function () { return currentScene; };
  function ensureVideoReady(){if(video.readyState>=1)return Promise.resolve();return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{cleanup();reject(Error('Video metadata timeout'));},10000);const cleanup=()=>{clearTimeout(timeout);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail)};const done=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(Error('Video failed'))};video.addEventListener('loadedmetadata',done,{once:true});video.addEventListener('error',fail,{once:true});});}
  window.Monitor={
    snapshot(){const saved=sceneState;return {sceneId:saved?.sceneId||currentScene,time:saved?.time??video.currentTime,paused:saved?.paused??video.paused,selectedObjectId:saved?.selectedObjectId||(selectedId?objects.find(o=>o.objectId===selectedId)?.canonicalId:null)}} ,
    closeArchive(options={}){closeObjectArchive(options);if(acArchiveOpen)closeAcArchive();},
    boxes(){const l=document.getElementById("trackLayer");const lr=l.getBoundingClientRect();return objects.filter(o=>{const el=boxEls.get(o.objectId);return el&&el.style.display!=="none";}).map(o=>{const el=boxEls.get(o.objectId);const r=el.getBoundingClientRect();return {id:o.objectId,label:o.labelEn,time:[o.appear,o.disappear],density:o._density??null,present:o._present!==false,fit:o._fit?{x:+o._fit.x.toFixed(4),y:+o._fit.y.toFixed(4),w:+o._fit.w.toFixed(4),h:+o._fit.h.toFixed(4)}:null,rect:[+(r.left-lr.left).toFixed(1),+(r.top-lr.top).toFixed(1),+r.width.toFixed(1),+r.height.toFixed(1)],cls:el.className};});},
    tracking(){return trackingEl?trackingEl.dataset.canonicalId||trackingEl.dataset.id:null;},
    async restore(snapshot){if(!snapshot)return;await loadScene(snapshot.sceneId);await ensureVideoReady();video.pause();video.currentTime=Math.max(0,Math.min(snapshot.time,video.duration-.01));selectedId=objects.find(o=>o.canonicalId===snapshot.selectedObjectId)?.objectId||null;focusId=selectedId;boxEls.forEach((el,id)=>el.classList.toggle('selected',id===selectedId));listEls.forEach((el,id)=>el.classList.toggle('selected',id===selectedId));window.Census.setState({view:'monitor',camera:currentScene,cameraId:currentScene==='legacy'?null:'CAM0'+currentScene.slice(-1),currentTime:video.currentTime,paused:snapshot.paused,selectedObjectId:snapshot.selectedObjectId});window.RenderLifecycle.changed();if(!snapshot.paused)video.play().catch(()=>{});}
  };
  for(const event of ['play','pause','seeked'])video.addEventListener(event,()=>{if(window.Census.state.view==='monitor')window.Census.setState({currentTime:video.currentTime,paused:video.paused},false)});

  window.RenderLifecycle.loop("tracking", render, window.RenderLifecycle.stageVisible);

  /* Default capture: B STREET 02. The scene picker appears after ENTER. */
  loadScene("street2");

  /* 兜底自检：若 4s 后画面上仍没有任何识别框（数据晚到 / 首帧异常），
     自动重跑一次场景载入，保证「实时识别」这一主功能不会静默失效 */
  setTimeout(function () {
    if (document.querySelectorAll(".track-box").length) return;
    console.warn("[TRACKER] 识别层未生成，自动重试载入场景");
    currentScene = null;
    loadScene("street2");
  }, 4000);
})();
