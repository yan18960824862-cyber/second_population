/* ═══════════════════════════════════════════════════
   TRACKER.JS — 识别模块（多场景）
   职责：加载场景坐标数据 → 按视频时间轴插值
   渲染识别框 → 跟随 / 悬停高亮 / 点击返回统一 objectId
   ═══════════════════════════════════════════════════ */
"use strict";

/* ── 场景登记表：Street 01-04（01 为夜间主路车流，02-04 为科韵路段补充素材） ── */
const SCENES = {
  street1: {
    video: "street_01.mp4",
    tracks: "tracks_street01.json",
    cam: "CAM 01 / STREET 01",
    zone: "ZONE A · 科韵路站 K0+780 交叉口",
    fps: 25,
  },
  street2: {
    video: "street_02.mp4",
    tracks: "tracks_street02.json",
    cam: "CAM 02 / STREET 02",
    zone: "ZONE B · 科韵路 K0+000 夜间主路",
    fps: 25,
  },
  street3: {
    video: "street_03.mp4",
    tracks: "tracks_street03.json",
    cam: "CAM 03 / STREET 03",
    zone: "ZONE C · 科韵路南段慢行道",
    fps: 25,
  },
  street4: {
    video: "street_04.mp4",
    tracks: "tracks_street04.json",
    cam: "CAM 04 / STREET 04",
    zone: "ZONE D · 科韵路辅道停靠带",
    fps: 25,
  },
};

(async function () {
  const video      = document.getElementById("cam");
  const layer      = document.getElementById("trackLayer");
  const viewport   = document.getElementById("viewport");
  const layout     = document.querySelector(".layout");
  const dossierBody = document.getElementById("dossierBody");
  const dossierClose = document.getElementById("dossierClose");
  const idToast    = document.getElementById("idToast");
  const playBtn    = document.getElementById("playBtn");
  const timeline   = document.getElementById("timeline");
  const timelineFill = document.getElementById("timelineFill");
  const timecode   = document.getElementById("timecode");
  const recTime    = document.getElementById("recTime");
  const hudClock   = document.getElementById("hudClock");
  const hudFps     = document.getElementById("hudFps");
  const camLabel   = document.getElementById("camLabel");
  const zoneLabel  = document.getElementById("zoneLabel");
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
  const tpScan      = document.getElementById("tpScan");
  const sceneNav    = document.getElementById("sceneNav");

  /* ── 运行态 ── */
  let objects = [];
  let duration = 30;
  let currentScene = null;
  let loadToken = 0;
  let selectedId = null;
  let focusId = null;
  let manualFocus = false;
  let toastTimer = null;
  let frame = 0;
  let lastMainSize = "";
  const boxEls = new Map();   // objectId → DOM
  const lockEls = new Map();  // objectId → 锁定进度条 <i>
  const listEls = new Map();  // objectId → li
  let visibleSet = new Set(); // 当前已上屏的目标（用于挂载方向判定）
  const shown = { objects: 0, energy: 0, water: 0, persons: 0 };

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

  /* ── 局部虚框：优先取数据内的 parts，否则按类别推断 ── */
  function partFor(obj) {
    if (obj.parts) return obj.parts;
    const en = obj.labelEn || "";
    if (obj.category === "person")         return { l: 27, t: 2, w: 46, h: 20, name: "HEAD" };
    if (/BARRIER|CONE|BOLLARD/.test(en))   return { l: 6,  t: 10, w: 88, h: 78, name: "CHEVRON" };
    if (/LUMINAIRE|CAMERA POLE/.test(en))  return { l: 26, t: 0,  w: 48, h: 18, name: "LAMP HEAD" };
    if (/METRO|GANTRY|SIGN/.test(en))      return { l: 6,  t: 6,  w: 88, h: 56, name: "PANEL" };
    if (/BANNER/.test(en))                 return { l: 8,  t: 8,  w: 84, h: 60, name: "PRINT" };
    if (/TAXI/.test(en))                   return { l: 34, t: 0,  w: 32, h: 16, name: "ROOF SIGN" };
    if (/BIKE RACK/.test(en))              return { l: 2,  t: 30, w: 96, h: 44, name: "WHEELSET" };
    if (/KERB|FENCE|GUARDRAIL/.test(en))   return { l: 0,  t: 26, w: 100, h: 46, name: "RAIL" };
    if (/TREE|SHRUB|HEDGE/.test(en))       return { l: 30, t: 4,  w: 40, h: 48, name: "CANOPY" };
    if (/ASPHALT|LANE MARK/.test(en))      return null; // 基底面层不画局部框，避免横贯全幅的虚线
    if (/ARROW|LANE MARK|MANHOLE/.test(en))return { l: 18, t: 18, w: 64, h: 56, name: "MARK" };
    if (/BUS|COACH/.test(en))              return { l: 6,  t: 6,  w: 88, h: 32, name: "WINDOW" };
    if (/TRUCK|VAN/.test(en))              return { l: 4,  t: 6,  w: 56, h: 46, name: "CARGO" };
    if (obj.category === "industrial")     return { l: 12, t: 10, w: 76, h: 70, name: "ASSEMBLY" };
    if (obj.category === "infrastructure") return { l: 30, t: 0,  w: 40, h: 26, name: "LAMP" };
    return { l: 14, t: 8, w: 60, h: 44, name: "CABIN" };
  }

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

  /* ── 档案卡挂载方向：贴右边界改左挂，贴左侧栏则右移让位 ── */
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
    // 左侧让位：卡片起点整体推到清单右侧
    const off = toLeft ? 14 : Math.max(14, sideW + 16 - leftIn);
    box.style.setProperty("--card-x", off + "px");
    box.classList.toggle("side-b", topIn < CARD_H);
  }

  /* ── 构建左侧目标清单 ── */
  function buildList() {
    objects.forEach((obj) => {
      const li = document.createElement("li");
      li.className = "target-item";
      li.dataset.id = obj.objectId;
      li.innerHTML =
        '<div class="t-name"><span><span class="t-status"></span>' + obj.label + "</span>" +
        '<span class="t-id">' + obj.objectId + "</span></div>" +
        '<div class="t-time">出现 ' + obj.appear.toFixed(1) + "s — " + obj.disappear.toFixed(1) + "s" +
        " · CONF " + obj.conf.toFixed(2) + "</div>";
      li.addEventListener("click", () => {
        video.currentTime = obj.appear + 0.05;
        video.play().catch(() => {});
        selectObject(obj.objectId);
      });
      targetList.appendChild(li);
      listEls.set(obj.objectId, li);
    });
  }

  /* ── 构建识别框 ── */
  function buildBoxes() {
    objects.forEach((obj) => {
      const box = document.createElement("div");
      box.className = "track-box";
      box.dataset.id = obj.objectId;
      box.style.display = "none";

      const p = partFor(obj);
      const energyPct = Math.min(100, Math.round((obj.energyKwh / 45000) * 100));
      const midT = ((obj.appear + obj.disappear) / 2).toFixed(1);
      const mode = obj.category === "person" ? "RUN"
                 : obj.category === "vehicle" ? "MOVE"
                 : obj.category === "industrial" ? "FIXED" : "STATIC";

      box.innerHTML =
        '<span class="c"></span>' +
        '<div class="box-ruler">' +
          '<span class="r-top">M</span>' +
          '<span class="r-scale"></span>' +
          '<span class="r-word">' + mode + "</span>" +
        "</div>" +
        (p
          ? '<div class="box-part" style="left:' + p.l + "%;top:" + p.t +
            "%;width:" + p.w + "%;height:" + p.h + '%"><span>' + p.name + "</span></div>"
          : "") +
        '<div class="box-tag"><span>' + obj.labelEn + '</span>' +
          '<span class="tid">' + obj.objectId + "</span></div>" +
        '<div class="box-card">' +
          '<div class="card-leader"></div>' +
          '<div class="card-tag">' +
            '<span class="t-label">' + obj.labelEn + "</span>" +
            '<span class="t-conf">' + obj.conf.toFixed(2) + "</span>" +
            '<span class="lock"><i></i></span>' +
          "</div>" +
          '<div class="card-id"><span class="k">ID:</span><span class="v">' + obj.objectId + "</span></div>" +
          '<div class="card-photo">' +
            '<img src="thumbs/' + obj.objectId + '.jpg" alt="" onerror="this.remove()">' +
            '<span class="ph-cap">EVIDENCE · T+' + midT + "s</span>" +
          "</div>" +
          '<div class="card-rows">' +
            '<div class="card-row"><span class="k">TYPE</span><span class="v">' +
              obj.category.toUpperCase() + "</span></div>" +
            '<div class="card-row"><span class="k">FUNC</span><span class="v">' +
              obj.function + "</span></div>" +
            '<div class="card-row"><span class="k">TRACK</span><span class="v">' +
              obj.appear.toFixed(1) + " – " + obj.disappear.toFixed(1) + "s</span></div>" +
          "</div>" +
          '<div class="card-chip"><span>ENERGY</span>' +
            '<b><i style="width:' + energyPct + '%"></i></b>' +
            "<em>" + obj.energyKwh.toLocaleString("en-US") + "</em></div>" +
        "</div>";

      box.addEventListener("click", (e) => {
        e.stopPropagation();
        selectObject(obj.objectId);
      });
      box.addEventListener("mouseenter", () => {
        focusId = obj.objectId;
        manualFocus = true;
        box.classList.add("focused");
        placeCard(box);
      });
      box.addEventListener("mouseleave", () => {
        if (manualFocus && focusId === obj.objectId) manualFocus = false;
      });

      layer.appendChild(box);
      boxEls.set(obj.objectId, box);
      lockEls.set(obj.objectId, box.querySelector(".lock i"));

      // 背景型目标（大结构）视觉后退，避免与主体争夺注意力
      if (/^(FENCE|KERB|HEDGE|SHRUB|TREE|ARROW|ASPHALT|LANE MARK|CROSSWALK|BIKE RACK)$/.test(obj.labelEn)) {
        box.classList.add("bg");
      }
      // 非交通类目标统一降为辅助层（工业物 / 基底），让车流成为画面主体
      if (obj.category !== "vehicle" && obj.category !== "person") {
        box.classList.add("aux", "bg");
      }
      // 交通类目标标签常显，作为画面主体标识
      if (obj.category === "vehicle" || obj.category === "person") {
        box.classList.add("subject");
      }
    });
  }

  /* ── 点击选中 → 返回统一 objectId ── */
  function selectObject(objectId) {
    selectedId = objectId;
    const obj = objects.find((o) => o.objectId === objectId);
    if (!obj) return;

    focusId = objectId;
    manualFocus = true;

    // 验收点：被点击物体返回统一 objectId
    console.log("[TRACKER] objectId →", obj.objectId);
    showToast("objectId → " + obj.objectId);
    renderDossier(obj);
    layout.classList.add("dossier-open");

    boxEls.forEach((el, id) => el.classList.toggle("selected", id === objectId));
    listEls.forEach((el, id) => el.classList.toggle("selected", id === objectId));
  }

  function showToast(text) {
    idToast.textContent = text;
    idToast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => idToast.classList.remove("show"), 1800);
  }

  /* ── 档案面板渲染 ── */
  function renderDossier(obj) {
    const rows = Object.entries(obj.info)
      .map(([k, v]) => '<div class="d-row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>")
      .join("");

    const energyPct = Math.min(100, Math.round((obj.energyKwh / 45000) * 100));

    dossierBody.innerHTML =
      '<div class="d-name">' + obj.label + "</div>" +
      '<div class="d-name-en">' + obj.labelEn + "</div>" +
      '<div class="d-rows">' +
        '<div class="d-row"><span class="k">ID</span><span class="v">' + obj.objectId + "</span></div>" +
        '<div class="d-row"><span class="k">TYPE</span><span class="v">' + obj.category.toUpperCase() + "</span></div>" +
        '<div class="d-row"><span class="k">FUNCTION</span><span class="v">' + obj.function + "</span></div>" +
        '<div class="d-row"><span class="k">MODEL</span><span class="v">' + (obj.model || "UNVERIFIED") + "</span></div>" +
        '<div class="d-row"><span class="k">CONFIDENCE</span><span class="v">' + obj.conf.toFixed(2) + "</span></div>" +
        '<div class="d-row"><span class="k">TRACK</span><span class="v">' +
          obj.appear.toFixed(1) + "s — " + obj.disappear.toFixed(1) + "s</span></div>" +
      "</div>" +
      '<div class="d-section">ENERGY RECORD · 能耗档案</div>' +
      '<div class="d-rows">' + rows + "</div>" +
      '<div class="d-section">RELATIVE INTENSITY</div>' +
      '<div class="d-bar-row"><div class="lbl"><span>制造能耗强度</span><span>' + energyPct + '%</span></div>' +
        '<div class="d-bar"><i data-w="' + energyPct + '"></i></div></div>' +
      '<div class="d-id-return">RETURN VALUE · <b>objectId = "' + obj.objectId + '"</b></div>';

    requestAnimationFrame(() => {
      dossierBody.querySelectorAll(".d-bar i").forEach((bar) => {
        bar.style.width = bar.dataset.w + "%";
      });
    });
  }

  /* ── 场景加载 / 切换 ── */
  async function loadScene(key) {
    const sc = SCENES[key];
    if (!sc || key === currentScene) return;
    const token = ++loadToken;

    // 1. 清场
    video.pause();
    layer.innerHTML = "";
    targetList.innerHTML = "";
    boxEls.clear();
    lockEls.clear();
    listEls.clear();
    visibleSet = new Set();
    selectedId = null;
    focusId = null;
    manualFocus = false;
    lastMainSize = "";
    layout.classList.remove("dossier-open");
    dossierBody.innerHTML = '<p class="dossier-empty">点击画面中的识别框<br>查看该物品的能耗档案</p>';
    shown.objects = shown.energy = shown.water = shown.persons = 0;
    [statObjects, statEnergy, statWater, statPersons].forEach((el) => (el.textContent = "0"));
    tpPct.textContent = "0%";
    tpBar.style.width = "0%";
    tpCount.textContent = "0";
    tpScan.textContent = "0.0 / 0.0 s";

    // 2. 取坐标数据
    let data;
    try {
      const res = await fetch(sc.tracks, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      layer.innerHTML =
        '<p style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'font-family:monospace;font-size:12px;letter-spacing:.15em;color:#A8D3E0;text-align:center">' +
        "坐标数据加载失败<br>请通过本地服务器访问本页面（如 python -m http.server）</p>";
      console.error("[TRACKER] 场景数据加载失败:", sc.tracks, err);
      return;
    }
    if (token !== loadToken) return; // 已被后续切换取代

    // 3. 提交场景
    objects = data.objects;
    duration = data.duration;
    currentScene = key;

    detectTotal.textContent = "/ " + String(objects.length).padStart(2, "0");
    tpTotal.textContent = String(objects.length);

    buildList();
    buildBoxes();

    camLabel.textContent = sc.cam;
    zoneLabel.textContent = sc.zone;
    hudFps.textContent = "TRACKING @ " + sc.fps + " FPS";

    // 4. 换视频源
    video.src = sc.video;
    video.load();
    video.play().catch(() => { playBtn.textContent = "▶"; });

    sceneNav.querySelectorAll(".scene").forEach((b) => {
      b.classList.toggle("active", b.dataset.scene === key);
    });

    console.log("[TRACKER] scene →", key, "| objects:", objects.length);
  }

  sceneNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".scene");
    if (!btn || btn.disabled) return;
    const key = btn.dataset.scene;
    if (key && SCENES[key]) loadScene(key);
  });

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

  dossierClose.addEventListener("click", () => {
    layout.classList.remove("dossier-open");
    selectedId = null;
    boxEls.forEach((el) => el.classList.remove("selected"));
    listEls.forEach((el) => el.classList.remove("selected"));
  });

  viewport.addEventListener("click", () => {
    if (selectedId !== null) dossierClose.click();
  });

  /* ── 数字滚动动画 ── */
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
  function render() {
    const t = video.currentTime;

    if (!objects.length) { requestAnimationFrame(render); return; }

    const mainSize = video.clientWidth + "x" + video.clientHeight;
    if (mainSize !== lastMainSize) {
      applyFit(video, layer, "contain");
      lastMainSize = mainSize;
    }

    const d = video.duration || duration;
    timelineFill.style.width = ((t / d) * 100).toFixed(2) + "%";
    timecode.textContent = "00:" + pad(Math.floor(t)) + " / 00:" + pad(Math.floor(d));
    recTime.textContent = "REC 00:" + fmtTC(t);
    hudClock.textContent = "T+" + t.toFixed(2) + "s";

    let onscreen = 0, energy = 0, water = 0, persons = 0;
    let bestId = null, bestArea = 0, bestPri = -1;

    objects.forEach((obj) => {
      const el = boxEls.get(obj.objectId);
      const li = listEls.get(obj.objectId);
      if (!el || !li) return;
      const visible = t >= obj.appear && t <= obj.disappear;

      if (visible) {
        onscreen++;
        const b = interpolate(obj.keyframes, t);
        el.style.display = "block";
        el.style.left   = (b.x * 100).toFixed(3) + "%";
        el.style.top    = (b.y * 100).toFixed(3) + "%";
        el.style.width  = (b.w * 100).toFixed(3) + "%";
        el.style.height = (b.h * 100).toFixed(3) + "%";
        const area = b.w * b.h;
        // 小目标只留细框不挂标签，密集时不至于互相压盖
        el.classList.toggle("tag-off", area < 0.010);
        // 焦点候选：车辆 / 骑手为画面主体，工业物与基底仅作辅助（同级比面积）
        const pri = obj.category === "person" ? 4
                  : obj.category === "vehicle" ? 3
                  : /^(BARRIER|LUMINAIRE|METRO SIGN|GANTRY SIGN|CAMERA POLE|BANNER|MANHOLE|BIKE RACK|SIGN|GUARDRAIL)$/.test(obj.labelEn) ? 1
                  : obj.category === "industrial" ? 1 : 0;
        if (pri > bestPri || (pri === bestPri && area > bestArea)) {
          bestPri = pri; bestArea = area; bestId = obj.objectId;
        }
        if (!visibleSet.has(obj.objectId)) visibleSet.add(obj.objectId);
        const lock = lockEls.get(obj.objectId);
        if (lock) lock.style.width = Math.min(100, ((t - obj.appear) / 1.2) * 100) + "%";
        li.classList.add("onscreen");
      } else {
        visibleSet.delete(obj.objectId);
        el.style.display = "none";
        el.classList.remove("focused");
        li.classList.remove("onscreen");
      }

      if (t >= obj.appear) {
        energy += obj.energyKwh;
        if (obj.category !== "vehicle" && obj.category !== "person") persons++;
        const w = obj.info["制造用水"];
        if (w) water += parseFloat(w.replace(/[^0-9.]/g, "")) || 0;
      }
    });

    /* 焦点维护：手动悬停优先，否则在焦点消失时改挂画面内最大目标 */
    if (manualFocus && (!focusId || !visibleSet.has(focusId))) manualFocus = false;
    if (!manualFocus && (!focusId || !visibleSet.has(focusId))) {
      focusId = bestId;
      manualFocus = false;
    }
    frame++;
    boxEls.forEach((el, id) => {
      const on = id === focusId && visibleSet.has(id);
      if (el.classList.contains("focused") !== on) {
        el.classList.toggle("focused", on);
        if (on) placeCard(el);
      }
    });
    if (focusId && frame % 10 === 0) {
      const fel = boxEls.get(focusId);
      if (fel && visibleSet.has(focusId)) placeCard(fel);
    }

    detectCount.textContent = pad(onscreen);

    const identified = objects.filter((o) => t >= o.appear).length;
    /* 进度条 = 扫描进度（随播放推进）；计数 = 已进入画面的目标数 */
    const scanPct = Math.round((t / d) * 100);
    tpPct.textContent = scanPct + "%";
    tpBar.style.width = scanPct + "%";
    tpCount.textContent = String(identified).padStart(2, "0");
    tpScan.textContent = t.toFixed(1) + " / " + d.toFixed(1) + " s";

    tickNumber(statObjects, "objects", identified);
    tickNumber(statEnergy, "energy", energy);
    tickNumber(statWater, "water", water);
    tickNumber(statPersons, "persons", persons);

    requestAnimationFrame(render);
  }

  video.addEventListener("loadedmetadata", () => {
    lastMainSize = "";
    video.play().catch(() => { playBtn.textContent = "▶"; });
  });

  window.addEventListener("resize", () => {
    lastMainSize = "";
    visibleSet.clear();
  });

  /* ── 启动：URL hash 优先，默认 street1 ── */
  const initial = (location.hash.replace("#", "") || "street1");
  await loadScene(SCENES[initial] ? initial : "street1");
  requestAnimationFrame(render);
})();
