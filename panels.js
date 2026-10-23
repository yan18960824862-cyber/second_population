/* ═══════════════════════════════════════════════════════════════
   panels.js — 主站四个面板
   ───────────────────────────────────────────────────────────────
   1. DataViz    右侧数据可视化：工业制成品 vs 世界人口（粒子场）
   2. CrowdPanel 底部 3D 群像：由已识别目标生成的人物队列
   3. Library    底部档案库：每个目标一张缩略图卡片（迷你 3D 渲染）
   4. CodePanel  右下实时代码：滚动显示真实运行中的识别逻辑
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const INK = "168,211,224";
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function el(id) { return document.getElementById(id); }
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ═══════════════════════════════════════════════════
     1. 数据可视化粒子场（制成品 vs 世界人口 1950—2025）
     ═══════════════════════════════════════════════════ */
  const DataViz = (function () {
    const canvas = el("dvCanvas");
    if (!canvas) return { update() {} };
    const ctx = canvas.getContext("2d");
    const range = el("dvRange");
    const toggle = el("dvToggle");
    const yearValue = el("dvYearValue");
    const objectsValue = el("dvObjectsValue");
    const peopleValue = el("dvPeopleValue");

    const START = 1950, END = 2025, YEARS = END - START;
    const MAX_DOTS = 520, BASE_DOTS = 8;
    let currentYear = START, playing = true, lastFrame = 0;
    let W = 0, H = 0, dpr = 1;
    let objectPile = [], peoplePile = [];

    // 人口曲线：先快后慢；制成品曲线：后段加速
    const popCurve = t => 1.4 * t - 0.4 * t * t;
    const objCurve = t => 0.6 * t + 1.2 * t * t - 0.8 * t * t * t;
    const clampT = t => clamp(t, 0, 1);

    function countAt(curve, t) { return BASE_DOTS + Math.floor(MAX_DOTS * clampT(curve(t))); }
    function metrics(t) {
      return {
        pop: 2.5 + 5.7 * popCurve(t),
        obj: 0.8 + 5.7 * objCurve(t)
      };
    }
    function inverseCurve(curve, p) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (curve(mid) < p) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }

    function buildPile(laneStart, laneW, seed) {
      let state = seed >>> 0;
      const rnd = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
      const bins = Math.max(28, Math.floor(laneW / 5));
      const binW = laneW / bins;
      const heights = new Float32Array(bins);
      const points = [];
      for (let i = 0; i < MAX_DOTS + BASE_DOTS; i++) {
        const radius = 2.6 + rnd() * 1.5;
        const reach = Math.max(1, Math.ceil((radius * 1.6) / binW));
        let best = 0, bestScore = Infinity;
        for (let a = 0; a < 6; a++) {
          const cand = Math.floor(rnd() * bins);
          let local = 0;
          for (let k = Math.max(0, cand - reach); k <= Math.min(bins - 1, cand + reach); k++) local = Math.max(local, heights[k]);
          const score = local + rnd() * 9;
          if (score < bestScore) { bestScore = score; best = cand; }
        }
        const x = laneStart + (best + 0.5 + (rnd() - 0.5) * 0.7) * binW;
        let support = 0;
        for (let k = Math.max(0, best - reach); k <= Math.min(bins - 1, best + reach); k++) support = Math.max(support, heights[k]);
        const y = H - 6 - support - radius;
        for (let k = Math.max(0, best - reach); k <= Math.min(bins - 1, best + reach); k++) {
          const dx = (k - best) * binW;
          const profile = Math.sqrt(Math.max(0, radius * radius - dx * dx * 0.58)) * 1.7;
          heights[k] = Math.max(heights[k], support + profile);
        }
        points.push({ x: x, y: y, r: radius, sx: laneStart + rnd() * laneW, ph: rnd() * Math.PI * 2 });
      }
      return points;
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 两条泳道各占 46%，中间留 8% 空隙 → 视觉上明确分成两列
      const laneW = W * 0.46;
      const gap = (W - laneW * 2) / 2;
      objectPile = buildPile(gap, laneW, 2);
      peoplePile = buildPile(gap * 2 + laneW, laneW, 9);
      draw();
    }

    function drawLane(targets, curve, color, t, filled) {
      const count = countAt(curve, t);
      // filled=实心点（工业制成品）；否则画空心圈（世界人口）
      for (let i = 0; i < count; i++) {
        const p = targets[i];
        const birth = i < BASE_DOTS ? 0 : (i - BASE_DOTS + 1) / MAX_DOTS;
        const bornAt = i < BASE_DOTS ? 0 : inverseCurve(curve, birth) * YEARS;
        const age = currentYear - (START + bornAt);
        const fall = clamp(age / 1.6, 0, 1);
        const eased = 1 - Math.pow(1 - fall, 3);
        const x1 = p.sx, y1 = -10 - (i % 9) * 3;
        const x = lerp(x1, p.x, eased) + Math.sin(age * 3.4 + p.ph) * (1 - eased) * 4;
        const y = lerp(y1, p.y, eased);
        const r = Math.max(filled ? 1.0 : 1.3, p.r * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        if (filled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.9;
          ctx.fill();
        } else {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.72;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);
      const t = clampT((currentYear - START) / YEARS);
      const laneW = W * 0.46;
      const gap = (W - laneW * 2) / 2;
      // 制成品：实心点；人口：空心圈 —— 视觉上区分两条曲线
      drawLane(objectPile, objCurve, "rgba(168,211,224,.92)", t, true);
      drawLane(peoplePile, popCurve, "rgba(168,211,224,.72)", t, false);
      // 两条泳道基线
      ctx.strokeStyle = "rgba(168,211,224,.22)";
      ctx.lineWidth = 1;
      [gap, gap * 2 + laneW].forEach(function (x0) {
        ctx.beginPath();
        ctx.moveTo(x0, H - 4);
        ctx.lineTo(x0 + laneW, H - 4);
        ctx.stroke();
      });
      // 中轴分隔（虚线）
      ctx.strokeStyle = "rgba(168,211,224,.16)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function updateLabels() {
      const t = clampT((currentYear - START) / YEARS);
      const m = metrics(t);
      const y = Math.floor(currentYear);
      yearValue.textContent = String(y);
      if (range) range.value = String(y);
      objectsValue.textContent = m.obj.toFixed(2) + "B";
      peopleValue.textContent = m.pop.toFixed(2) + "B";
    }

    function tick(now) {
      if (!lastFrame) lastFrame = now;
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (playing) {
        currentYear += dt * 2.6;
        if (currentYear >= END) { currentYear = END; setPlaying(false); }
        updateLabels();
      }
      draw();
      requestAnimationFrame(tick);
    }

    function setPlaying(v) {
      playing = v;
      if (toggle) {
        toggle.textContent = playing ? "暂停" : "播放";
        toggle.setAttribute("aria-pressed", String(playing));
      }
    }

    if (toggle) toggle.addEventListener("click", () => {
      if (!playing && currentYear >= END) currentYear = START;
      setPlaying(!playing);
    });
    if (range) range.addEventListener("input", (e) => {
      currentYear = Number(e.target.value);
      setPlaying(false);
      updateLabels();
      draw();
    });
    window.addEventListener("resize", resize);
    updateLabels();
    resize();
    requestAnimationFrame(tick);

    return { update() { updateLabels(); } };
  })();

  /* ═══════════════════════════════════════════════════
     2. 3D 群像面板：把已识别目标排成一条透视队列
     ═══════════════════════════════════════════════════ */
  const CrowdPanel = (function () {
    const canvas = el("crowdCanvas");
    if (!canvas || !window.ModelEngine) return { update() {} };
    const ctx = canvas.getContext("2d");
    const countEl = el("crowdCount");
    let W = 0, H = 0, dpr = 1;
    let items = [];       // {model, x, z, phase}
    let models = {};      // 缓存：category|subtype → model
    let t0 = 0;

    function getModel(category, subtype) {
      const key = category + "|" + subtype;
      if (!models[key]) models[key] = window.ModelEngine.buildModel(category, subtype);
      return models[key];
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* 把 3D 模型绘制到指定屏幕位置（复用引擎的实体渲染） */
    function drawItem(model, sx, sy, scale, yaw, alpha) {
      const dist = 9;
      const dist2 = dist / (dist - 0);
      const s = scale;
      const P = p => {
        const q = window.Cam.rotate(p, yaw, -0.1);
        const f = dist / (dist - q[2]);
        return [sx + q[0] * s * f, sy - q[1] * s * f];
      };
      const list = [];
      for (const f of model.faces) {
        const q = f.p.map(p => window.Cam.rotate(p, yaw, -0.1));
        const z = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
        list.push({ f: f, q: q, z: z });
      }
      list.sort((a, b) => a.z - b.z);
      const LIGHT = [-0.42, 0.78, 0.58];
      for (const it of list) {
        const pts = it.q.map(v => {
          const f = dist / (dist - v[2]);
          return [sx + v[0] * s * f, sy - v[1] * s * f];
        });
        const n = it.f.n ? window.Cam.rotate(it.f.n, yaw, -0.1) : [0, 0, 1];
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        const lam = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l);
        const k = 0.5 + lam * 0.8;
        const c = it.f.c;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
        g.addColorStop(0, "rgba(" + c.map(v => Math.round(clamp(v * k * 1.2, 0, 255))).join(",") + ",1)");
        g.addColorStop(1, "rgba(" + c.map(v => Math.round(clamp(v * k * 0.5, 0, 255))).join(",") + ",1)");
        ctx.fillStyle = g;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.strokeStyle = "rgba(168,211,224," + (0.18 + lam * 0.26) * alpha + ")";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function tick(time) {
      if (!t0) t0 = time;
      if (!W || !H) { resize(); }
      ctx.clearRect(0, 0, W, H);
      const n = items.length;
      if (!n) {
        ctx.fillStyle = "rgba(168,211,224,.22)";
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText("AWAITING TARGETS…", 12, H / 2);
        requestAnimationFrame(tick);
        return;
      }
      // 目标少 → 单排大图；目标多 → 两排错落的透视队列（后排小而淡）
      const split = n > 6;
      const rows = split
        ? [{ list: items.slice(0, Math.ceil(n / 2)), k: 0.60, gy: H * 0.56, dim: 0.46, yaw: -0.9, slot: 56 },
           { list: items.slice(Math.ceil(n / 2)), k: 1.00, gy: H * 0.95, dim: 1.00, yaw: -0.5, slot: 100 }]
        : [{ list: items, k: 1.00, gy: H * 0.93, dim: 1.00, yaw: -0.5, slot: 104 }];
      rows.forEach(function (row) {
        const list = row.list;
        const m = list.length;
        if (!m) return;
        const usable = W * 0.92;
        // 少量目标时也铺开：列宽上限按排内数量自适应，最少 3 列
        const slots = Math.max(3, m);
        const step = Math.min(usable / slots, row.slot);
        const baseX = W * 0.5 - (m - 1) * step * 0.5;
        const gy = row.gy;
        // 该排地面基线（中间亮两端淡）
        const grd = ctx.createLinearGradient(0, 0, W, 0);
        grd.addColorStop(0, "rgba(168,211,224,0)");
        grd.addColorStop(0.5, "rgba(168,211,224," + (0.26 * row.dim) + ")");
        grd.addColorStop(1, "rgba(168,211,224,0)");
        ctx.strokeStyle = grd;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W * 0.03, gy);
        ctx.lineTo(W * 0.97, gy);
        ctx.stroke();
        for (let i = 0; i < m; i++) {
          const it = list[i];
          const sway = Math.sin(time * 0.0012 + it.phase) * 0.16;
          // 队列中间的目标更近 → 更大，形成透视纵深
          const centerBias = 1 + (1 - Math.abs(i - (m - 1) / 2) / Math.max(1, (m - 1) / 2)) * 0.16;
          const x = baseX + i * step;
          // 以高度为主定标，宽度做上限 → 人形（高瘦）优先，车型（宽扁）不撑破格
          const rowH = H * (split && row.k < 1 ? 0.46 : 0.80);
          const byHeight = rowH / Math.max(0.6, it.model.size.h);
          const byWidth = (step * 0.86) / Math.max(0.6, it.model.size.w);
          const scale = Math.min(byHeight, byWidth) * centerBias * row.k;
          // 落地投影
          const sh = ctx.createRadialGradient(x, gy, 0, x, gy, step * 0.40 * row.k);
          sh.addColorStop(0, "rgba(168,211,224," + (0.20 * row.dim) + ")");
          sh.addColorStop(1, "rgba(168,211,224,0)");
          ctx.save();
          ctx.translate(x, gy);
          ctx.scale(1, 0.22);
          ctx.beginPath();
          ctx.arc(0, 0, step * 0.40 * row.k, 0, TAU);
          ctx.fillStyle = sh;
          ctx.fill();
          ctx.restore();
          drawItem(it.model, x, gy, scale, row.yaw + sway, 0.95 * row.dim);
        }
      });
      requestAnimationFrame(tick);
    }

    function setTargets(list) {
      // 群像以「人」为主（第二人口的本义），人物不足时用车辆补齐队列
      const people = list.filter((o) => o.category === "person");
      const others = list.filter((o) => o.category !== "person");
      const picked = [];
      const take = (arr, n) => {
        const stride = Math.max(1, Math.ceil(arr.length / n));
        for (let i = 0; i < arr.length && picked.length < 16; i += stride) picked.push(arr[i]);
      };
      take(people, 16);
      take(others, 16 - picked.length);
      items = picked.map(function (o, i) {
        const st = window.ModelEngine.detectSubtype(o.category, o.labelEn);
        return { model: getModel(o.category, st), phase: i * 0.7, person: o.category === "person" };
      });
      if (countEl) countEl.textContent = String(list.length);
    }

    window.addEventListener("resize", resize);
    resize();
    requestAnimationFrame(tick);
    return { update: setTargets };
  })();

  /* ═══════════════════════════════════════════════════
     3. 档案库：每个目标一张迷你 3D 缩略图卡片
     ═══════════════════════════════════════════════════ */
  const Library = (function () {
    const track = el("libTrack");
    const countEl = el("libCount");
    if (!track || !window.ModelEngine) return { update() {} };
    const cards = [];

    function renderThumb(canvas, category, subtype) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, r.width || 92), h = Math.max(1, r.height || 66);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const model = window.ModelEngine.buildModel(category, subtype);
      if(category==='person'&&window.RiderGeometry){window.RiderGeometry.thumbnail(ctx,{w,h});return;}
      window.ModelEngine.renderSolid(ctx, model, { w: w, h: h, yaw: -0.62, time: 0, archive:true });
    }

    function build(objects) {
      track.innerHTML = "";
      cards.length = 0;
      objects.forEach(function (o, i) {
        const st = window.ModelEngine.detectSubtype(o.category, o.labelEn);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "lib-card" + (o.isAc ? " is-ac" : "");
        card.dataset.id = o.objectId;
        card.innerHTML =
          '<span class="lib-thumb"><canvas></canvas></span>' +
          '<span class="lib-meta">' +
            '<span class="lib-id">' + o.objectId + "</span>" +
            '<span class="lib-label">' + o.label + "</span>" +
            '<span class="lib-tag">' + (o.category || "").toUpperCase() + " · " + o.labelEn + "</span>" +
          "</span>" +
          '<span class="lib-bar"><i style="--w:' +
            Math.max(4, Math.round((o.energyKwh / 45000) * 100)) + '%"></i></span>';
        track.appendChild(card);
        const cv = card.querySelector("canvas");
        cards.push({ card: card, canvas: cv, obj: o, subtype: st, drawn: false });
      });
      // 视口内懒渲染缩略图
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            const rec = cards.find(c => c.card === en.target);
            if (rec && !rec.drawn) {
              rec.drawn = true;
              requestAnimationFrame(() => renderThumb(rec.canvas, rec.obj.category, rec.subtype));
            }
          });
        }, { root: track, rootMargin: "160px" });
        cards.forEach(c => io.observe(c.card));
      } else {
        cards.forEach(c => { c.drawn = true; renderThumb(c.canvas, c.obj.category, c.subtype); });
      }
      if (countEl) countEl.textContent = objects.length + " RECORDS";
    }

    function markActive(id) {
      cards.forEach(c => c.card.classList.toggle("is-active", c.obj.objectId === id));
    }

    return { build: build, markActive: markActive, cards: cards };
  })();

  /* ═══════════════════════════════════════════════════
     4. 实时代码面板：把真实运行中的识别逻辑滚动显示
     ═══════════════════════════════════════════════════ */
  const CodePanel = (function () {
    const body = el("codeBody");
    if (!body) return { update() {} };
    const code = body.querySelector("code");
    let lines = [];
    let scroll = 0;
    let lastPush = 0;

    const SNIPPET = [
      "// 第二人口 · 识别引擎实时日志",
      "tracker.onFrame(t) {",
      "  const visible = tracks.filter(",
      "    o => t >= o.appear && t <= o.disappear);",
      "  visible.forEach(o => {",
      "    const b = interpolate(o.keyframes, t);",
      "    box.style.left = b.x * 100 + '%';",
      "    box.style.width = b.w * 100 + '%';",
      "    lock = (t - o.appear) / 1.2;",
      "    if (lock >= 1) emit(o);",
      "  });",
      "}"
    ];

    function build() {
      lines = SNIPPET.slice();
      render();
    }

    function push(text, kind) {
      lines.push(text);
      if (lines.length > 26) lines.splice(0, lines.length - 26);
      scroll = 0;
      render();
    }

    function render() {
      const n = 20;
      const start = Math.max(0, lines.length - n);
      let html = "";
      for (let i = start; i < lines.length; i++) {
        const raw = lines[i];
        const t = raw.trim();
        let cls = "";
        if (t.startsWith("//")) cls = "c-cm";
        else if (t.startsWith("const visible")) cls = "c-kw";
        else if (t.startsWith("tracker.")) cls = "c-fn";
        else if (t.includes("=>")) cls = "c-ar";
        else if (t.includes("emit(")) cls = "c-em";
        else if (t.includes("%")) cls = "c-n";
        else if (t.includes("box.")) cls = "c-pr";
        else if (t.includes("interpolate")) cls = "c-fn";
        html += '<span class="cl ' + cls + '">' + escapeHtml(raw) + "</span>";
      }
      code.innerHTML = html;
    }

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    /* 供 tracker 调用：推送一条真实的识别事件 */
    function logEvent(obj, t) {
      const now = performance.now();
      if (now - lastPush < 260) return;
      lastPush = now;
      const line = "  emit('" + obj.objectId + "', " + t.toFixed(2) + ");  // " + obj.label;
      push(line);
    }

    build();
    return { update: logEvent, push: push };
  })();

  /* ═══════════════════════════════════════════════════
     对外接口
     ═══════════════════════════════════════════════════ */
  window.Panels = {
    dataViz: DataViz,
    crowd: CrowdPanel,
    library: Library,
    code: CodePanel
  };
})();
