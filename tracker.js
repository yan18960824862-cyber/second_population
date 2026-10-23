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

  /* 面板（panels.js）：数据可视化 / 3D 群像 / 档案库 / 实时代码 */
  const Panels = window.Panels || {
    dataViz: { update() {} }, crowd: { update() {} },
    library: { build() {}, markActive() {} }, code: { update() {} }
  };

  /* ── 加载坐标数据 ── */
  let data;
  try {
    const res = await fetch("tracks.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    layer.innerHTML =
      '<p style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'font-family:monospace;font-size:12px;letter-spacing:.15em;color:#A8D3E0;text-align:center">' +
      "坐标数据加载失败<br>请通过本地服务器访问本页面（如 python -m http.server）</p>";
    console.error("[TRACKER] tracks.json 加载失败:", err);
    return;
  }

  const objects = data.objects;
  const duration = data.duration;

  // 真实能耗最大值：用于相对强度条（不再写死 45000）
  const maxEnergy = Math.max.apply(null, objects.map((o) => o.energyKwh));

  // 档案导航顺序：按首次出现时刻排序，便于「上一个 / 下一个」
  const order = objects.slice().sort((a, b) => a.appear - b.appear);
  const idToOrderIndex = new Map(order.map((o, i) => [o.objectId, i]));
  let currentOrderIndex = 0;

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

  /* ── 状态 ── */
  let selectedId = null;
  let toastTimer = null;
  const boxEls = new Map();   // objectId → DOM
  const lockEls = new Map();  // objectId → 锁定进度条 <i>
  const listEls = new Map();  // objectId → li

  // 空调档案模块（v7 handoff）：同源 iframe 集成状态
  const acFrame = document.getElementById("acArchive");
  const acFrameClose = document.getElementById("acArchiveClose");
  let acApi = null;
  let acArchiveOpen = false;
  let acCloseBound = false;

  /* ── 构建左侧目标清单 ── */
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
      video.play();
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
    box.style.display = "none";
    const acMark = obj.isAc ? '<span class="ac-mark">AC</span>' : "";
    const acExtra = obj.isAc
      ? '<span class="ac-beacon" aria-hidden="true"></span>' +
        '<div class="ac-hint">点击查看空调档案 ▸</div>'
      : "";
    box.innerHTML =
      '<span class="c"></span>' +
      '<div class="track-tag"><span>' + obj.labelEn + "</span>" +
      '<span class="conf">' + obj.conf.toFixed(2) + "</span>" +
      "<span>" + obj.objectId + "</span>" +
      acMark +
      '<span class="lock"><i></i></span></div>' +
      '<div class="crosshair"></div>' +
      acExtra;
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      selectObject(obj.objectId);
    });
    layer.appendChild(box);
    boxEls.set(obj.objectId, box);
    lockEls.set(obj.objectId, box.querySelector(".lock i"));
  });

  /* ── 关键帧线性插值 ── */
  function interpolate(kfs, t) {
    if (t <= kfs[0].t) return kfs[0];
    const last = kfs[kfs.length - 1];
    if (t >= last.t) return last;
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (t >= a.t && t <= b.t) {
        const p = (t - a.t) / (b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * p,
          y: a.y + (b.y - a.y) * p,
          w: a.w + (b.w - a.w) * p,
          h: a.h + (b.h - a.h) * p,
        };
      }
    }
    return last;
  }

  /* ── 点击选中 → 返回统一 objectId ── */
  function selectObject(objectId, idx) {
    const obj = objects.find((o) => o.objectId === objectId);
    if (!obj) return;

    if (idx != null) currentOrderIndex = idx;

    // 空调目标：打开全屏 v7 专用档案模块
    if (obj.isAc) { if (objArchiveOpen) closeObjectArchive(); openAcArchive(); return; }

    // 其余目标：打开全屏 OBJECT ARCHIVE（扫描 → 档案两段式）
    openObjectArchive(obj);
  }

  // 上一个 / 下一个目标：按顺序跳转并把视频拉到该目标出现时刻
  function goToOrder(delta) {
    const n = order.length;
    const next = ((currentOrderIndex + delta) % n + n) % n;
    const obj = order[next];
    const maxT = video.duration || duration;
    video.currentTime = Math.min(maxT, obj.appear + 0.1);
    video.play().catch(() => {});
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

  acFrame.addEventListener("load", ensureAcApi);
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "sp-ready") ensureAcApi();
  });

  function openAcArchive() {
    const api = ensureAcApi();
    if (!api) { showToast("AC ARCHIVE 模块加载中…"); return; }
    acArchiveOpen = true;
    acFrame.hidden = false;          // 先可见，画布才能取得正确尺寸
    acFrameClose.hidden = false;
    video.pause();
    document.body.style.overflow = "hidden";
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
    if (acApi && typeof acApi.close === "function") {
      try { acApi.close(); } catch (err) {}
    }
    video.play().catch(() => {});
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

  if (oaCrosses) oaCrosses.innerHTML = "<span></span>".repeat(20);

  /* 阶段二：档案内容填充 */
  function populateObjectArchive(obj) {
    const A=window.ArchiveData;
    oaSubject.textContent='SUBJECT '+obj.objectId;
    oaName.textContent=obj.labelEn.toUpperCase();
    oaNameEn.textContent=A.type(obj)+' / SECOND POPULATION';
    oaIdentity.innerHTML=A.identity(obj);
    oaResourceUnit.textContent=A.type(obj);
    document.querySelector('#objArchive .resource-unit svg').innerHTML=A.symbol(obj);
    oaViewLabel.textContent='VIEW 01 / 03';
    oaCarbonValue.textContent='DATA PENDING';
    document.getElementById('oaCarbonExpression').innerHTML=A.expression(obj);
    document.getElementById('oaCarbonUnit').textContent='kg CO₂e / year';
    oaCarbonNote.textContent='VEHICLE ONLY / ENERGY USE, REGION, YEAR AND FACTOR REQUIRED.';
    oaFooterNote.textContent='ILLUSTRATIVE MODEL / VEHICLE DATA NOT YET VERIFIED.';
    document.getElementById('oaInsetOne').textContent=obj.category==='infrastructure'?'STRUCTURE / GEOMETRY':'WHEEL / CONSTRUCTION';
    document.getElementById('oaInsetTwo').textContent=obj.category==='person'?'ENERGY MODULE / FLOW SIMULATION':'THERMAL SYSTEM / SCHEMATIC';
    document.getElementById('oaSourceText').textContent=A.sourceNotes(obj);
  }

  /* 缩略图：线框结构 + 侧影视图（一次性静态渲染） */
  function renderArchiveInsets(obj) {
    if (!window.ModelEngine) return;
    if (window.ArchiveVisuals && obj.category!=="infrastructure") { requestAnimationFrame(()=>{ if(oaCurrent!==obj||!objArchiveOpen)return; window.ArchiveVisuals.detail(oaWireCanvas,obj,"wheel");window.ArchiveVisuals.detail(oaProfileCanvas,obj,"assembly"); }); return; }
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
    if(window.ArchiveMotion)window.ArchiveMotion.stop();
    oaEntry.cancel();
    if(oaScanPlayer)oaScanPlayer.stop();
    if(oaSolidPlayer)oaSolidPlayer.stop();
    if(oaScanRaf)cancelAnimationFrame(oaScanRaf);
    if(oaRevealTimer)clearTimeout(oaRevealTimer);
    oaPhase = "scan";
    oaScan.hidden = false;
    oaDossier.hidden = true;
    oaDossier.classList.remove("is-open", "is-revealing");
    oaScanId.textContent = obj.objectId;
    document.getElementById("oaScanType").textContent=window.ArchiveData.type(obj)+" / 01";
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
    const start = performance.now();
    const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    const step = () => {
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
    oaScanRaf = requestAnimationFrame(step);

    // 模型动画：线网扫描 → 实体
    if (window.ModelEngine) {
      if (!oaScanPlayer) oaScanPlayer = new window.ModelEngine.Player(document.getElementById("oaModelCanvas"));
      oaScanPlayer.attach(document.getElementById("oaModelCanvas"));
      oaScanPlayer.play(obj.category, window.ModelEngine.detectSubtype(obj.category, obj.labelEn), {
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
    oaScan.hidden = true;
    oaDossier.hidden = false;
    oaDossier.scrollTop=0;
    oaDossier.classList.add("is-revealing");
    populateObjectArchive(obj);
    renderArchiveInsets(obj);
    if(window.ArchiveMotion)requestAnimationFrame(()=>{if(objArchiveOpen&&oaCurrent===obj)window.ArchiveMotion.start(oaProfileCanvas,obj);});
    oaEntry.play();
    requestAnimationFrame(function () { if(objArchiveOpen && oaCurrent===obj)oaDossier.classList.add("is-open"); });
    // 实体模型持续渲染（切换到档案阶段的画布）
    if (window.ModelEngine) {
      if (!oaSolidPlayer) oaSolidPlayer = new window.ModelEngine.Player(oaSolidCanvas);
      oaSolidPlayer.attach(oaSolidCanvas);
      oaSolidPlayer.showSolid(obj.category, window.ModelEngine.detectSubtype(obj.category, obj.labelEn));
    }
  }

  function openObjectArchive(obj) {
    selectedId = obj.objectId;
    oaCurrent = obj;
    boxEls.forEach((el, id) => el.classList.toggle("selected", id === obj.objectId));
    listEls.forEach((el, id) => el.classList.toggle("selected", id === obj.objectId));
    if (Panels.library && Panels.library.markActive) Panels.library.markActive(obj.objectId);
    showToast("objectId → " + obj.objectId);

    objArchiveOpen = true;
    objArchive.hidden = false;
    objArchive.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    video.pause();
    runScan(obj);
  }

  function closeObjectArchive() {
    if (!objArchiveOpen) return;
    objArchiveOpen = false;
    if(window.ArchiveMotion)window.ArchiveMotion.stop();
    objArchive.hidden = true;
    objArchive.setAttribute("aria-hidden","true");
    oaEntry.cancel();
    document.body.style.overflow = "";
    if (oaScanPlayer) oaScanPlayer.stop();
    if (oaSolidPlayer) oaSolidPlayer.stop();
    if (oaScanRaf) cancelAnimationFrame(oaScanRaf);
    if (oaRevealTimer) clearTimeout(oaRevealTimer);
    if (Panels.library && Panels.library.markActive) Panels.library.markActive(null);
    video.play().catch(function () {});
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

  /* ── 主渲染循环 ── */
  function render(time) {
    const t = video.currentTime;

    // 框层尺寸对齐（尺寸变化时才重算）
    const mainSize = video.clientWidth + "x" + video.clientHeight;
    if (mainSize !== lastMainSize) {
      applyFit(video, mainLayer, "contain");
      lastMainSize = mainSize;
    }

    // 时间轴与时间码
    const d = video.duration || duration;
    timelineFill.style.width = ((t / d) * 100).toFixed(2) + "%";
    timelineHandle.style.left = ((t / d) * 100).toFixed(2) + "%";
    timecode.textContent = "00:" + pad(Math.floor(t)) + " / 00:" + pad(Math.floor(d));
    recTime.textContent = "REC 00:" + fmtTC(t);
    hudClock.textContent = "T+" + t.toFixed(2) + "s";

    // 识别框跟随
    let onscreen = 0, energy = 0, water = 0, persons = 0;
    const lockedNow = [];
    objects.forEach((obj) => {
      const el = boxEls.get(obj.objectId);
      const li = listEls.get(obj.objectId);
      const visible = t >= obj.appear && t <= obj.disappear;

      if (visible) {
        onscreen++;
        const b = interpolate(obj.keyframes, t);
        el.style.display = "block";
        el.style.left   = (b.x * 100).toFixed(3) + "%";
        el.style.top    = (b.y * 100).toFixed(3) + "%";
        el.style.width  = (b.w * 100).toFixed(3) + "%";
        el.style.height = (b.h * 100).toFixed(3) + "%";
        // 锁定进度条：目标出现后 1.2s 内填满 → 模拟识别锁定过程
        const lock = lockEls.get(obj.objectId);
        const lockPct = Math.min(100, ((t - obj.appear) / 1.2) * 100);
        if (lock) lock.style.width = lockPct + "%";
        li.classList.add("onscreen");
        // 刚刚完成锁定 → 推送到实时代码面板
        if (lockPct >= 100 && !obj._logged) {
          obj._logged = true;
          lockedNow.push(obj);
        }
      } else {
        el.style.display = "none";
        li.classList.remove("onscreen");
        obj._logged = false;
      }

      // 累计统计：已出现过的目标计入普查
      if (t >= obj.appear) {
        energy += obj.energyKwh;
        if (obj.category === "person") persons++;
        const w = obj.info["制造用水"];
        if (w) water += parseFloat(w.replace(/[^0-9.]/g, "")) || 0;
      }
    });

    // 实时代码面板：推送真实锁定事件
    lockedNow.forEach((obj) => {
      if (Panels.code && Panels.code.update) Panels.code.update(obj, t);
    });

    detectCount.textContent = pad(onscreen);

    // 识别跟踪进度：已出现目标数 / 总目标数
    const identified = objects.filter((o) => t >= o.appear).length;
    const pct = Math.round((identified / objects.length) * 100);
    tpPct.textContent = pct + "%";
    tpBar.style.width = pct + "%";
    tpCount.textContent = String(identified).padStart(2, "0");

    tickNumber(statObjects, "objects", identified);
    tickNumber(statEnergy, "energy", energy);
    tickNumber(statWater, "water", water);
    tickNumber(statPersons, "persons", persons);

    // 3D 群像面板：喂入已识别的目标（低频更新，避免每帧重建）
    if (!render._crowdAt || time - render._crowdAt > 700) {
      render._crowdAt = time;
      const seen = objects.filter((o) => t >= o.appear);
      if (Panels.crowd && Panels.crowd.update) Panels.crowd.update(seen);
    }

    requestAnimationFrame(render);
  }

  video.addEventListener("loadedmetadata", () => {
    lastMainSize = "";
    video.play().catch(() => { playBtn.textContent = "▶"; });
  });

  window.addEventListener("resize", () => {
    lastMainSize = "";
  });

  /* ── 档案库：构建 40 张缩略图卡片，点击直达全屏档案 ── */
  if (Panels.library && Panels.library.build) {
    Panels.library.build(objects);
    const track = document.getElementById("libTrack");
    if (track) {
      track.addEventListener("click", (e) => {
        const card = e.target.closest(".lib-card");
        if (!card) return;
        const obj = objects.find((o) => o.objectId === card.dataset.id);
        if (!obj) return;
        // 空调：走 v7 专用模块；其余：通用两段式档案
        if (obj.isAc) { openAcArchive(); return; }
        const maxT = video.duration || duration;
        video.currentTime = Math.min(maxT, obj.appear + 0.1);
        video.play().catch(() => {});
        selectObject(obj.objectId);
      });
    }
  }

  requestAnimationFrame(render);

  /* ── 加载提示：指向空调档案入口，帮助定位 SP-0004 ── */
  setTimeout(() => {
    idToast.textContent = "已锁定 40 目标 · 含空调外机 SP-0004（画面左侧）→ 点击查看档案";
    idToast.classList.add("show");
    setTimeout(() => idToast.classList.remove("show"), 5600);
  }, 1500);
})();
