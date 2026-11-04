/* ═══════════════════════════════════════════════════════════════════════
   objectweb.js — 目标蛛网（ROAD OBJECT MODEL NETWORK）
   视觉规格对齐参考稿 road-scene-model-hover-preview-v2.html：
     · 坐标系：viewBox 0 0 900 820，圆心 (450,410)，六扇形，椭圆半径 374 / 340.34
     · 静态网：assets/web-net.svg（原稿同几何的 241 条手绘抖动路径，作底图避免千级节点）
     · 点位：<g class="map-point" transform="translate(x y)">
              <circle class="point-hit"/><circle class="point-halo"/><circle class="point-core"/>
     · 六类别色：沿用参考稿 category-strip（玫瑰 / 陶土 / 雾青族系）
     · 标题衬线、弱调描边、宽字距小字号，与原稿同一套排版语言
   数据仍是本项目的真实识别结果：随场景切换重建，随播放进度点亮
   接法：tracker.js 在 buildSceneUI 调 build(objects, cb)，渲染循环调 tick(t)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const NS = "http://www.w3.org/2000/svg";

  /* ── 参考稿几何 ── */
  const CX = 450, CY = 410;
  const RX = 374, RY = 340.34;

  /* ── 六类别：名称 / 英文 / 原稿色 / 扇形中心角 / 标签锚点 ── */
  const CATS = [
    { cn: "乘用车辆",   en: "SEDAN · SUV",     color: "#e47b9c", angle: -121, lx: 336, ly: 230.7 },
    { cn: "货运车辆",   en: "BOX TRUCK",       color: "#df9b78", angle: -59,  lx: 564, ly: 230.7 },
    { cn: "公共交通",   en: "BUS · COACH",     color: "#d4a66d", angle: 0,    lx: 678, ly: 410.0 },
    { cn: "道路设施",   en: "STREET FACILITY", color: "#83bcc0", angle: 59,   lx: 564, ly: 589.3 },
    { cn: "电动车骑手", en: "E-BIKE RIDER",    color: "#c08bb4", angle: 121,  lx: 336, ly: 589.3 },
    { cn: "配送骑手",   en: "DELIVERY RIDER",  color: "#c77ca3", angle: 180,  lx: 222, ly: 410.0 }
  ];

  /* ── 四路监控卡片（对应本项目四个场景） ── */
  CATS.forEach((cat,i)=>{cat.color=window.CensusVisualRules.groups[i].color;});
  const CARDS = [
    { key: "street1", idx: "01", cn: "街口 · 科韵路站", en: "ROAD JUNCTION",  cam: "CAM 01", color: "#e47b9c", rot: "-28deg", thumb: "street_census/site/thumbs/ST1-0002.jpg" },
    { key: "street2", idx: "02", cn: "夜间主路 · 车流", en: "NIGHT TRAFFIC",    cam: "CAM 02", color: "#d4a66d", rot: "-9deg",  thumb: "street_census/site/thumbs/ST2-0007.jpg" },
    { key: "street3", idx: "03", cn: "社区 · 慢行道",   en: "RESIDENTIAL",    cam: "CAM 03", color: "#83bcc0", rot: "10deg",  thumb: "street_census/site/thumbs/ST3-0001.jpg" },
    { key: "street4", idx: "04", cn: "辅道 · 停靠带",   en: "SERVICE ROAD",   cam: "CAM 04", color: "#df9b78", rot: "29deg",  thumb: "street_census/site/thumbs/ST4-0005.jpg" }
  ];

  /* ================= 基础工具 ================= */
  function el(id) { return document.getElementById(id); }
  function node(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  /* 稳定哈希：同一目标每次布局一致，不会在重建时跳动 */
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return ((h >>> 0) % 1000) / 1000;
  }
  function conf(o) {
    const v = typeof o.conf === "number" ? o.conf : parseFloat(o.conf);
    return isFinite(v) ? v : 0.8;
  }

  /* ================= DOM 句柄 ================= */
  const mapBox = document.querySelector(".ow-map");
  const dotsG = el("owDots");
  const labelsG = el("owLabels");
  const stripEl = el("owStrip");
  const cardsEl = el("owCards");
  const countEl = el("owCount");
  const spot = el("owSpot");
  const spotName = el("owSpotName");
  const spotId = el("owSpotId");
  const spotCanvas = el("owSpotCanvas");
  const spotImg = el("owSpotImg");
  const spotFoot = el("owSpotFoot");
  const spotWedge = el("owSpotWedge");

  let objects = [];
  let opts = {};
  let dotsById = new Map();
  let lastCount = -1;
  let player = null;

  /* ================= 目标 → 类别 ================= */
  function catOf(obj) {
    return window.CensusVisualRules.groupIndex(obj);
  }

  /* 有对应三维模型的类别走 ModelEngine；工业小件返回 null → 用重制的高清取证帧 */
  function modelOf(obj) {
    const c = obj.category;
    if (c === "vehicle" || c === "person" || c === "infrastructure" || c === "appliance") {
      if (window.ModelEngine && window.ModelEngine.detectSubtype) {
        const st = window.ModelEngine.detectSubtype(c, obj.labelEn);
        if (st) return [c, st];
      }
    }
    return null;
  }

  /* ================= 静态部件：扇区标签 / 类别条 / 监控卡片 ================= */
  function buildLabels() {
    if (!labelsG || labelsG.childNodes.length) return;
    const frag = document.createDocumentFragment();
    CATS.forEach(function (c, i) {
      const g = node("g", { "class": "zone-label", transform: "translate(" + c.lx + " " + c.ly + ")" });
      const id = node("text", { "class": "zone-id", y: -15 });
      id.textContent = String(i + 1).padStart(2, "0");
      const cn = node("text", { "class": "zone-cn", y: 4 });
      cn.textContent = c.cn;
      const en = node("text", { "class": "zone-en", y: 20 });
      en.textContent = c.en;
      g.appendChild(id); g.appendChild(cn); g.appendChild(en);
      frag.appendChild(g);
    });
    labelsG.appendChild(frag);
  }

  function buildStrip() {
    if (!stripEl) return;
    stripEl.innerHTML = CATS.map(function (c) {
      return '<div class="category-item" data-cat="' + c.en + '">' +
        '<i class="category-dot" style="--cat:' + c.color + '"></i>' +
        '<div><b>' + c.cn + '</b><small>' + c.en + '</small></div></div>';
    }).join("");
  }

  function buildCards() {
    if (!cardsEl) return;
    cardsEl.innerHTML = CARDS.map(function (c) {
      return '<button class="camera-card" type="button" data-scene="' + c.key +
        '" style="--cam:' + c.color + ';--rotation:' + c.rot + '">' +
        '<div class="camera-card-head"><strong>' + c.idx + ' · ' + c.cn + '</strong><span>' + c.cam + '</span></div>' +
        '<div class="mini-web"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<img class="camera-thumb" src="' + c.thumb + '" alt="" loading="lazy" />' +
        '<div class="camera-card-foot"><span>' + c.en + '</span><span>OPEN ↗</span></div>' +
        '</button>';
    }).join("");

    cardsEl.querySelectorAll(".camera-card").forEach(function (b) {
      b.addEventListener("click", function () {
        const key = b.getAttribute("data-scene");
        if (window.__switchScene) window.__switchScene(key);
      });
      const img = b.querySelector(".camera-thumb");
      if (img) img.addEventListener("error", function () { img.style.display = "none"; });
    });
  }

  function syncCards() {
    if (!cardsEl || !window.__activeScene) return;
    const cur = window.__activeScene();
    cardsEl.querySelectorAll(".camera-card").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-scene") === cur);
    });
  }

  /* ================= 悬停读出 ================= */
  function ensurePlayer() {
    if (player) return player;
    if (!window.ModelEngine || !window.ModelEngine.Player || !spotCanvas) return null;
    player = new window.ModelEngine.Player(spotCanvas);
    return player;
  }

  function showSpot(dotEl, obj) {
    if (!spot || !mapBox) return;
    const sr = mapBox.getBoundingClientRect();
    const dr = dotEl.getBoundingClientRect();
    const SW = spot.offsetWidth || 176;
    const SH = spot.offsetHeight || 190;
    let left = dr.left - sr.left + dr.width / 2 - SW / 2;
    let top = dr.top - sr.top - SH - 10;
    if (top < 6) top = dr.top - sr.top + dr.height + 10;
    left = Math.max(6, Math.min(sr.width - SW - 6, left));
    top = Math.max(6, Math.min(sr.height - SH - 6, top));
    spot.style.left = left + "px";
    spot.style.top = top + "px";

    const cat = CATS[catOf(obj)];
    if (spotName) spotName.textContent = obj.label || obj.labelEn || obj.objectId;
    if (spotId) spotId.textContent = obj.objectId + " · CONF " + (conf(obj)).toFixed(2);
    if (spotFoot) spotFoot.textContent = String(obj.category || "—").toUpperCase() + " · " + (obj.function || "—");
    if (spotWedge) spotWedge.textContent = cat.en;
    spot.style.setProperty("--spot", cat.color);

    const m = modelOf(obj);
    if (m) {
      spot.classList.remove("photo");
      const p = ensurePlayer();
      if (p) p.showSolid(m[0], m[1]);
    } else {
      spot.classList.add("photo");
      if (player) player.stop();
      const src = obj.thumb || ("thumbs/" + obj.objectId + ".jpg");
      if (spotImg && spotImg.getAttribute("src") !== src) spotImg.src = src;
    }
    spot.classList.add("active");
  }

  function hideSpot() {
    if (!spot) return;
    spot.classList.remove("active");
    if (player) player.stop();
  }

  function updateCount(identified) {
    if (!countEl || identified === lastCount) return;
    lastCount = identified;
    countEl.textContent = String(identified).padStart(2, "0") + " / " +
      String(objects.length).padStart(2, "0") + " OBJECTS";
  }

  /* ================= 构建点位 ================= */
  function build(list, callbacks) {
    objects = list || [];
    opts = callbacks || {};
    if (!dotsG) return;
    buildLabels();
    buildStrip();
    buildCards();
    syncCards();
    hideSpot();
    dotsById.clear();
    dotsG.innerHTML = "";

    const dur = Math.max(1, objects.reduce(function (m, o) {
      return Math.max(m, o.disappear || 0);
    }, 1));

    // 按类别分组，组内按出现时间排序 → 由内到外铺开
    const groups = CATS.map(function () { return []; });
    objects.forEach(function (o) { groups[catOf(o)].push(o); });
    groups.forEach(function (a) { a.sort(function (x, y) { return (x.appear || 0) - (y.appear || 0); }); });

    const frag = document.createDocumentFragment();
    groups.forEach(function (arr, ci) {
      const cat = CATS[ci];
      const N = arr.length;
      arr.forEach(function (o, n) {
        const h1 = hash(o.objectId), h2 = hash(o.objectId + "#");
        const frac = 0.22 + 0.60 * ((n + 0.5) / N) + (h1 - 0.5) * 0.05;
        // 上限 0.92：留在外围有机轮廓（clipNet 会向内抖动）以内，避免点位飘到网体之外
        const r = Math.min(0.92, Math.max(0.16, frac));
        const ang = cat.angle + (h2 - 0.5) * 46;             // 扇区内 ±23°
        const a = (ang * Math.PI) / 180;
        const x = CX + Math.cos(a) * RX * r;
        const y = CY + Math.sin(a) * RY * r;
        const coreR = 4.2 + conf(o) * 1.8;

        const g = node("g", {
          "class": "map-point interactive",
          "data-category": ci,
          "data-id": o.objectId,
          "data-state": "pending",
          transform: "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")",
          tabindex: 0,
          role: "button",
          "aria-label": (o.label || o.labelEn || o.objectId) + " " + o.objectId
        });
        g.style.setProperty("--point-color", cat.color);
        g.appendChild(node("circle", { "class": "point-hit", r: 22 }));
        g.appendChild(node("circle", { "class": "point-halo", r: (coreR * 2.6).toFixed(1) }));
        g.appendChild(node("circle", { "class": "point-core", r: coreR.toFixed(1) }));

        g.addEventListener("pointerenter", function () {
          showSpot(g, o);
          if (opts.onHover) opts.onHover(o.objectId, true);
        });
        g.addEventListener("pointerleave", function () {
          hideSpot();
          if (opts.onHover) opts.onHover(o.objectId, false);
        });
        g.addEventListener("focus", function () { showSpot(g, o); if (opts.onHover) opts.onHover(o.objectId, true); });
        g.addEventListener("blur", function () { hideSpot(); if (opts.onHover) opts.onHover(o.objectId, false); });
        g.addEventListener("click", function () { if (opts.onSelect) opts.onSelect(o.objectId); });
        g.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (opts.onSelect) opts.onSelect(o.objectId);
          }
        });

        frag.appendChild(g);
        dotsById.set(o.objectId, { el: g, obj: o, state: "pending" });
      });
    });
    dotsG.appendChild(frag);
    lastCount = -1;
    updateCount(0);
  }

  /* ================= 每帧同步识别进度（内部脏检查） ================= */
  function tick(t) {
    if (!dotsById.size) return;
    let identified = 0;
    dotsById.forEach(function (d) {
      const o = d.obj;
      const st = t >= (o.appear || 0) ? (t <= (o.disappear || Infinity) ? "live" : "gone") : "pending";
      if (st !== "pending") identified++;
      if (st !== d.state) {
        d.state = st;
        d.el.setAttribute("data-state", st);
      }
    });
    updateCount(identified);
  }

  window.ObjectWeb = { build: build, tick: tick, hide: hideSpot, setScene: syncCards };
})();
