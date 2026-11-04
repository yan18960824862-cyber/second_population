/* ═══════════════════════════════════════════════════════════
   NEBULA.JS — 星云普查台主引擎
   数据：nebula/catalogue.js（由 site/tracks_street0*.json 生成）
   职责：
     1. 把街道对象映射为星表中的一颗星（位置=画面坐标，亮度=能耗，点亮=出现时段）
     2. Aladin 式：图层栈 / 坐标赤经赤纬 / 视场缩放 / 目标解析 GOTO
     3. LAMOST 式：每个对象一条铭牌光谱
     4. DESI 式：运动对象绘制临时天体轨道
     5. 与原街景普查站（site/index.html）联动：点星 → 子站跳到该对象出现的帧
   ═══════════════════════════════════════════════════════════ */
"use strict";

window.createGlobalSurvey = function (root, DATA, openRecord, onStateChange = () => {}) {
  const INK = "168, 211, 224";
  // 配色 / 尺寸 token 表：所有材质色、发光色、雾层色都从这里读
  const U = window.UniversePalette;
  const palette = U.palette;
  // 星云氛围层：蓝灰色值来自 token 表（v5 的 #40566b），比任何记录都暗；只做背景，不参与数量统计。
  let HAZE = palette.hazeRgb();
  const WORLD = 1000;                      // 星图世界坐标边长（单位 u）
  const DEG_PER_UNIT = 360 / WORLD;        // 世界全宽映射到 360°（24h）

  const $ = (s, r) => (r || root).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || root).querySelectorAll(s));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* 确定性哈希：保证同一对象每次生成的抖动一致 */
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  if (!DATA || !DATA.objects) return;

  /* ─────────── 场景星区布局：四个监控片段 = 四片星区 ─────────── */
  const CLUSTERS = {
    street1: { c: [268, 642], spread: [330, 300], rot: -0.34, zone: "ZONE A", alias: "站前交叉口" },
    street2: { c: [560, 428], spread: [360, 318], rot: 0.26, zone: "ZONE B", alias: "夜间主路" },
    street3: { c: [332, 248], spread: [280, 250], rot: 0.92, zone: "ZONE C", alias: "南段慢行道" },
    street4: { c: [772, 686], spread: [300, 280], rot: -0.18, zone: "ZONE D", alias: "辅道停靠带" },
  };

  const CAT_META = [
    { key: "vehicle", cn: "车流主体", en: "VEHICLE" },
    { key: "person", cn: "骑手行人", en: "RIDER / PED" },
    { key: "industrial", cn: "工业物", en: "INDUSTRIAL" },
    { key: "infrastructure", cn: "基底设施", en: "INFRA" },
  ];

  /* ─────────── 星表构建 ─────────── */
  const scenes = DATA.scenes;
  const sceneByKey = {};
  scenes.forEach((s) => (sceneByKey[s.key] = s));

  const energies = DATA.objects.map((o) => o.energyKwh).filter((v) => v > 0);
  const lgMin = Math.log10(Math.min.apply(null, energies) + 1);
  const lgMax = Math.log10(Math.max.apply(null, energies) + 1);

  const stars = DATA.objects.map((o) => {
    const cl = CLUSTERS[o.scene];
    const jitterA = hash01(o.objectId) - 0.5;
    const jitterB = hash01(o.objectId + "y") - 0.5;
    const fx = o.cx - 0.5 + jitterA * 0.06;
    const fy = o.cy - 0.5 + jitterB * 0.06;
    const cs = Math.cos(cl.rot), sn = Math.sin(cl.rot);
    const lx = fx * cl.spread[0], ly = fy * cl.spread[1];

    // Unverified resource estimates must not determine public visual prominence.
    const mag = 0.45;
    // 个体尺寸按真实物理尺度分档，颜色按类别取 token 表；两者都不参与数量统计。
    const physClass = U.physicalClass(o);
    const tier = U.SIZE_TIERS[physClass] || U.SIZE_TIERS.other;

    return {
      raw: o,
      id: o.objectId,
      scene: o.scene,
      zone: cl.zone,
      label: o.label,
      labelEn: o.labelEn,
      category: o.category,
      conf: o.conf,
      energyKwh: o.energyKwh,
      t0: o.t0, t1: o.t1,
      duration: sceneByKey[o.scene] ? sceneByKey[o.scene].duration : 1,
      mag: mag,
      magAbs: +(12 - mag * 10).toFixed(2),
      physClass: physClass,
      tier: tier,
      phase: hash01(o.objectId + "p") * Math.PI * 2,
      moving: o.moving,
      // 世界坐标（初始按画面位置摆放，随后做松弛避免叠星）
      wx: cl.c[0] + (lx * cs - ly * sn),
      wy: cl.c[1] + (lx * sn + ly * cs),
      // 画面内的关键帧轨迹 → 世界坐标（临时天体轨道）
      traj: o.traj.map((p) => {
        const ax = p[0] - 0.5 + jitterA * 0.06;
        const ay = p[1] - 0.5 + jitterB * 0.06;
        const tx = ax * cl.spread[0], ty = ay * cl.spread[1];
        return [cl.c[0] + (tx * cs - ty * sn), cl.c[1] + (tx * sn + ty * cs)];
      }),
      _x: 0, _y: 0, _r: 0, _lit: false,
    };
  });

  /* 松弛：同星区内距离过近的星相互推开，得到自然的星团而非矩形点阵 */
  (function relax() {
    const MIN = 26;
    for (let iter = 0; iter < 90; iter++) {
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const a = stars[i], b = stars[j];
          let dx = b.wx - a.wx, dy = b.wy - a.wy;
          let d = Math.sqrt(dx * dx + dy * dy);
          if (d > MIN) continue;
          if (d < 0.001) { dx = 0.7; dy = 0.7; d = 1; }
          const push = ((MIN - d) / d) * 0.32;
          a.wx -= dx * push; a.wy -= dy * push;
          b.wx += dx * push; b.wy += dy * push;
        }
      }
    }
    stars.forEach((s) => {
      s.wx = clamp(s.wx, 60, WORLD - 60);
      s.wy = clamp(s.wy, 60, WORLD - 60);
    });
  })();

  const byId = {};
  stars.forEach((s) => (byId[s.id] = s));

  /* 全局量级峰值（光谱 / 强度条做归一化用） */
  const PEAK = stars.reduce((acc, s) => ({
    energy: Math.max(acc.energy, s.raw.energyKwh),
    water: Math.max(acc.water, s.raw.waterT),
    steel: Math.max(acc.steel, s.raw.steelKg),
    life: Math.max(acc.life, s.raw.lifeYear),
    carbon: Math.max(acc.carbon, Math.abs(s.raw.carbonT)),
    disp: Math.max(acc.disp, s.raw.disp),
  }), { energy: 1, water: 1, steel: 1, life: 1, carbon: 1, disp: 1 });

  /* ─────────── 运行态 ─────────── */
  const state = {
    cam: { cx: WORLD / 2, cy: WORLD / 2, px: 1, targetPx: 1, targetCx: WORLD / 2, targetCy: WORLD / 2 },
    mode: "sky",
    epoch: 0,
    playing: false,
    selected: null,
    hovered: null,
    activeScene: "street2",
    layers: {
      showSectors: { street1: true, street2: true, street3: true, street4: true },
      showCats: { vehicle: true, person: true, industrial: true, infrastructure: true },
      tracks: true, grid: true, labels: true, dust: true, nebula: true,
    },
    catSort: { key: "objectId", dir: 1 },
    catFilter: "",
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ─────────── 画布 ─────────── */
  const canvas = $("#sky");
  const ctx = canvas.getContext("2d");
  let cw = 0, ch = 0, dpr = 1, basePx = 1, prevBase = 0;

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    if(box.width<2||box.height<2)return;
    cw = Math.max(1, Math.round(box.width));
    ch = Math.max(1, Math.round(box.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 窗口变化时按基准比例同步缩放，保持当前视野的相对构图
    const newBase = Math.min(cw, ch) / WORLD * 1.04;
    if (prevBase > 0 && newBase !== prevBase) {
      const k = newBase / prevBase;
      state.cam.px *= k;
      state.cam.targetPx *= k;
    } else if (!prevBase) {
      state.cam.px = state.cam.targetPx = newBase;
    }
    basePx = newBase;
    prevBase = newBase;
    invalidate(180);
  }

  function fitView() {
    state.cam.px = state.cam.targetPx = basePx;
    state.cam.cx = state.cam.targetCx = WORLD / 2;
    state.cam.cy = state.cam.targetCy = WORLD / 2;
  }

  const toScreen = (wx, wy) => ({
    x: cw / 2 + (wx - state.cam.cx) * state.cam.px,
    y: ch / 2 + (wy - state.cam.cy) * state.cam.px,
  });
  const toWorld = (sx, sy) => ({
    x: (sx - cw / 2) / state.cam.px + state.cam.cx,
    y: (sy - ch / 2) / state.cam.px + state.cam.cy,
  });

  /* ─────────── 星云尘埃底图（预渲染一次，随视场缩放） ─────────── */
  const NB_SIZE = 640;
  const buildNebula = () => {
    const c = document.createElement("canvas");
    c.width = c.height = NB_SIZE;
    const g = c.getContext("2d");
    const k = NB_SIZE / WORLD;
    g.globalCompositeOperation = "lighter";

    function blob(x, y, r, a) {
      const grd = g.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * k);
      grd.addColorStop(0, "rgba(" + HAZE + "," + (a * palette.get().hazeAlpha) + ")");
      grd.addColorStop(0.45, "rgba(" + HAZE + "," + (a * 0.4 * palette.get().hazeAlpha) + ")");
      grd.addColorStop(1, "rgba(" + HAZE + ",0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x * k, y * k, r * k, 0, Math.PI * 2);
      g.fill();
    }

    // 银河带：贯穿四个星区的对角尘埃带
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      blob(lerp(90, 930, t) + Math.sin(t * 5) * 40, lerp(900, 130, t) + Math.cos(t * 4) * 34,
        150 + Math.sin(t * 3) * 40, 0.011);
    }
    // 每片星区自身的尘埃晕
    Object.keys(CLUSTERS).forEach((key) => {
      const cl = CLUSTERS[key];
      for (let i = 0; i < 30; i++) {
        const a = hash01(key + i) * Math.PI * 2;
        const rr = (0.2 + hash01(key + "r" + i) * 1.05) * (cl.spread[0] * 0.62);
        blob(cl.c[0] + Math.cos(a) * rr, cl.c[1] + Math.sin(a) * rr * 0.86,
          40 + hash01(key + "s" + i) * 130, 0.009 + hash01(key + "a" + i) * 0.011);
      }
    });
    return c;
  };
  let nebulaCanvas = buildNebula();

  /* 背景尘埃点 */
  const DUST = [];
  for (let i = 0; i < 460; i++) {
    DUST.push({
      x: hash01("d" + i) * WORLD,
      y: hash01("dy" + i) * WORLD,
      s: 0.3 + hash01("ds" + i) * 0.9,
      a: 0.02 + hash01("da" + i) * 0.05,
      p: hash01("dp" + i) * Math.PI * 2,
    });
  }

  /* ─────────── 绘制 ─────────── */
  let tNow = 0;

  function drawGrid() {
    if (!state.layers.grid) return;
    const step = 50;
    const w0 = toWorld(0, 0), w1 = toWorld(cw, ch);
    ctx.lineWidth = 1;
    for (let x = Math.floor(w0.x / step) * step; x <= w1.x; x += step) {
      const major = x % 200 === 0;
      ctx.strokeStyle = "rgba(" + INK + "," + (major ? 0.075 : 0.03) + ")";
      const p = toScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(Math.round(p.x) + 0.5, 0);
      ctx.lineTo(Math.round(p.x) + 0.5, ch);
      ctx.stroke();
    }
    for (let y = Math.floor(w0.y / step) * step; y <= w1.y; y += step) {
      const major = y % 200 === 0;
      ctx.strokeStyle = "rgba(" + INK + "," + (major ? 0.075 : 0.03) + ")";
      const p = toScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(p.y) + 0.5);
      ctx.lineTo(cw, Math.round(p.y) + 0.5);
      ctx.stroke();
    }
  }

  function drawSectorRings() {
    ctx.save();
    Object.keys(CLUSTERS).forEach((key) => {
      const cl = CLUSTERS[key];
      const p = toScreen(cl.c[0], cl.c[1]);
      const radius = (cl.spread[0] * 0.72) * state.cam.px;
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = "rgba(" + INK + ",0.13)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (state.layers.labels) {
        const sc = sceneByKey[key];
        ctx.font = "600 12px 'Chakra Petch', 'Noto Serif SC', serif";
        ctx.fillStyle = "rgba(" + INK + ",0.62)";
        ctx.textAlign = "center";
        ctx.fillText(cl.zone + " · " + cl.alias, p.x, p.y - radius - 12);
        ctx.font = "400 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(" + INK + ",0.32)";
        ctx.fillText((sc ? sc.duration.toFixed(1) : "0") + "s / " + (sc ? sc.count : 0) + " OBJ",
          p.x, p.y - radius + 2);
      }
    });
    ctx.restore();
  }

  function drawTracks() {
    if (!state.layers.tracks) return;
    ctx.lineWidth = 1;
    stars.forEach((s) => {
      if (!s.moving || !isVisible(s)) return;
      const lit = s._lit ? 0.34 : 0.1;
      const tone = s.raw.colorRgb || palette.rgb(s.physClass || 'other');
      ctx.strokeStyle = "rgba(" + tone + "," + lit + ")";
      ctx.beginPath();
      s.traj.forEach((pt, i) => {
        const p = toScreen(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      // 起止点的卫星式标记
      const a = toScreen(s.traj[0][0], s.traj[0][1]);
      const b = toScreen(s.traj[s.traj.length - 1][0], s.traj[s.traj.length - 1][1]);
      ctx.fillStyle = "rgba(" + tone + "," + (lit + 0.14) + ")";
      [a, b].forEach((q, i) => {
        ctx.beginPath();
        ctx.arc(q.x, q.y, i ? 2.2 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  function starRadius(s) {
    const zoomBoost = clamp(Math.log2(state.cam.px / basePx + 0.001), 0, 1) * 1.5;
    const tier = s.tier || U.SIZE_TIERS.other;
    // 屏幕投影的最小可见下限：缩到最远也还看得见，但不会大到盖住邻居
    return Math.max(tier.minPx, (1.35 + Math.pow(s.mag, 0.78) * 4.3 + zoomBoost) * tier.scale);
  }

  function drawStar(s, selected, hovered) {
    const INK = s.raw.colorRgb || palette.rgb(s.physClass || 'other');
    const p = toScreen(s.wx, s.wy);
    s._x = p.x; s._y = p.y;
    const r = starRadius(s);
    s._r = r;
    if (p.x < -40 || p.y < -40 || p.x > cw + 40 || p.y > ch + 40) return;

    const tw = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(tNow * 0.0016 + s.phase);
    let alpha = s._lit ? 1 : 0.15;
    if (selected || hovered) alpha = 1;
    else if (!s._lit) alpha *= 0.9;
    alpha *= tw;

    // 星冕
    const haloR = r * 3.4 + (s.mag > 0.85 ? 6 : 0);
    const haloKey=Math.round(haloR)+':'+Math.round(s.mag*8)+':'+(s.raw.color||INK);
    let halo=haloCache.get(haloKey);
    if(!halo){const size=Math.ceil(haloR),sprite=document.createElement('canvas');sprite.width=sprite.height=size*2;const c=sprite.getContext('2d'),gradient=c.createRadialGradient(size,size,0,size,size,size);gradient.addColorStop(0,'rgba('+ (s.raw.colorRgb||INK)+','+(.34*(.4+s.mag*.6))+')');gradient.addColorStop(.5,'rgba('+(s.raw.colorRgb||INK)+',.1)');gradient.addColorStop(1,'rgba('+(s.raw.colorRgb||INK)+',0)');c.fillStyle=gradient;c.fillRect(0,0,size*2,size*2);halo={sprite,size};haloCache.set(haloKey,halo)}
    ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(halo.sprite,p.x-halo.size,p.y-halo.size);ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    if (s.category === "vehicle") {
      ctx.fillStyle = "rgba(" + INK + "," + alpha + ")";
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      if (s.moving) {   // 运动星的拖影
        ctx.strokeStyle = "rgba(" + INK + "," + (alpha * 0.5) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r + 4.5, -0.5, 1.2); ctx.stroke();
      }
    } else if (s.category === "person") {
      ctx.fillStyle = "rgba(" + INK + "," + alpha + ")";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.fill();
      const pr = (reduceMotion ? 0 : (tNow * 0.0007) % 1);
      ctx.strokeStyle = "rgba(" + INK + "," + (alpha * (1 - pr) * 0.6) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.4 + pr * 2.6), 0, Math.PI * 2); ctx.stroke();
    } else if (s.category === "industrial") {
      ctx.fillStyle = "rgba(" + INK + "," + (alpha * 0.92) + ")";
      ctx.save(); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44);
      ctx.restore();
      ctx.strokeStyle = "rgba(" + INK + "," + (alpha * 0.55) + ")";
      ctx.lineWidth = 1;
      ctx.strokeRect(-r * 2.1, -r * 2.1, r * 4.2, r * 4.2);
    } else {
      ctx.strokeStyle = "rgba(" + INK + "," + (alpha * 0.72) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(" + INK + "," + (alpha * 0.3) + ")";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (selected || hovered) drawReticle(s, selected, hovered);
  }

  function drawReticle(s, selected, hovered) {
    const x = s._x, y = s._y, r = s._r;
    const gap = r + 9;
    ctx.save();
    ctx.strokeStyle = selected ? "rgba(" + INK + ",0.95)" : "rgba(" + INK + ",0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash(selected ? [] : [3, 3]);
    // 四角锁定括号
    const L = 7;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q) => {
      ctx.beginPath();
      ctx.moveTo(x + q[0] * gap, y + q[1] * gap - q[1] * L);
      ctx.lineTo(x + q[0] * gap, y + q[1] * gap);
      ctx.lineTo(x + q[0] * gap - q[0] * L, y + q[1] * gap);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    if (selected) {
      ctx.strokeStyle = "rgba(" + INK + ",0.35)";
      ctx.beginPath(); ctx.arc(x, y, gap + 12 + Math.sin(tNow * 0.003) * 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabels() {
    if (!state.layers.labels) return;
    const zoomed = state.cam.px / basePx > 1.35;
    ctx.font = "400 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    stars.forEach((s) => {
      const sel = state.selected === s.id, hov = state.hovered === s.id;
      const bright = s.mag > 0.7;
      if (!sel && !hov && !(zoomed && bright && s._lit)) return;
      const x = s._x + s._r + 12, y = s._y + 3;
      ctx.fillStyle = sel || hov ? "rgba(" + INK + ",0.95)" : "rgba(" + INK + ",0.45)";
      ctx.fillText(s.id + "  " + s.label, x, y);
    });
  }

  function drawDust() {
    if (!state.layers.dust) return;
    const zoomK = clamp(state.cam.px / basePx, 0.6, 4);
    DUST.forEach((d) => {
      const p = toScreen(d.x, d.y);
      if (p.x < 0 || p.y < 0 || p.x > cw || p.y > ch) return;
      const a = d.a * (reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(tNow * 0.0011 + d.p));
      ctx.fillStyle = "rgba(" + HAZE + "," + a + ")";
      ctx.fillRect(p.x, p.y, d.s * zoomK, d.s * zoomK);
    });
  }

  function isVisible(s) {
    return state.layers.showSectors[s.scene] && state.layers.showCats[s.category];
  }

  const haloCache=new Map();
  let active=false, raf=0, lastDraw=0, epochLast=0, frames=0,animateUntil=0;
  function invalidate(duration=160){animateUntil=Math.max(animateUntil,performance.now()+duration);if(active&&!document.hidden&&!raf)raf=requestAnimationFrame(render);}
  function render(ts) {
    raf=0;if(!active||document.hidden)return;
    if(ts-lastDraw<1000/30){raf=requestAnimationFrame(render);return;}lastDraw=ts;frames++;
    const dt=epochLast?Math.min(.1,(ts-epochLast)/1000):0;epochLast=ts;
    if(state.playing){state.epoch=(state.epoch+dt*.055)%1;epochRange.value=String(Math.round(state.epoch*1000));updateEpochRead();}
    tNow = ts || 0;
    // 非星图视图时挂起绘制（保留上一次画面，避免后台空转）
    if (state.mode !== "sky") return;

    // 视场缓动
    const v = state.cam;
    if (Math.abs(v.px - v.targetPx) > 0.01) v.px = lerp(v.px, v.targetPx, 0.18);
    if (Math.abs(v.cx - v.targetCx) > 0.05) v.cx = lerp(v.cx, v.targetCx, 0.2);
    if (Math.abs(v.cy - v.targetCy) > 0.05) v.cy = lerp(v.cy, v.targetCy, 0.2);

    ctx.clearRect(0, 0, cw, ch);

    // 星云底图：v5 的极淡蓝灰氛围层（比星点暗一档，只做景深）
    if (state.layers.nebula) {
      const o = toScreen(0, 0);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(nebulaCanvas, o.x, o.y, WORLD * v.px, WORLD * v.px);
      ctx.globalAlpha = 1;
    }

    drawDust();
    drawGrid();
    drawSectorRings();
    drawTracks();

    // 先画暗星（未点亮），再画亮星，保证亮星压在最上层
    const lit = [], dim = [];
    stars.forEach((s) => {
      if (!isVisible(s)) return;
      s._lit = state.epoch >= s.t0 && state.epoch <= s.t1;
      (s._lit ? lit : dim).push(s);
    });
    dim.sort((a, b) => a.mag - b.mag);
    lit.sort((a, b) => a.mag - b.mag);
    dim.forEach((s) => drawStar(s, false, false));
    lit.forEach((s) => drawStar(s, state.selected === s.id, state.hovered === s.id));

    drawLabels();
    const moving=Math.abs(v.px-v.targetPx)>.01||Math.abs(v.cx-v.targetCx)>.05||Math.abs(v.cy-v.targetCy)>.05;
    onStateChange(snapshot());
    if(state.playing||moving||ts<animateUntil)raf=requestAnimationFrame(render);
  }

  /* ─────────── HUD 读数 ─────────── */
  function fmtRA(x) {
    let hours = (x / WORLD) * 24;
    hours = ((hours % 24) + 24) % 24;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return pad2(h) + "h " + pad2(m) + "m";
  }
  function fmtDec(y) {
    const dec = 90 - (y / WORLD) * 180;
    const sign = dec >= 0 ? "+" : "−";
    const a = Math.abs(dec);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    return sign + pad2(d) + "°" + pad2(m) + "′";
  }
  function pad2(n) { return String(n).padStart(2, "0"); }

  function updateHud() {
    const c = toWorld(cw / 2, ch / 2);
    $("#hudCoord").textContent = "α " + fmtRA(c.x) + " · δ " + fmtDec(c.y);
    $("#hudFov").textContent = "FOV " + ((cw / state.cam.px) * DEG_PER_UNIT).toFixed(2) +
      "° · ×" + (state.cam.px / basePx).toFixed(2);

    const target = 60 / state.cam.px;
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    let pick = niceSteps[0];
    for (let i = 0; i < niceSteps.length; i++) {
      if (niceSteps[i] <= target) pick = niceSteps[i];
    }
    $("#scaleBar").style.width = clamp(pick * state.cam.px, 8, 240) + "px";
    $("#scaleTxt").textContent = pick + "u · " + (pick * DEG_PER_UNIT).toFixed(2) + "°";
  }
  setInterval(updateHud, 120);

  /* ─────────── 交互：平移 / 缩放 / 拾取 ─────────── */
  let drag = null;

  canvas.addEventListener("mousedown", (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: state.cam.cx, cy: state.cam.cy, moved: 0 };
    canvas.classList.add("is-panning");
  });
  window.addEventListener("mouseup", () => {
    drag = null;
    canvas.classList.remove("is-panning");
  });
  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (drag) {
      const dx = (e.clientX - drag.x), dy = (e.clientY - drag.y);
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      state.cam.cx = state.cam.targetCx = drag.cx - dx / state.cam.px;
      state.cam.cy = state.cam.targetCy = drag.cy - dy / state.cam.px;
      return;
    }
    if (mx < 0 || my < 0 || mx > cw || my > ch) { setHover(null); return; }

    const hit = pick(mx, my);
    setHover(hit ? hit.id : null, mx, my);
  });
  canvas.addEventListener("mouseleave", () => setHover(null));

  canvas.addEventListener("click", (e) => {
    if (drag && drag.moved > 6) return;
    const rect = canvas.getBoundingClientRect();
    const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) select(hit.id, true);
  });

  canvas.addEventListener("dblclick", (e) => {
    const rect = canvas.getBoundingClientRect();
    const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    goto(hit, 3.2);
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const before = toWorld(mx, my);
    const k = Math.exp(-e.deltaY * 0.0014);
    state.cam.targetPx = clamp(state.cam.targetPx * k, basePx * 0.55, basePx * 16);
    state.cam.px = state.cam.targetPx;
    const after = toWorld(mx, my);
    state.cam.cx = state.cam.targetCx = state.cam.cx + (before.x - after.x);
    state.cam.cy = state.cam.targetCy = state.cam.cy + (before.y - after.y);
  }, { passive: false });

  function pick(mx, my) {
    let best = null, bestD = Infinity;
    stars.forEach((s) => {
      if (!isVisible(s)) return;
      const dx = s._x - mx, dy = s._y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      const tol = Math.max(11, s._r + 7);
      if (d < tol && d < bestD) { best = s; bestD = d; }
    });
    return best;
  }

  const tip = $("#skyTip");
  function setHover(id, mx, my) {
    if (state.hovered === id && (!id || tip.classList.contains("is-on"))) {
      if (id) placeTip(mx, my);
      return;
    }
    state.hovered = id;
    if (!id) { tip.classList.remove("is-on"); return; }
    const s = byId[id];
    tip.innerHTML =
      "<b>" + esc(s.label) + "</b>" +
      '<div class="tip-id">' + s.id + " · " + esc(s.labelEn) + "</div>" +
      '<div class="tip-row"><span>来源机位</span><i>' + esc(s.raw.cameraId) + "</i></div>" +
      '<div class="tip-row"><span>统计状态</span><i>待核验候选</i></div>' +
      '<div class="tip-row"><span>点亮区间</span><i>' + (s.t0 * 100).toFixed(0) + "–" + (s.t1 * 100).toFixed(0) + "%</i></div>";
    tip.classList.add("is-on");
    placeTip(mx, my);
  }
  function placeTip(mx, my) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = mx + 16, y = my + 16;
    if (x + w > cw - 8) x = mx - w - 16;
    if (y + h > ch - 8) y = my - h - 16;
    tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }

  function goto(s, zoomTarget) {
    state.cam.targetPx = clamp(basePx * (zoomTarget || 2.4), basePx * 0.55, basePx * 16);
    state.cam.targetCx = s.wx;
    state.cam.targetCy = s.wy;
  }

  /* ─────────── 选中 / 档案 ─────────── */
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function select(id, openDossier) {
    state.selected = id;
    const s = byId[id];
    if (!s) return;
    state.activeScene = s.scene;
    renderDossier(s);
    markListSelection(id);
    if (openDossier) {
      shellEl.classList.remove("dossier-off");
      $("#dossier").classList.add("is-open");
    }
    updateEpochRead();
  }

  function clearSelection() {
    state.selected = null;
    markListSelection(null);
    $("#dossierBody").innerHTML =
      '<p class="dossier-empty">点击星图中的任一颗星<br>或在左侧解析编号 / 名称<br>调取该街道对象的普查档案</p>';
  }

  function markListSelection(id) {
    $$("#catBody tr").forEach((tr) => {
      tr.classList.toggle("is-sel", tr.dataset.id === id);
    });
  }

  /* 光谱：五通道铭牌曲线（能耗 / 用水 / 用钢 / 寿命 / 碳排），叠加同类别均值参考线 */
  function spectrumSvg(s) {
    const W = 292, H = 104, PADL = 10, PADB = 24;
    const channels = [
      { k: "能耗", v: s.raw.energyKwh, max: PEAK.energy },
      { k: "用水", v: s.raw.waterT, max: PEAK.water },
      { k: "用钢", v: s.raw.steelKg, max: PEAK.steel },
      { k: "寿命", v: s.raw.lifeYear, max: PEAK.life },
      { k: "碳排", v: Math.abs(s.raw.carbonT), max: PEAK.carbon },
    ];
    const n = channels.length;
    const xAt = (i) => PADL + (i * (W - PADL * 2)) / (n - 1);
    const yAt = (v, max) => (H - PADB) - (Math.max(0, v) / (max || 1)) * (H - PADB - 14);

    let grid = "";
    for (let i = 0; i <= 3; i++) {
      const y = 14 + ((H - PADB - 14) * i) / 3;
      grid += '<line x1="' + PADL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PADL) +
        '" y2="' + y.toFixed(1) + '" stroke="rgba(' + INK + ',0.07)" stroke-width="1"/>';
    }
    let ticks = "";
    channels.forEach((c, i) => {
      const x = xAt(i);
      ticks += '<line x1="' + x.toFixed(1) + '" y1="14" x2="' + x.toFixed(1) + '" y2="' +
        (H - PADB) + '" stroke="rgba(' + INK + ',0.05)" stroke-width="1"/>' +
        '<text x="' + x.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" fill="rgba(' +
        INK + ',0.45)" font-family="JetBrains Mono, monospace" font-size="8" letter-spacing="0.5">' +
        c.k + "</text>";
    });

    const pts = channels.map((c, i) => xAt(i).toFixed(1) + "," + yAt(c.v, c.max).toFixed(1)).join(" ");
    const dots = channels.map((c, i) =>
      '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(c.v, c.max).toFixed(1) +
      '" r="2" fill="#A8D3E0"/>').join("");

    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="铭牌光谱">' +
      grid + ticks +
      '<polyline points="' + pts + '" fill="none" stroke="#A8D3E0" stroke-width="1.4"/>' +
      '<polyline points="' + pts + " " + xAt(n - 1).toFixed(1) + "," + (H - PADB) + " " +
      xAt(0).toFixed(1) + "," + (H - PADB) + '" fill="rgba(' + INK + ',0.08)" stroke="none"/>' +
      dots +
      '<text x="' + PADL + '" y="9" fill="rgba(' + INK + ',0.4)" font-family="JetBrains Mono, monospace" ' +
      'font-size="7" letter-spacing="1.4">NORMALISED MANUFACTURING SPECTRUM</text>' +
      "</svg>";
  }

  function renderDossier(s) {
    $('#dossierBody').innerHTML='<div class="d-name">'+esc(s.label)+'</div><p class="d-name-en">'+esc(s.labelEn)+'</p><div class="d-rows">'+row('CANONICAL ID',esc(s.id))+row('SOURCE ID',esc(s.raw.sourceId))+row('CAMERA',esc(s.raw.cameraId))+row('TRACK',s.raw.appear+' – '+s.raw.disappear+'s')+row('STATUS','待核验候选')+'</div><div class="d-photo"><img alt="对象取证帧" src="'+esc(s.raw.thumb)+'"></div><p>原始标注观察，跨片段物理身份尚未核验。区段时间按片段长度归一化，并非同一绝对时钟。</p><button class="mini strong" data-act="goto-field" type="button">打开完整档案 ↗</button> <button class="mini" data-act="locate-monitor" type="button">定位来源监控 ↗</button>';
  }

  function row(k, v) {
    return '<div class="d-row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  }
  function bar(label, txt, pct) {
    return '<div class="d-bar-row"><div class="lbl"><span>' + label + "</span><span>" + txt +
      '</span></div><div class="d-bar"><i data-w="' + pct + '"></i></div></div>';
  }

  /* ─────────── 档案面板动作分发 ─────────── */
  const shellEl = $(".shell");
  $("#dossierBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || !state.selected) return;
    const s = byId[state.selected];
    if (btn.dataset.act === "center") {
      setView("sky");
      goto(s, 3.4);
    } else if (btn.dataset.act === "goto-field") {
      openRecord(s.id);
    } else if (btn.dataset.act === "locate-monitor") {
      openRecord(s.id, 'monitor');
    }
  });

  $("#dossierClose").addEventListener("click", () => {
    shellEl.classList.add("dossier-off");
    $("#dossier").classList.remove("is-open");
    clearSelection();
  });

  /* ─────────── 图层栈 UI ─────────── */
  (function buildLayers() {
    const host = $("#layers");
    let html = '<div class="layer-group"><h3>SECTORS · 监控区段</h3>';
    scenes.forEach((sc, i) => {
      const n = stars.filter((s) => s.scene === sc.key).length;
      html += '<label class="layer-row"><input type="checkbox" data-grp="sector" data-key="' + sc.key +
        '" checked><span class="box"></span><span class="lit-cn">' + String(i + 1).padStart(2, "0") +
        " " + esc(sc.alias) + '</span><span class="lit-n">' + n + "</span></label>";
    });
    html += "</div>";

    html += '<div class="layer-group"><h3>CLASSES · 对象类别</h3>';
    CAT_META.forEach((c) => {
      const n = stars.filter((s) => s.category === c.key).length;
      html += '<label class="layer-row"><input type="checkbox" data-grp="cat" data-key="' + c.key +
        '" checked><span class="box"></span><span class="lg-dot ' + c.key +
        '"></span><span class="lit-cn">' + c.cn + '</span><span class="lit-n">' + n + "</span></label>";
    });
    html += "</div>";

    html += '<div class="layer-group"><h3>OVERLAYS · 叠加层</h3>';
    [["tracks", "临时天体轨道 TRACKS"], ["labels", "对象标签 LABELS"],
     ["grid", "坐标网格 GRID"], ["nebula", "星云底图 NEBULA"], ["dust", "背景尘埃 DUST"]]
      .forEach((o) => {
        html += '<label class="layer-row"><input type="checkbox" data-grp="ov" data-key="' + o[0] +
          '" checked><span class="box"></span><span class="lit-cn">' + o[1] + "</span></label>";
      });
    html += "</div>";
    host.innerHTML = html;

    host.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.dataset || !el.dataset.grp) return;
      const k = el.dataset.key;
      if (el.dataset.grp === "sector") state.layers.showSectors[k] = el.checked;
      else if (el.dataset.grp === "cat") state.layers.showCats[k] = el.checked;
      else state.layers[k] = el.checked;
      el.closest(".layer-row").classList.toggle("is-on", el.checked);
    });

    $$("#layers input").forEach((el) => {
      el.closest(".layer-row").classList.toggle("is-on", el.checked);
    });
  })();

  /* ─────────── 历元扫掠 ─────────── */
  const epochRange = $("#epochRange");
  epochRange.addEventListener("input", () => {
    state.epoch = epochRange.value / 1000;
    state.playing = false;
    $("#epochPlay").classList.remove("is-on");
    $("#epochPlay").textContent = "▶";
    updateEpochRead();
  });

  $("#epochPlay").addEventListener("click", () => {
    state.playing = !state.playing;
    $("#epochPlay").classList.toggle("is-on", state.playing);
    $("#epochPlay").textContent = state.playing ? "❚❚" : "▶";
  });

  function updateEpochRead() {
    const sc = sceneByKey[state.activeScene] || scenes[0];
    $("#epochPct").textContent = (state.epoch * 100).toFixed(1) + "%";
    $("#epochSec").textContent = (state.epoch * sc.duration).toFixed(1);
    $("#epochScene").textContent = sc.cam;
  }

  /* ─────────── 检索 / GOTO ─────────── */
  const searchInput = $("#searchInput");
  const searchOut = $("#searchOut");

  function runSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchOut.innerHTML = ""; return; }
    const res = stars.filter((s) =>
      s.id.toLowerCase().indexOf(q) >= 0 ||
      s.label.indexOf(q) >= 0 ||
      s.labelEn.toLowerCase().indexOf(q) >= 0 ||
      (s.raw.model || "").toLowerCase().indexOf(q) >= 0
    ).slice(0, 8);

    if (!res.length) {
      searchOut.innerHTML = '<li class="empty">NO MATCH · 无匹配目标</li>';
      return;
    }
    searchOut.innerHTML = res.map((s) =>
      '<li data-id="' + s.id + '"><div class="r-id">' + s.id + "<span>" + esc(s.labelEn) +
      "</span></div><div class=\"r-cn\">" + esc(s.label) + " · " + s.zone + "</div></li>"
    ).join("");
  }
  searchInput.addEventListener("input", runSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = searchOut.querySelector("li[data-id]");
      if (first) first.click();
    }
  });
  searchOut.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const s = byId[li.dataset.id];
    setView("sky");
    select(s.id, true);
    goto(s, 3.2);
  });

  function setView() {}
  /* ─────────── 视图操作按钮 ─────────── */
  $("#btnZoomIn").addEventListener("click", () => zoomBy(1.45));
  $("#btnZoomOut").addEventListener("click", () => zoomBy(1 / 1.45));
  $("#btnReset").addEventListener("click", () => { fitView(); });
  $("#btnPrev").addEventListener("click", () => stepSel(-1));
  $("#btnNext").addEventListener("click", () => stepSel(1));

  /* ─────────── 配色方案切换（调试开关，方案未定稿时实时对比） ─────────── */
  const LEGEND_CLASS = { vehicle: 'transit', person: 'person', industrial: 'equipment', infrastructure: 'ground' };
  function applyScheme(scheme) {
    HAZE = palette.hazeRgb();
    nebulaCanvas = buildNebula();
    const stage = $(".stage");
    if (stage) stage.style.background = "radial-gradient(ellipse at 46% 50%," + scheme.bgEdge + "," + scheme.bg + " 78%)";
    Object.keys(LEGEND_CLASS).forEach((cat) => {
      const dot = $(".sky-legend .lg-" + cat);
      if (dot) dot.style.background = palette.style(LEGEND_CLASS[cat]);
    });
    const btn = $("#btnPalette");
    if (btn) btn.textContent = "配色 · " + scheme.label;
    invalidate(400);
  }
  $("#btnPalette").addEventListener("click", () => palette.cycle());
  window.addEventListener("keydown", (e) => { if (active && (e.key === "p" || e.key === "P")) palette.cycle(); });
  palette.onChange(applyScheme);
  applyScheme(palette.get());

  function zoomBy(k) {
    state.cam.targetPx = clamp(state.cam.targetPx * k, basePx * 0.55, basePx * 16);
  }

  let sectorIdx = -1;
  $("#btnSector").addEventListener("click", () => {
    const keys = scenes.map((s) => s.key);
    sectorIdx = (sectorIdx + 1) % keys.length;
    const key = keys[sectorIdx];
    const cl = CLUSTERS[key];
    state.cam.targetPx = basePx * 1.7;
    state.cam.targetCx = cl.c[0];
    state.cam.targetCy = cl.c[1];
    state.activeScene = key;
    updateEpochRead();
  });

  function stepSel(delta) {
    const list = stars.filter(isVisible);
    if (!list.length) return;
    let i = list.findIndex((s) => s.id === state.selected);
    i = (i + delta + list.length) % list.length;
    const s = list[i];
    select(s.id, true);
    goto(s, 3);
  }

  /* ─────────── 键盘 ─────────── */
  root.addEventListener("keydown", (e) => {
    if (e.composedPath()[0].tagName === "INPUT") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const pan = 60 / state.cam.px;
    switch (e.key) {
      case "ArrowLeft": state.cam.targetCx -= pan; break;
      case "ArrowRight": state.cam.targetCx += pan; break;
      case "ArrowUp": state.cam.targetCy -= pan; break;
      case "ArrowDown": state.cam.targetCy += pan; break;
      case "+": case "=": zoomBy(1.35); break;
      case "-": case "_": zoomBy(1 / 1.35); break;
      case "Escape":
        setHover(null);
        shellEl.classList.add("dossier-off");
        $("#dossier").classList.remove("is-open");
        clearSelection();
        break;
      default: return;
    }
    e.preventDefault();
  });

  /* ─────────── 统计 ─────────── */
  (function stats() {
    const moving = stars.filter((s) => s.moving).length;

    $("#rdStars").textContent = String(stars.length);
    $("#rdSectors").textContent = String(scenes.length);
    $("#ftStars").textContent = String(stars.length);
    $("#ftMoving").textContent = String(moving);
  })();

  /* ─────────── 启动 ─────────── */
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe($("#view-sky"));
  window.addEventListener("resize", resize);

  resize();
  fitView();
  updateEpochRead();

  function start(){if(active&&raf)return;active=true;epochLast=lastDraw=0;resize();invalidate(180);}
  function stop(){active=false;cancelAnimationFrame(raf);raf=0;onStateChange(snapshot());}
  function snapshot(){return {selectedObjectId:state.selected,filter:structuredClone(state.layers),globalViewTransform:{cx:state.cam.targetCx,cy:state.cam.targetCy,scale:state.cam.targetPx/basePx},epoch:state.epoch,playing:state.playing,activeScene:state.activeScene,dossierOpen:!shellEl.classList.contains('dossier-off')};}
  function restore(saved){
    if(!saved)return;
    if(saved.filter)state.layers=structuredClone(saved.filter);
    const v=saved.globalViewTransform;
    if(v){state.cam.cx=state.cam.targetCx=v.cx;state.cam.cy=state.cam.targetCy=v.cy;state.cam.px=state.cam.targetPx=basePx*v.scale;}
    state.epoch=saved.epoch??state.epoch;state.playing=!!saved.playing;state.activeScene=saved.activeScene||state.activeScene;
    epochRange.value=String(Math.round(state.epoch*1000));$("#epochPlay").classList.toggle("is-on",state.playing);$("#epochPlay").textContent=state.playing?"❚❚":"▶";
    $$("#layers input").forEach(el=>{el.checked=el.dataset.grp==='sector'?state.layers.showSectors[el.dataset.key]:el.dataset.grp==='cat'?state.layers.showCats[el.dataset.key]:state.layers[el.dataset.key];el.closest('.layer-row').classList.toggle('is-on',el.checked);});
    if(saved.selectedObjectId&&byId[saved.selectedObjectId])select(saved.selectedObjectId,saved.dossierOpen);
    else clearSelection();
    shellEl.classList.toggle('dossier-off',!saved.dossierOpen);$("#dossier").classList.toggle('is-open',!!saved.dossierOpen);
    updateEpochRead();invalidate();
  }
  function focusRecord(id){
    const s=byId[id];if(!s)return false;
    const changed=state.selected!==id;
    // An explicit jump reveals its target; returning to the same target preserves the view.
    if(changed){state.layers.showSectors[s.scene]=true;state.layers.showCats[s.category]=true;restore(snapshot());state.epoch=(s.t0+s.t1)/2;epochRange.value=String(Math.round(state.epoch*1000));goto(s,2.4);}
    select(id,true);invalidate();onStateChange(snapshot());return true;
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else if(active)start();});
  for(const type of ['pointerdown','pointerup','pointermove','wheel','input','change','click','keydown'])root.addEventListener(type,()=>invalidate(180),{capture:true,passive:true});
  return {start,stop,snapshot,restore,focusRecord,getState:()=>({active,running:!!raf,frames,epoch:state.epoch,selected:state.selected,zoom:state.cam.px,stars:stars.length,haloSprites:haloCache.size}),points:()=>stars.map(s=>({id:s.id,x:s._x,y:s._y})),select:focusRecord};
};
