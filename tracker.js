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
  let lastT = 0;   // 帧间时间戳，用于缓动 dt

  /* ── 状态 ── */
  let selectedId = null;
  let toastTimer = null;
  const boxEls = new Map();   // objectId → DOM
  const lockEls = new Map();  // objectId → 锁定进度条 <i>
  const velEls = new Map();   // objectId → 速度矢量 <span>
  const confEls = new Map();  // objectId → 置信度 <span>
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
      '<span class="vel" aria-hidden="true"></span>' +
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
    velEls.set(obj.objectId, box.querySelector(".vel"));
    confEls.set(obj.objectId, box.querySelector(".conf"));
  });

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
  function selectObject(objectId, idx) {
    const obj = objects.find((o) => o.objectId === objectId);
    if (!obj) return;

    if (idx != null) currentOrderIndex = idx;

    // 空调目标：打开全屏 v7 专用档案模块
    if (obj.isAc) { openAcArchive(); return; }

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

  function renderIdentityTable(obj) {
    const catLabel = (obj.category || "").toUpperCase();
    const energyType = obj.info["能源类型"] || (obj.category === "person" ? "HUMAN POWER" : "ELECTRICITY");
    const rows = [
      ["ID", obj.objectId],
      ["TYPE", catLabel],
      ["FUNCTION", obj.function],
      ["能源类型", energyType],
      ["CONFIDENCE", obj.conf.toFixed(2)],
      ["TRACK", obj.appear.toFixed(1) + "s — " + obj.disappear.toFixed(1) + "s"],
    ];
    const buckets = { ident: [], oper: [], energy: [] };
    Object.entries(obj.info).forEach(([k, v]) => { (buckets[GROUP_OF[k] || "energy"]).push([k, v]); });

    let html = "";
    for (const [k, v] of rows) {
      html += '<div class="id-row"><dt>' + k + "</dt><dd>" + v + "</dd></div>";
    }
    for (const g of ["ident", "oper", "energy"]) {
      if (!buckets[g].length) continue;
      html += '<div class="id-group">' + GROUP_TITLE[g] + "</div>";
      for (const [k, v] of buckets[g]) {
        html += '<div class="id-row"><dt>' + k + "</dt><dd>" + v + "</dd></div>";
      }
    }
    const pct = Math.max(2, Math.round((obj.energyKwh / maxEnergy) * 100));
    html +=
      '<div class="id-group">RELATIVE INTENSITY \u00b7 \u76f8\u5bf9\u80fd\u8017\u5f3a\u5ea6</div>' +
      '<div class="id-bar-row"><div class="lbl"><span>\u5236\u9020\u80fd\u8017\u5f3a\u5ea6</span><span>' + pct + '%</span></div>' +
      '<div class="id-bar"><i style="--w:' + pct + '%"></i></div></div>' +
      '<div class="id-return">RETURN VALUE \u00b7 <b>objectId = "' + obj.objectId + '"</b></div>';
    return html;
  }


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
     旧实现：acApi 未就绪时直接 return，且依赖 load / sp-ready 事件；
     这两类事件若早于本脚本注册监听器（脚本执行竞态）就会丢失，导致点击永远打不开。
     新实现：点击即显示 iframe；用轮询直查 contentWindow.SecondPopulationArchive，
     命中后立即 open，彻底规避事件竞态。 */
  let acPendingOpen = false;   // 已点击、正等待模块就绪
  let acPollTimer = null;

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

  // 命中 API 且处于待打开态 → 直接进入档案；返回是否成功
  function attemptAcOpen() {
    if (!ensureAcApi()) return false;
    if (acPendingOpen) {
      acPendingOpen = false;
      try { acApi.open("SP-0004"); }   // 直接进入旋转加载 → 档案，跳过模块演示空间
      catch (err) { console.error("[AC] open 失败:", err); }
    }
    return true;
  }

  acFrame.addEventListener("load", ensureAcApi);
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "sp-ready") ensureAcApi();
  });

  function openAcArchive() {
    acArchiveOpen = true;
    acPendingOpen = true;
    acFrame.hidden = false;          // 先可见：①画布才能取得正确尺寸 ②用户至少看到全屏档案空间
    acFrameClose.hidden = false;
    video.pause();
    document.body.style.overflow = "hidden";

    // 模块已就绪 → 立即打开
    if (attemptAcOpen()) return;

    // 否则轮询等待（最多 ~10s），直查 contentWindow，不依赖可能丢失的事件
    showToast("空调档案模块载入中…");
    if (acPollTimer) clearInterval(acPollTimer);
    let tries = 0;
    acPollTimer = setInterval(() => {
      tries++;
      if (attemptAcOpen() || tries > 100) {
        clearInterval(acPollTimer);
        acPollTimer = null;
        if (tries > 100 && !acApi) showToast("空调档案加载超时，请重试");
      }
    }, 100);
  }

  function closeAcArchive() {
    if (!acArchiveOpen) return;
    if (acPollTimer) { clearInterval(acPollTimer); acPollTimer = null; }
    acArchiveOpen = false;
    acPendingOpen = false;
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
  const oaCarbonUnit    = document.getElementById("oaCarbonUnit");
  const oaCarbonNote    = document.getElementById("oaCarbonNote");
  const oaRefCard       = document.getElementById("oaRefCard");
  const oaResourceUnit  = document.getElementById("oaResourceUnit");
  const oaFooterNote    = document.getElementById("oaFooterNote");
  const oaViewLabel     = document.getElementById("oaViewLabel");
  const oaSolidCanvas   = document.getElementById("oaSolidCanvas");
  const oaWireCanvas    = document.getElementById("oaWireCanvas");
  const oaProfileCanvas = document.getElementById("oaProfileCanvas");
  const oaCrosses       = document.getElementById("oaCrosses");

  let objArchiveOpen = false;
  let oaScanPlayer = null;    // 扫描阶段播放器（线网）
  let oaSolidPlayer = null;   // 档案阶段播放器（实体）
  let oaPhase = "scan";         // scan | dossier
  let oaCurrent = null;         // 当前目标对象
  let oaRevealTimer = null;
  let oaScanRaf = null;

  if (oaCrosses) oaCrosses.innerHTML = "<span></span>".repeat(20);

  /* 阶段二：档案内容填充 */
  /* ── 参考数据卡 ──
     数据口径对齐档案参考图（空调室外机 / 汽车两张卡）：
     指标行 + 估算说明 + 排放因子 + 「数据性质 · 非现场实测 ｜ 来源」页脚。
     电力因子 0.5306 kg CO₂/kWh 为 2023 年全国平均值（生态环境部）。 */
  function refCardFor(obj) {
    const energy = obj.info["能源类型"] || "";
    const annual = obj.info["年运营碳排放"] || "—";
    if (obj.isAc) {
      return {
        rows: [
          ["能效等级", "1 级"],
          ["APF", "4.75"],
          ["碳排放", "约 3.61 kg CO₂/天"],
        ],
        note: "按 850 W 每日运行 8 小时估算，仅计用电间接排放；排放因子采用 2023 年全国平均值 0.5306 kg CO₂/kWh。",
        foot: ["参考数据 · 非现场实测", "来源：小米官方参数页"],
        carbon: { value: "3.61", unit: "kg CO₂ / 天" },
      };
    }
    if (obj.category === "vehicle" && obj.function === "PRIVATE TRANSPORT") {
      return {
        rows: [
          ["能耗标识参考", "GB 22757.2—2023"],
          ["百公里电耗", "15.0 kWh/100 km"],
          ["用电间接排放", "约 7.96 kg CO₂/100 km"],
        ],
        note: "纯电动情景示例，按 15.0 kWh × 0.5306 估算；电力因子为 2023 年全国平均值。目标本体年运营碳排放（" + annual + "）为模拟估算。",
        foot: ["纯电动情景示例 · 非现场实测", "来源：生态环境部"],
        carbon: { value: "7.96", unit: "kg CO₂ / 100 km · 纯电动情景" },
      };
    }
    if (obj.category === "infrastructure") {
      return {
        rows: [
          ["年运营耗电", obj.info["年运营耗电"] || "1,100 kWh"],
          ["电力因子", "0.5306 kg CO₂/kWh"],
          ["年运营碳排放", "约 0.58 t CO₂"],
        ],
        note: "按年运营耗电 1,100 kWh × 0.5306 估算；电力因子为 2023 年全国平均值，仅计用电间接排放。",
        foot: ["参考数据 · 非现场实测", "来源：生态环境部"],
        carbon: { value: "0.58", unit: "t CO₂e / 年" },
      };
    }
    if (energy.indexOf("纯电动") >= 0) {
      return {
        rows: [
          ["电力因子", "0.5306 kg CO₂/kWh"],
          ["因子口径", "2023 年全国平均值"],
          ["年运营碳排放", annual],
        ],
        note: "按年运营耗电 × 电力因子估算，仅计用电间接排放；目标本体数据为模拟估算。",
        foot: ["参考数据 · 非现场实测", "来源：生态环境部"],
        carbon: null,   // 沿用既有年碳排数值
      };
    }
    if (energy.indexOf("柴油") >= 0) {
      return {
        rows: [["年运营碳排放", annual]],
        note: "柴油情景 · 模拟估算，未套用用电排放因子；非现场实测。",
        foot: ["模拟估算数据 · 非现场实测", "来源：模拟估算模型"],
        carbon: null,
      };
    }
    // 人员等其他目标：仅给既有模拟值 + 口径说明
    return {
      rows: [["年运营碳排放", annual]],
      note: "人力 / 电力混合出行情景 · 模拟估算，非现场实测。",
      foot: ["模拟估算数据 · 非现场实测", "来源：模拟估算模型"],
      carbon: null,
    };
  }

  function renderRefCard(profile) {
    if (!oaRefCard) return;
    let html = "<dl>";
    for (const [k, v] of profile.rows) {
      html += '<div class="ref-row"><dt>' + k + "</dt><dd>" + v + "</dd></div>";
    }
    html += "</dl>" + '<p class="ref-note">' + profile.note + "</p>" +
      '<div class="ref-foot"><b>' + profile.foot[0] + "</b><span>" + profile.foot[1] + "</span></div>";
    oaRefCard.innerHTML = html;
  }

  function populateObjectArchive(obj) {
    oaSubject.textContent = "SUBJECT " + obj.objectId;
    oaName.textContent = obj.label;
    oaNameEn.textContent = obj.labelEn + "  ·  " + (obj.category || "").toUpperCase();
    oaIdentity.innerHTML = renderIdentityTable(obj);
    oaResourceUnit.textContent = obj.labelEn;
    oaViewLabel.textContent = "VIEW 01/01";

    // 碳记录 + 参考数据卡（口径见 refCardFor）
    const profile = refCardFor(obj);
    renderRefCard(profile);
    const carbon = obj.info["年运营碳排放"];
    if (profile.carbon) {
      oaCarbonValue.textContent = profile.carbon.value;
      oaCarbonUnit.textContent = profile.carbon.unit;
      oaCarbonNote.innerHTML = profile.note.replace("；", "；<br>");
    } else if (carbon) {
      oaCarbonValue.textContent = carbon.replace(/[^0-9.]/g, "");
      oaCarbonUnit.textContent = "t CO₂e / 年 · 模拟估算";
      oaCarbonNote.innerHTML = "ANNUAL OPERATIONAL CO₂e<br>FROM TARGET RECORD / SIMULATED";
    } else {
      oaCarbonValue.textContent = "DATA PENDING";
      oaCarbonUnit.textContent = "kg CO₂e";
      oaCarbonNote.innerHTML = "MODEL, ENERGY USE AND GRID<br>FACTOR REQUIRED.";
    }
    oaFooterNote.textContent = obj.isAc
      ? "SP-0004 走专用空调档案模块（v7 handoff）。"
      : "MODEL-SPECIFIC DATA NOT YET VERIFIED.";
  }

  /* 缩略图：线框结构 + 侧影视图（一次性静态渲染） */
  function renderArchiveInsets(obj) {
    if (!window.ModelEngine) return;
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
    oaScan.hidden = false;
    oaDossier.hidden = true;
    oaDossier.classList.remove("is-open", "is-revealing");
    oaScanId.textContent = obj.objectId;
    oaFootnoteId.textContent = obj.objectId;
    oaScanStatus.textContent = "INITIALIZING";
    oaProgressFill.style.width = "0%";
    oaProgressNum.textContent = "00%";
    oaProgressBar.setAttribute("aria-valuenow", "0");

    const duration = 2200;
    const start = performance.now();
    const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    const step = () => {
      const el = performance.now() - start;
      const p = Math.max(0, Math.min(1, el / duration));
      const prog = Math.round(Math.max(0, Math.min(1, (p - 0.12) / 0.76)) * 100);
      oaProgressFill.style.width = prog + "%";
      oaProgressNum.textContent = String(prog).padStart(2, "0") + "%";
      oaProgressBar.setAttribute("aria-valuenow", String(prog));
      oaScanStatus.textContent =
        p < 0.16 ? "INITIALIZING" :
        p < 0.60 ? "STRUCTURE / ACQUIRING" :
        p < 0.92 ? "ROTATION / ANALYZING" : "RECORD / READY";
      // 扫描框开合
      const fx = 0.30 + 0.70 * Math.max(0, Math.min(1, (p - 0.03) / 0.09));
      const fy = 0.02 + 0.98 * Math.max(0, Math.min(1, (p - 0.06) / 0.09));
      oaScanShell.style.setProperty("--frame-x", fx.toFixed(3));
      oaScanShell.style.setProperty("--frame-y", fy.toFixed(3));
      oaScanShell.style.setProperty("--content-opacity", Math.max(0, Math.min(1, (p - 0.14) / 0.05)).toFixed(3));
      if (p < 1) { oaScanRaf = requestAnimationFrame(step); }
    };
    oaScanRaf = requestAnimationFrame(step);

    // 模型动画：线网扫描 → 实体
    if (window.ModelEngine) {
      if (!oaScanPlayer) oaScanPlayer = new window.ModelEngine.Player(document.getElementById("oaModelCanvas"));
      oaScanPlayer.attach(document.getElementById("oaModelCanvas"));
      oaScanPlayer.play(obj.category, window.ModelEngine.detectSubtype(obj.category, obj.labelEn), {
        duration: duration,
        onDone: function () { showDossier(obj); }
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
    oaDossier.classList.add("is-revealing");
    populateObjectArchive(obj);
    renderArchiveInsets(obj);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        oaDossier.classList.add("is-open");
        oaDossier.classList.remove("is-revealing");
      });
    });
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
    document.body.style.overflow = "hidden";
    video.pause();
    runScan(obj);
  }

  function closeObjectArchive() {
    if (!objArchiveOpen) return;
    objArchiveOpen = false;
    objArchive.hidden = true;
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
  let lastDraw = 0;
  function render(time) {
    // 帧间 dt（用于缓动）
    if (!lastT) lastT = time;
    const dt = Math.min(0.05, (time - lastT) / 1000);
    lastT = time;
    // 限到 ~30fps：识别框位移极慢，不必每帧全量重写 DOM（省主线程，保证点击响应）
    if (time - lastDraw < 33) { requestAnimationFrame(render); return; }
    lastDraw = time;

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

    // 识别框跟随（presence 缓动：出现/消失不再硬切）
    let onscreen = 0, energy = 0, water = 0, persons = 0;
    const lockedNow = [];
    objects.forEach((obj) => {
      const el = boxEls.get(obj.objectId);
      const li = listEls.get(obj.objectId);
      const visible = t >= obj.appear && t <= obj.disappear;

      // presence 0→1（入场）/ 1→0（离场）缓动
      const target = visible ? 1 : 0;
      if (obj._pres == null) obj._pres = 0;
      obj._pres += (target - obj._pres) * Math.min(1, dt * 9);
      if (!visible && obj._pres < 0.012) {
        if (el.style.display !== "none") el.style.display = "none";
        li.classList.remove("onscreen");
        obj._logged = false;
        return; // 完全离场，跳过后续更新
      }
      if (el.style.display === "none") el.style.display = "block";

      if (visible) {
        onscreen++;
        const b = interpolate(obj.keyframes, t);
        // 速度矢量（相邻帧位移）
        const dx = b.x - (obj._px == null ? b.x : obj._px);
        const dy = b.y - (obj._py == null ? b.y : obj._py);
        obj._px = b.x; obj._py = b.y;
        el.style.left   = (b.x * 100).toFixed(3) + "%";
        el.style.top    = (b.y * 100).toFixed(3) + "%";
        el.style.width  = (b.w * 100).toFixed(3) + "%";
        el.style.height = (b.h * 100).toFixed(3) + "%";
        // 速度标记（沿运动方向的小箭头）
        const vel = velEls.get(obj.objectId);
        if (vel) {
          const mag = Math.min(1, Math.hypot(dx, dy) * 42);
          if (mag > 0.05) {
            const ang = Math.atan2(dy, dx);
            vel.style.opacity = (0.35 + 0.65 * mag).toFixed(2);
            vel.style.transform = "rotate(" + ang.toFixed(3) + "rad) scale(" + (0.5 + 0.5 * mag).toFixed(3) + ")";
          } else {
            vel.style.opacity = "0";
          }
        }
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
      }

      // 置信度实时抖动（模拟推断不确定度，使识别更"活"）
      if (visible && time - (obj._lastConf || 0) > 380) {
        obj._lastConf = time;
        const cEl = confEls.get(obj.objectId);
        if (cEl) {
          const j = obj.conf + Math.sin(time * 0.013 + obj.appear) * 0.007 + (Math.random() - 0.5) * 0.012;
          cEl.textContent = Math.max(0.2, Math.min(0.99, j)).toFixed(2);
        }
      }

      // presence → 透明度 + 轻微缩放（替代硬切）
      el.style.opacity = obj._pres.toFixed(3);
      el.style.transform = "scale(" + (0.90 + 0.10 * obj._pres).toFixed(3) + ")";

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
