/* ═══════════════════════════════════════════════════════════════
   model-engine.js — 通用 3D 物体模型引擎
   ───────────────────────────────────────────────────────────────
   移植 handoff-v7 的「精细度」范式，并为每一类物体生成对应造型：

     · 实体渲染：面片深度排序 + 渐变填充 + 描边 + 地面投影
     · 分面细节：车轮/轮毂、风扇与叶片、格栅百叶、灯头、货箱、车窗带
     · 线网扫描：扫描期三段式进度（逐级揭示 + 旋转 + 频闪带）
     · 逐面剔除：背面不渲染，线宽分三档

   类别与子类型（按 labelEn 自动判定）：
     person        外卖骑手 / 电动车骑手  → 人 + 自行车 + 货箱
     vehicle       轿车 / SUV / 厢式货车 / 城市巴士 / 长途大巴
     infrastructure 路灯（灯杆 + 悬臂 + 灯头 + 辉光）
     appliance     空调外机（v7 同款比例：风扇 + 侧格栅 + 支架 + 管路）

   对外接口：window.ModelEngine
     buildModel(category, subtype)  → 几何体
     Player                         → 扫描 → 实体 的动画播放器
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  /* ─────────── 调色板（黑 + #A8D3E0 体系内的金属灰阶） ─────────── */
  const PAL = {
    shell:   [28, 42, 50],
    shellHi: [46, 64, 74],
    glass:   [13, 27, 35],
    rubber:  [11, 15, 18],
    steel:   [80, 102, 112],
    dark:    [17, 25, 31],
    light:   [168, 211, 224]
  };

  /* ─────────── Mesh ─────────── */
  function Mesh() {
    this.faces = [];
    this.edges = [];
    this.accents = [];
    this.size = { w: 1, h: 1, d: 1 };
    this.ground = 0;
  }
  Mesh.prototype.face = function (pts, col, normal, opt) {
    opt = opt || {};
    this.faces.push({
      p: pts, c: col, n: normal || null,
      lvl: opt.lvl == null ? 0 : opt.lvl,
      emissive: !!opt.emissive
    });
  };
  Mesh.prototype.stroke = function (a, b, w, lvl) {
    this.edges.push({ a: a, b: b, w: w || 1, lvl: lvl == null ? 0.05 : lvl });
  };
  Mesh.prototype.accent = function (type, data) {
    const o = { type: type };
    for (const k in data) o[k] = data[k];
    this.accents.push(o);
  };

  /* 边线去重 */
  function edgeKey(a, b) {
    const r = v => Math.round(v * 1000) / 1000;
    const ka = r(a[0]) + "," + r(a[1]) + "," + r(a[2]);
    const kb = r(b[0]) + "," + r(b[1]) + "," + r(b[2]);
    return ka < kb ? ka + "|" + kb : kb + "|" + ka;
  }
  function pushEdge(m, a, b, w, lvl) {
    m._ek = m._ek || {};
    const k = edgeKey(a, b);
    if (m._ek[k]) return;
    m._ek[k] = 1;
    m.edges.push({ a: a, b: b, w: w || 1, lvl: lvl == null ? 0 : lvl });
  }

  /* ─────────── 基本体块 ─────────── */

  /* 长方体：6 个面 + 12 条棱 */
  function addBox(m, x0, y0, z0, x1, y1, z1, col, opt) {
    opt = opt || {};
    const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y1, z0], D = [x0, y1, z0];
    const E = [x0, y0, z1], F = [x1, y0, z1], G = [x1, y1, z1], H = [x0, y1, z1];
    m.face([A, B, C, D], col, [0, 0, -1], opt);
    m.face([E, F, G, H], col, [0, 0, 1], opt);
    m.face([A, B, F, E], col, [0, -1, 0], opt);
    m.face([D, C, G, H], col, [0, 1, 0], opt);
    m.face([A, D, H, E], col, [-1, 0, 0], opt);
    m.face([B, C, G, F], col, [1, 0, 0], opt);
    const e = [
      [A, B], [B, C], [C, D], [D, A],
      [E, F], [F, G], [G, H], [H, E],
      [A, E], [B, F], [C, G], [D, H]
    ];
    for (const pair of e) pushEdge(m, pair[0], pair[1], opt.w == null ? 1 : opt.w, opt.lvl);
    return { A: A, B: B, C: C, D: D, E: E, F: F, G: G, H: H };
  }

  /* 沿 Z 轴的圆柱（车轮） */
  function addCylZ(m, cx, cy, z0, z1, r, seg, col, opt) {
    opt = opt || {};
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, am = (a0 + a1) / 2;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0];
      const p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0];
      const p2 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z1];
      const p3 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z1];
      m.face([p0, p1, p2, p3], col, [Math.cos(am), Math.sin(am), 0], opt);
      pushEdge(m, p0, p1, 0.6, opt.lvl);
      pushEdge(m, p3, p2, 0.6, opt.lvl);
    }
    const capA = [], capB = [], ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU;
      const pa = [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0];
      const pb = [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1];
      capA.push(pa); capB.push(pb);
      if (i > 0) { pushEdge(m, ring[ring.length - 1], pa, 0.9, opt.lvl); }
      ring.push(pa);
    }
    m.face(capA, col, [0, 0, -1], opt);
    m.face(capB, col, [0, 0, 1], opt);
    for (let i = 0; i < seg; i++) pushEdge(m, capB[i], capB[i + 1], 0.9, opt.lvl);
  }

  /* 沿 Y 轴的圆柱（灯杆 / 轮毂轴） */
  function addCylY(m, cx, cz, y0, y1, r, seg, col, opt) {
    opt = opt || {};
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, am = (a0 + a1) / 2;
      const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const p2 = [cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r];
      const p3 = [cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r];
      m.face([p0, p1, p2, p3], col, [Math.cos(am), 0, Math.sin(am)], opt);
      pushEdge(m, p0, p1, 0.6, opt.lvl);
      pushEdge(m, p3, p2, 0.6, opt.lvl);
    }
    for (const y of [y0, y1]) {
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        const p = [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
        if (i > 0) pushEdge(m, ring[ring.length - 1], p, 0.8, opt.lvl);
        ring.push(p);
      }
    }
  }

  /* 面板：返回 pt(u,v) 以便在面上加细节线 */
  function panel(m, origin, uVec, vVec, col, opt) {
    opt = opt || {};
    const p = [
      origin,
      [origin[0] + uVec[0], origin[1] + uVec[1], origin[2] + uVec[2]],
      [origin[0] + uVec[0] + vVec[0], origin[1] + uVec[1] + vVec[1], origin[2] + uVec[2] + vVec[2]],
      [origin[0] + vVec[0], origin[1] + vVec[1], origin[2] + vVec[2]]
    ];
    m.face(p, col, opt.n, opt);
    const lvl = opt.lvl == null ? 0 : opt.lvl;
    const edges = [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]], [p[3], p[0]]];
    for (const e of edges) pushEdge(m, e[0], e[1], opt.w == null ? 0.8 : opt.w, lvl);
    return {
      pt: (u, v) => [
        origin[0] + uVec[0] * u + vVec[0] * v,
        origin[1] + uVec[1] * u + vVec[1] * v,
        origin[2] + uVec[2] * u + vVec[2] * v
      ]
    };
  }

  /* 车轮：轮胎 + 轮辋 + 轮辐 + 轮毂 */
  function addWheel(m, cx, cy, zOuter, zInner, r, tireW, rimR) {
    const z0 = zInner, z1 = zOuter;
    addCylZ(m, cx, cy, z0, z1, r, 22, PAL.rubber, { lvl: 0.04, w: 0.8 });
    // 轮辋（亮金属）
    addCylZ(m, cx, cy, z0 + (z1 - z0) * 0.18, z1 - (z1 - z0) * 0.12, rimR, 18, PAL.steel, { lvl: 0.1, w: 0.7 });
    // 轮辐
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      m.stroke(
        [cx + Math.cos(a) * rimR * 0.22, cy + Math.sin(a) * rimR * 0.22, z1 - (z1 - z0) * 0.1],
        [cx + Math.cos(a) * rimR * 0.92, cy + Math.sin(a) * rimR * 0.92, z1 - (z1 - z0) * 0.1],
        0.55, 0.22
      );
    }
    m.accent("disc", {
      c: [cx, cy, z1 - (z1 - z0) * 0.08], r: rimR * 0.26, axis: "z",
      col: PAL.shellHi, glow: 0.25
    });
  }

  /* ─────────── 车辆：轿车 ─────────── */
  function buildSedan(m) {
    const W = 4.4, D = 1.9;
    addBox(m, -W / 2, -0.44, -D / 2, W / 2, 0.14, D / 2, PAL.shell, { lvl: 0, w: 1.1 });
    // 前后机盖（微斜）
    addBox(m, 0.80, 0.14, -0.88, 2.06, 0.30, 0.88, PAL.shellHi, { lvl: 0.05 });
    addBox(m, -2.10, 0.14, -0.88, -1.24, 0.30, 0.88, PAL.shellHi, { lvl: 0.05 });
    // 车顶舱
    addBox(m, -1.30, 0.30, -0.80, 0.80, 0.84, 0.80, PAL.shellHi, { lvl: 0.08 });
    // 车窗带
    panel(m, [-1.24, 0.36, 0.805], [1.98, 0, 0], [0, 0.42, 0], PAL.glass, { n: [0, 0, 1], lvl: 0.16, w: 0.7 });
    panel(m, [-1.24, 0.36, -0.805], [1.98, 0, 0], [0, 0.42, 0], PAL.glass, { n: [0, 0, -1], lvl: 0.16, w: 0.7 });
    // 前后风挡
    panel(m, [0.80, 0.34, 0.62], [0, 0, 0.36], [0, 0.44, -0.06], PAL.glass, { n: [1, 0, 0], lvl: 0.16, w: 0.7 });
    panel(m, [-1.30, 0.34, -0.62], [0, 0, 0.36], [0, 0.44, -0.06], PAL.glass, { n: [-1, 0, 0], lvl: 0.16, w: 0.7 });
    // 车门分缝
    for (const x of [-0.42, 0.46]) {
      m.stroke([x, -0.40, 0.95], [x, 0.28, 0.95], 0.5, 0.18);
      m.stroke([x, -0.40, -0.95], [x, 0.28, -0.95], 0.5, 0.18);
    }
    // 保险杠
    addBox(m, 2.10, -0.34, -0.86, 2.20, 0.04, 0.86, PAL.dark, { lvl: 0.2, w: 0.6 });
    addBox(m, -2.20, -0.34, -0.86, -2.10, 0.04, 0.86, PAL.dark, { lvl: 0.2, w: 0.6 });
    // 大灯 / 尾灯
    m.accent("poly", { pts: [[2.19, -0.12, 0.34], [2.19, 0.06, 0.80], [2.19, 0.06, 0.34]], col: PAL.light, glow: 0.9 });
    m.accent("poly", { pts: [[2.19, -0.12, -0.80], [2.19, 0.06, -0.34], [2.19, 0.06, -0.80]], col: PAL.light, glow: 0.9 });
    m.accent("poly", { pts: [[-2.19, -0.06, 0.36], [-2.19, 0.10, 0.78], [-2.19, 0.10, 0.36]], col: [190, 120, 120], glow: 0.6 });
    // 进气格栅
    for (let i = 0; i < 5; i++) {
      m.stroke([2.185, -0.30 + i * 0.075, -0.52], [2.185, -0.30 + i * 0.075, 0.52], 0.45, 0.24);
    }
    // 车轮
    for (const x of [-1.42, 1.40]) {
      addWheel(m, x, -0.40, 0.96, 0.66, 0.42, 0.30, 0.26);
      addWheel(m, x, -0.40, -0.96, -0.66, 0.42, 0.30, 0.26);
    }
    m.size = { w: W, h: 1.3, d: D };
    m.ground = -0.82;
  }

  /* ─────────── 车辆：SUV ─────────── */
  function buildSUV(m) {
    const W = 4.6, D = 1.96;
    addBox(m, -W / 2, -0.40, -D / 2, W / 2, 0.30, D / 2, PAL.shell, { lvl: 0, w: 1.1 });
    // 车厢（更高更方）
    addBox(m, -2.10, 0.30, -0.88, 0.98, 1.24, 0.88, PAL.shellHi, { lvl: 0.06 });
    // 车窗带
    panel(m, [-2.02, 0.42, 0.885], [2.90, 0, 0], [0, 0.70, 0], PAL.glass, { n: [0, 0, 1], lvl: 0.16, w: 0.7 });
    panel(m, [-2.02, 0.42, -0.885], [2.90, 0, 0], [0, 0.70, 0], PAL.glass, { n: [0, 0, -1], lvl: 0.16, w: 0.7 });
    panel(m, [0.98, 0.40, 0.66], [0, 0, 0.42], [0, 0.68, -0.05], PAL.glass, { n: [1, 0, 0], lvl: 0.16, w: 0.7 });
    panel(m, [-2.10, 0.40, -0.66], [0, 0, 0.42], [0, 0.68, -0.05], PAL.glass, { n: [-1, 0, 0], lvl: 0.16, w: 0.7 });
    // 行李架
    for (const z of [0.62, -0.62]) m.stroke([-1.90, 1.32, z], [0.86, 1.32, z], 0.5, 0.2);
    m.stroke([-1.90, 1.24, 0.62], [-1.90, 1.32, 0.62], 0.4, 0.2);
    m.stroke([0.86, 1.24, 0.62], [0.86, 1.32, 0.62], 0.4, 0.2);
    // 门缝
    for (const x of [-0.9, 0.28]) {
      m.stroke([x, -0.36, 0.99], [x, 0.26, 0.99], 0.5, 0.18);
      m.stroke([x, -0.36, -0.99], [x, 0.26, -0.99], 0.5, 0.18);
    }
    // 保险杠 / 轮眉
    addBox(m, 2.22, -0.28, -0.90, 2.32, 0.14, 0.90, PAL.dark, { lvl: 0.2, w: 0.6 });
    addBox(m, -2.32, -0.28, -0.90, -2.22, 0.14, 0.90, PAL.dark, { lvl: 0.2, w: 0.6 });
    for (const x of [-1.48, 1.46]) for (const s of [1, -1]) {
      m.stroke([x - 0.52, -0.30, s * 0.99], [x + 0.52, -0.30, s * 0.99], 0.45, 0.22);
    }
    m.accent("poly", { pts: [[2.31, 0.02, 0.42], [2.31, 0.20, 0.84], [2.31, 0.20, 0.42]], col: PAL.light, glow: 0.9 });
    m.accent("poly", { pts: [[2.31, 0.02, -0.84], [2.31, 0.20, -0.42], [2.31, 0.20, -0.84]], col: PAL.light, glow: 0.9 });
    // 车轮（更大）
    for (const x of [-1.48, 1.46]) {
      addWheel(m, x, -0.38, 1.00, 0.66, 0.47, 0.34, 0.30);
      addWheel(m, x, -0.38, -1.00, -0.66, 0.47, 0.34, 0.30);
    }
    m.size = { w: W, h: 1.75, d: D };
    m.ground = -0.85;
  }

  /* ─────────── 车辆：厢式货车 ─────────── */
  function buildTruck(m) {
    // 驾驶室
    addBox(m, 0.90, -0.42, -1.00, 2.20, 1.10, 1.00, PAL.shell, { lvl: 0, w: 1.1 });
    // 驾驶室玻璃
    panel(m, [2.20, 0.30, 0.86], [0, 0, 0.26], [0, 0.66, -0.04], PAL.glass, { n: [1, 0, 0], lvl: 0.16, w: 0.7 });
    panel(m, [2.20, 0.30, -0.86], [0, 0, 0.26], [0, 0.66, -0.04], PAL.glass, { n: [1, 0, 0], lvl: 0.16, w: 0.7 });
    panel(m, [0.92, 0.30, 0.86], [0, 0, 0.26], [0, 0.66, -0.04], PAL.glass, { n: [-1, 0, 0], lvl: 0.16, w: 0.7 });
    // 货箱
    addBox(m, -2.50, 0.30, -1.02, 0.88, 2.34, 1.02, PAL.shellHi, { lvl: 0.06, w: 1.1 });
    // 货箱竖向压筋
    for (let i = 0; i < 7; i++) {
      const x = -2.30 + i * 0.50;
      m.stroke([x, 0.34, 1.03], [x, 2.30, 1.03], 0.42, 0.2);
      m.stroke([x, 0.34, -1.03], [x, 2.30, -1.03], 0.42, 0.2);
    }
    // 尾门
    m.stroke([-2.50, 0.30, 0], [-2.50, 2.34, 0], 0.6, 0.24);
    m.stroke([-2.51, 1.30, -1.02], [-2.51, 1.30, 1.02], 0.5, 0.24);
    // 底盘
    addBox(m, -2.46, -0.46, -0.86, 2.18, 0.30, 0.86, PAL.dark, { lvl: 0.1, w: 0.8 });
    // 前脸
    addBox(m, 2.20, -0.30, -0.98, 2.30, 0.10, 0.98, PAL.dark, { lvl: 0.2, w: 0.6 });
    for (let i = 0; i < 4; i++) m.stroke([2.285, -0.24 + i * 0.08, -0.56], [2.285, -0.24 + i * 0.08, 0.56], 0.45, 0.24);
    m.accent("poly", { pts: [[2.30, 0.00, 0.40], [2.30, 0.18, 0.86], [2.30, 0.18, 0.40]], col: PAL.light, glow: 0.9 });
    m.accent("poly", { pts: [[2.30, 0.00, -0.86], [2.30, 0.18, -0.40], [2.30, 0.18, -0.86]], col: PAL.light, glow: 0.9 });
    // 后视镜
    m.stroke([2.06, 0.74, 1.02], [2.16, 0.74, 1.24], 0.45, 0.26);
    m.stroke([2.06, 0.74, -1.02], [2.16, 0.74, -1.24], 0.45, 0.26);
    // 车轮
    addWheel(m, 1.60, -0.44, 1.02, 0.70, 0.48, 0.32, 0.30);
    addWheel(m, 1.60, -0.44, -1.02, -0.70, 0.48, 0.32, 0.30);
    addWheel(m, -1.60, -0.44, 1.02, 0.70, 0.48, 0.32, 0.30);
    addWheel(m, -1.60, -0.44, -1.02, -0.70, 0.48, 0.32, 0.30);
    addWheel(m, -2.30, -0.44, 1.02, 0.70, 0.48, 0.32, 0.30);
    addWheel(m, -2.30, -0.44, -1.02, -0.70, 0.48, 0.32, 0.30);
    m.size = { w: 4.8, h: 2.9, d: 2.2 };
    m.ground = -0.92;
  }

  /* ─────────── 车辆：城市巴士 ─────────── */
  function buildBus(m) {
    const L = 9.2, W = 2.5, H = 2.9;
    addBox(m, -L / 2, -0.30, -W / 2, L / 2, H - 0.5, W / 2, PAL.shell, { lvl: 0, w: 1.2 });
    // 车顶弧形段
    addBox(m, -L / 2 + 0.2, H - 0.5, -W / 2 + 0.12, L / 2 - 0.2, H - 0.24, W / 2 - 0.12, PAL.shellHi, { lvl: 0.06 });
    // 侧窗带
    panel(m, [-L / 2 + 0.28, 0.62, W / 2 + 0.005], [L - 0.56, 0, 0], [0, 1.24, 0], PAL.glass, { n: [0, 0, 1], lvl: 0.14, w: 0.7 });
    panel(m, [-L / 2 + 0.28, 0.62, -W / 2 - 0.005], [L - 0.56, 0, 0], [0, 1.24, 0], PAL.glass, { n: [0, 0, -1], lvl: 0.14, w: 0.7 });
    // 前后风挡
    panel(m, [L / 2 + 0.005, 0.58, W / 2 - 0.16], [0, 0, -(W - 0.32)], [0, 1.34, 0], PAL.glass, { n: [1, 0, 0], lvl: 0.14, w: 0.7 });
    panel(m, [-L / 2 - 0.005, 0.58, -(W / 2 - 0.16)], [0, 0, W - 0.32], [0, 1.34, 0], PAL.glass, { n: [-1, 0, 0], lvl: 0.14, w: 0.7 });
    // 门缝
    for (const x of [2.6, -1.0]) {
      m.stroke([x, -0.28, W / 2 + 0.01], [x, 2.0, W / 2 + 0.01], 0.5, 0.18);
      m.stroke([x, -0.28, -W / 2 - 0.01], [x, 2.0, -W / 2 - 0.01], 0.5, 0.18);
    }
    // 顶部空调罩
    addBox(m, 1.2, H - 0.24, -0.9, 3.4, H - 0.02, 0.9, PAL.dark, { lvl: 0.2, w: 0.7 });
    // 车头灯
    m.accent("poly", { pts: [[L / 2 + 0.01, -0.22, 0.86], [L / 2 + 0.01, 0.12, 1.18], [L / 2 + 0.01, 0.12, 0.86]], col: PAL.light, glow: 0.9 });
    m.accent("poly", { pts: [[L / 2 + 0.01, -0.22, -1.18], [L / 2 + 0.01, 0.12, -0.86], [L / 2 + 0.01, 0.12, -1.18]], col: PAL.light, glow: 0.9 });
    // 车轮（双后桥）
    for (const x of [3.2, -2.4, -3.4]) {
      addWheel(m, x, -0.62, 1.28, 0.92, 0.52, 0.36, 0.32);
      addWheel(m, x, -0.62, -1.28, -0.92, 0.52, 0.36, 0.32);
    }
    m.size = { w: L, h: H, d: W };
    m.ground = -1.14;
  }

  /* ─────────── 车辆：长途大巴 ─────────── */
  function buildCoach(m) {
    const L = 10.4, W = 2.55, H = 3.2;
    addBox(m, -L / 2, -0.28, -W / 2, L / 2 - 0.9, H - 0.62, W / 2, PAL.shell, { lvl: 0, w: 1.2 });
    // 倾斜车头
    panel(m, [L / 2 - 0.9, -0.28, W / 2], [0, 0, -(W)], [0.9, H - 0.34, 0], PAL.shellHi, { n: [1, 0, 0], lvl: 0.05, w: 1 });
    panel(m, [L / 2 - 0.9, -0.28, -W / 2], [0, 0, W], [0.9, H - 0.34, 0], PAL.shellHi, { n: [1, 0, 0], lvl: 0.05, w: 1 });
    // 车头风挡
    panel(m, [L / 2 - 0.02, 0.42, W / 2 - 0.18], [0, 0, -(W - 0.36)], [0.8, 1.66, 0], PAL.glass, { n: [1, 0, 0], lvl: 0.16, w: 0.7 });
    // 侧窗带 + 行李舱线
    panel(m, [-L / 2 + 0.30, 0.86, W / 2 + 0.005], [L - 1.3, 0, 0], [0, 1.20, 0], PAL.glass, { n: [0, 0, 1], lvl: 0.14, w: 0.7 });
    panel(m, [-L / 2 + 0.30, 0.86, -W / 2 - 0.005], [L - 1.3, 0, 0], [0, 1.20, 0], PAL.glass, { n: [0, 0, -1], lvl: 0.14, w: 0.7 });
    m.stroke([-L / 2 + 0.3, 0.20, W / 2 + 0.01], [L / 2 - 1.0, 0.20, W / 2 + 0.01], 0.45, 0.2);
    m.stroke([-L / 2 + 0.3, 0.20, -W / 2 - 0.01], [L / 2 - 1.0, 0.20, -W / 2 - 0.01], 0.45, 0.2);
    for (let i = 0; i < 6; i++) {
      const x = -L / 2 + 0.9 + i * 1.5;
      m.stroke([x, 0.24, W / 2 + 0.01], [x, 0.74, W / 2 + 0.01], 0.42, 0.22);
      m.stroke([x, 0.24, -W / 2 - 0.01], [x, 0.74, -W / 2 - 0.01], 0.42, 0.22);
    }
    // 车顶行李罩
    addBox(m, -L / 2 + 0.6, H - 0.62, -0.85, L / 2 - 1.4, H - 0.30, 0.85, PAL.dark, { lvl: 0.2, w: 0.7 });
    m.accent("poly", { pts: [[L / 2 + 0.02, 0.10, 0.90], [L / 2 + 0.02, 0.44, 1.20], [L / 2 + 0.02, 0.44, 0.90]], col: PAL.light, glow: 0.9 });
    m.accent("poly", { pts: [[L / 2 + 0.02, 0.10, -1.20], [L / 2 + 0.02, 0.44, -0.90], [L / 2 + 0.02, 0.44, -1.20]], col: PAL.light, glow: 0.9 });
    for (const x of [3.6, -2.8, -3.9]) {
      addWheel(m, x, -0.60, 1.30, 0.94, 0.54, 0.36, 0.32);
      addWheel(m, x, -0.60, -1.30, -0.94, 0.54, 0.36, 0.32);
    }
    m.size = { w: L, h: H, d: W };
    m.ground = -1.14;
  }

  /* ─────────── 人物：骑行者（人 + 自行车 + 货箱） ─────────── */
  function buildRider(m, withCargo) {
    // 车轮
    addWheel(m, -0.62, -0.42, 0.10, -0.10, 0.40, 0.20, 0.10);
    addWheel(m, 0.62, -0.42, 0.10, -0.10, 0.40, 0.20, 0.10);
    // 车架
    const HUB_R = [-0.62, -0.42, 0], HUB_F = [0.62, -0.42, 0];
    const BB = [-0.05, -0.30, 0], SEAT = [-0.36, 0.16, 0], HEAD = [0.42, 0.30, 0];
    const bars = [
      [HUB_R, BB], [HUB_R, SEAT], [BB, SEAT], [BB, HEAD], [SEAT, HEAD], [HEAD, HUB_F]
    ];
    for (const b of bars) m.stroke(b[0], b[1], 0.75, 0.1);
    // 座管 / 车把
    m.stroke(SEAT, [-0.36, 0.30, 0], 0.6, 0.12);
    m.stroke(HEAD, [0.40, 0.52, 0], 0.6, 0.12);
    m.stroke([0.40, 0.52, -0.22], [0.40, 0.52, 0.22], 0.55, 0.14);
    m.stroke([0.36, 0.50, 0], [0.36, 0.50, 0.24], 0.5, 0.14);
    // 曲柄
    m.stroke(BB, [-0.05 + 0.14, -0.44, 0.16], 0.5, 0.18);
    m.stroke(BB, [-0.05 - 0.14, -0.30, -0.16], 0.5, 0.18);
    // 车座
    addBox(m, -0.50, 0.28, -0.10, -0.24, 0.36, 0.10, PAL.dark, { lvl: 0.18, w: 0.6 });
    // 人物：躯干
    addBox(m, -0.44, 0.34, -0.13, 0.02, 0.94, 0.13, PAL.shellHi, { lvl: 0.04, w: 0.9 });
    // 头
    addBox(m, -0.38, 0.98, -0.12, -0.14, 1.24, 0.12, PAL.shell, { lvl: 0.06, w: 0.8 });
    // 头盔
    addBox(m, -0.40, 1.16, -0.13, -0.12, 1.30, 0.13, PAL.dark, { lvl: 0.16, w: 0.6 });
    // 手臂（伸向车把）
    m.stroke([0.00, 0.86, 0.12], [0.22, 0.64, 0.18], 0.7, 0.12);
    m.stroke([0.22, 0.64, 0.18], [0.38, 0.54, 0.10], 0.6, 0.12);
    m.stroke([0.00, 0.86, -0.12], [0.22, 0.64, -0.18], 0.7, 0.12);
    m.stroke([0.22, 0.64, -0.18], [0.38, 0.54, -0.10], 0.6, 0.12);
    // 腿
    m.stroke([-0.40, 0.36, 0.11], [-0.16, 0.02, 0.16], 0.75, 0.12);
    m.stroke([-0.16, 0.02, 0.16], [-0.05, -0.30, 0.16], 0.65, 0.12);
    m.stroke([-0.40, 0.36, -0.11], [-0.16, 0.02, -0.16], 0.75, 0.12);
    m.stroke([-0.16, 0.02, -0.16], [-0.05, -0.30, -0.16], 0.65, 0.12);
    // 外卖后箱
    if (withCargo) {
      addBox(m, -0.86, 0.36, -0.24, -0.46, 0.94, 0.24, PAL.shell, { lvl: 0.1, w: 0.9 });
      m.stroke([-0.86, 0.44, 0.25], [-0.46, 0.44, 0.25], 0.5, 0.2);
      m.stroke([-0.86, 0.86, 0.25], [-0.46, 0.86, 0.25], 0.5, 0.2);
      m.stroke([-0.66, 0.40, 0.25], [-0.66, 0.90, 0.25], 0.45, 0.22);
      m.accent("poly", { pts: [[-0.80, 0.56, 0.25], [-0.52, 0.56, 0.25], [-0.66, 0.74, 0.25]], col: PAL.light, glow: 0.7 });
    }
    m.size = { w: 1.7, h: 1.8, d: 0.6 };
    m.ground = -0.82;
  }

  /* ─────────── 基础设施：路灯 ─────────── */
  function buildStreetLight(m) {
    // 基座
    addCylY(m, 0, 0, -1.62, -1.40, 0.26, 16, PAL.dark, { lvl: 0.04, w: 0.8 });
    addCylY(m, 0, 0, -1.44, -1.36, 0.30, 16, PAL.steel, { lvl: 0.12, w: 0.7 });
    // 灯杆
    addCylY(m, 0, 0, -1.40, 1.30, 0.11, 14, PAL.steel, { lvl: 0.02, w: 0.9 });
    // 悬臂
    m.stroke([0, 1.26, 0], [0.86, 1.44, 0], 1.0, 0.06);
    m.stroke([0.86, 1.44, 0], [1.16, 1.40, 0], 1.0, 0.06);
    m.stroke([0.30, 1.28, 0], [0.62, 1.40, 0], 0.5, 0.24);
    // 灯头
    addBox(m, 1.06, 1.22, -0.22, 1.62, 1.40, 0.22, PAL.shellHi, { lvl: 0.06, w: 0.9 });
    // 灯面（发光）
    addBox(m, 1.10, 1.16, -0.18, 1.58, 1.23, 0.18, PAL.light, { lvl: 0.18, w: 0.6, emissive: true });
    m.accent("poly", { pts: [[1.10, 1.16, 0.18], [1.58, 1.16, 0.18], [1.58, 1.16, -0.18], [1.10, 1.16, -0.18]], col: PAL.light, glow: 0.55 });
    // 检修门
    m.stroke([-0.02, -0.30, 0.115], [-0.02, 0.60, 0.115], 0.45, 0.24);
    m.stroke([0.11, -0.30, 0.115], [0.11, 0.60, 0.115], 0.45, 0.24);
    m.size = { w: 1.9, h: 3.1, d: 0.6 };
    m.ground = -1.62;
  }

  /* ─────────── 家电：空调外机（与 handoff-v7 同款比例与细节） ─────────── */
  function buildOutdoorUnit(m) {
    const W = 3.6, H = 2.5, D = 1.1;
    // 主体
    addBox(m, -W / 2, -H / 2, -D / 2, W / 2, H / 2, D / 2, PAL.shellHi, { lvl: 0, w: 1.2 });
    // 前面板
    panel(m, [-W / 2 + 0.05, -H / 2 + 0.05, D / 2 + 0.005], [W - 0.10, 0, 0], [0, H - 0.10, 0], PAL.shell, { n: [0, 0, 1], lvl: 0.04, w: 0.9 });
    // 风扇（凹槽）
    const fx = -0.61, fy = 0.03, fr = 1.02;
    m.accent("disc", { c: [fx, fy, D / 2 + 0.02], r: fr, axis: "z", col: PAL.dark, glow: 0.12, ring: true });
    m.accent("fan", { c: [fx, fy, D / 2 + 0.03], r: fr * 0.92, blades: 3, col: PAL.shell });
    // 风扇网格环
    for (let i = 1; i <= 5; i++) {
      const r = fr * (0.18 + i * 0.16);
      m.stroke([fx + r, fy - r, D / 2 + 0.035], [fx + r, fy + r, D / 2 + 0.035], 0.32, 0.3);
    }
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      m.stroke(
        [fx + Math.cos(a) * fr * 0.16, fy + Math.sin(a) * fr * 0.16, D / 2 + 0.035],
        [fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, D / 2 + 0.035],
        0.28, 0.32
      );
    }
    // 右侧检修门 / 格栅百叶
    panel(m, [0.57, -1.07, D / 2 + 0.01], [1.03, 0, 0], [0, 2.14, 0], PAL.shell, { n: [0, 0, 1], lvl: 0.08, w: 0.9 });
    for (let i = 0; i < 7; i++) {
      m.stroke([0.72, -0.86 + i * 0.13, D / 2 + 0.03], [1.40, -0.86 + i * 0.13, D / 2 + 0.03], 0.42, 0.26);
    }
    // 侧面散热鳍
    for (let i = 0; i < 13; i++) {
      const y = -1.01 + i * 0.165;
      m.stroke([W / 2 + 0.012, y, -0.43], [W / 2 + 0.012, y, 0.43], 0.5, 0.2);
    }
    // 顶盖
    for (let i = 0; i < 13; i++) {
      const v = 0.08 + i * 0.84 / 12;
      m.stroke([-W / 2 + 0.04, H / 2 + 0.012, -D / 2 + v], [W / 2 - 0.04, H / 2 + 0.012, -D / 2 + v], 0.36, 0.24);
    }
    // 背面散热网
    for (let i = 0; i < 20; i++) {
      m.stroke([-1.64, -1.08 + i * 0.111, -D / 2 - 0.012], [1.64, -1.08 + i * 0.111, -D / 2 - 0.012], 0.4, 0.22);
    }
    for (let i = 0; i < 18; i++) {
      m.stroke([-1.65 + i * 0.194, -1.10, -D / 2 - 0.014], [-1.65 + i * 0.194, 1.10, -D / 2 - 0.014], 0.34, 0.26);
    }
    // 支架
    for (const x of [-1.18, 1.18]) {
      addBox(m, x - 0.23, -H / 2 - 0.14, -0.36, x + 0.23, -H / 2, 0.36, PAL.steel, { lvl: 0.22, w: 0.7 });
    }
    // 管路
    m.stroke([1.81, 0.50, -0.34], [2.02, 0.50, -0.34], 0.7, 0.3);
    m.stroke([2.02, 0.50, -0.34], [2.02, 0.18, -0.34], 0.7, 0.3);
    m.stroke([2.02, 0.18, -0.34], [1.92, -0.02, -0.34], 0.7, 0.3);
    m.stroke([1.92, -0.02, -0.34], [2.02, -0.46, -0.34], 0.7, 0.3);
    m.stroke([2.02, -0.46, -0.34], [1.80, -0.86, -0.34], 0.7, 0.3);
    // 四角螺栓
    for (const [bx, by] of [[-1.62, -1.06], [-1.62, 1.06], [1.58, 1.06], [1.58, -1.06]]) {
      m.accent("disc", { c: [bx, by, D / 2 + 0.03], r: 0.05, axis: "z", col: PAL.steel, glow: 0.2 });
    }
    m.size = { w: W + 0.5, h: H + 0.3, d: D + 0.2 };
    m.ground = -H / 2 - 0.14;
  }

  /* ─────────── 子类型判定 ─────────── */
  function detectSubtype(category, labelEn) {
    const s = String(labelEn || "").toUpperCase();
    if (category === "vehicle") {
      if (s.indexOf("SEDAN") >= 0) return "sedan";
      if (s.indexOf("SUV") >= 0) return "suv";
      if (s.indexOf("BOX TRUCK") >= 0) return "truck";
      if (s.indexOf("COACH") >= 0) return "coach";
      if (s.indexOf("BUS") >= 0) return "bus";
      return "sedan";
    }
    if (category === "person") {
      if (s.indexOf("DELIVERY") >= 0) return "delivery";
      return "ebike";
    }
    if (category === "infrastructure") return "streetlight";
    if (category === "appliance") return "outdoorunit";
    return "default";
  }

  function buildModel(category, subtype) {
    if (window.ArchiveModels) { const detailed = window.ArchiveModels.build(category, subtype); if (detailed) { detailed.archiveKind=category==='person'?'rider':subtype;return detailed; } }
    const m = new Mesh();
    const st = subtype || detectSubtype(category);
    if (category === "person") buildRider(m, st === "delivery");
    else if (category === "vehicle") {
      if (st === "suv") buildSUV(m);
      else if (st === "truck") buildTruck(m);
      else if (st === "bus") buildBus(m);
      else if (st === "coach") buildCoach(m);
      else buildSedan(m);
    }
    else if (category === "infrastructure") buildStreetLight(m);
    else if (category === "appliance") buildOutdoorUnit(m);
    else buildSedan(m);
    m.archiveKind=category==='person'?'rider':st;
    return m;
  }

  /* ─────────── 渲染：实体（面片深度排序 + 渐变 + 描边 + 投影） ─────────── */
  const LIGHT = (function () {
    const v = [-0.42, 0.78, 0.58];
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  })();

  function shadeColor(c, k) {
    return "rgb(" +
      Math.round(clamp(c[0] * k, 0, 255)) + "," +
      Math.round(clamp(c[1] * k, 0, 255)) + "," +
      Math.round(clamp(c[2] * k, 0, 255)) + ")";
  }

  function renderSolid(ctx, m, o) {
    if (o.archive && window.ArchiveVisuals) return window.ArchiveVisuals.render(ctx, m, o);
    const w = o.w, h = o.h;
    const yaw = o.yaw, pitch = o.pitch == null ? -0.16 : o.pitch;
    const dist = 8.6;
    const scale = Math.min(w * 0.62 / m.size.w, h * 0.66 / m.size.h);
    const cx = w * 0.5, cy = h * 0.54;
    const P = p => {
      const q = Cam.rotate(p, yaw, pitch);
      const f = dist / (dist - q[2]);
      return [cx + q[0] * scale * f, cy - q[1] * scale * f, q[2]];
    };

    ctx.clearRect(0, 0, w, h);

    // 地面投影
    const g = P([0, m.ground, 0]);
    const gx = cx, gy = cy + (m.ground - 0) * 0 + (g[1] - cy) * 0.92 + scale * 0.10;
    const rad = Math.max(12, scale * m.size.w * 0.42);
    const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
    grd.addColorStop(0, "rgba(0,0,0,.78)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, 0.17);
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, TAU);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();

    // 面片按深度排序（远 → 近）
    const list = [];
    for (const f of m.faces) {
      const q = f.p.map(p => Cam.rotate(p, yaw, pitch));
      const z = q.reduce((sum, p) => sum + p[2], 0) / q.length;
      list.push({ f: f, q: q, z: z });
    }
    list.sort((a, b) => a.z - b.z);

    ctx.lineJoin = "round";
    for (const it of list) {
      const f = it.f;
      const pts = it.q.map(v => [cx + v[0] * scale * (dist / (dist - v[2])), cy - v[1] * scale * (dist / (dist - v[2]))]);
      // 亮度：由法线与光向决定
      let n = f.n;
      if (n) {
        const rn = Cam.rotate(n, yaw, pitch);
        const len = Math.hypot(rn[0], rn[1], rn[2]) || 1;
        n = [rn[0] / len, rn[1] / len, rn[2] / len];
      }
      const lam = n ? Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) : 0.7;
      const k = 0.55 + lam * 0.85;

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();

      const g2 = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      g2.addColorStop(0, shadeColor(f.c, k * 1.18));
      g2.addColorStop(1, shadeColor(f.c, k * 0.52));
      ctx.fillStyle = g2;
      ctx.fill();
      ctx.strokeStyle = "rgba(168,211,224," + (0.16 + lam * 0.30) + ")";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    // 高光细节（灯 / 玻璃 / 品牌标识）
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const a of m.accents) {
      if (a.type === "poly") {
        const pts = a.pts.map(p => P(p));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = "rgba(" + a.col.join(",") + "," + (0.55 * (a.glow == null ? 1 : a.glow)) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(200,240,252,.55)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (a.type === "disc") {
        const c = P(a.c);
        const r = a.r * scale * (dist / (dist - c[2]));
        ctx.beginPath();
        ctx.arc(c[0], c[1], Math.max(0.5, r), 0, TAU);
        if (a.ring) {
          ctx.strokeStyle = "rgba(168,211,224,.45)";
          ctx.lineWidth = 1.1;
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(" + a.col.join(",") + "," + (0.5 * (a.glow == null ? 1 : a.glow)) + ")";
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // 风扇叶片（旋转）
    const fan = m.accents.find(a => a.type === "fan");
    if (fan) {
      const c = P(fan.c);
      const r = fan.r * scale * (dist / (dist - c[2]));
      const ang = o.time * 1.6;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(c[0], c[1]);
      ctx.rotate(ang);
      for (let i = 0; i < fan.blades; i++) {
        ctx.save();
        ctx.rotate(i / fan.blades * TAU);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * 0.55, -r * 0.42, r * 0.92, -r * 0.10);
        ctx.quadraticCurveTo(r * 0.55, r * 0.16, 0, 0);
        ctx.closePath();
        ctx.fillStyle = "rgba(96,124,136,.72)";
        ctx.fill();
        ctx.strokeStyle = "rgba(190,232,246,.5)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // 描边（模型轮廓与细节线）
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (const wgt of [0.55, 0.85, 1.25]) {
      ctx.beginPath();
      let any = false;
      for (const e of m.edges) {
        if (e.w > wgt + 0.01 || e.w <= wgt - 0.36) continue;
        const a = P(e.a), b = P(e.b);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        any = true;
      }
      if (!any) continue;
      ctx.strokeStyle = "rgba(168,211,224," + (wgt === 1.25 ? 0.55 : wgt === 0.85 ? 0.34 : 0.2) + ")";
      ctx.lineWidth = wgt === 1.25 ? 1.05 : wgt === 0.85 ? 0.7 : 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ─────────── 渲染：线网扫描（逐级揭示 + 旋转 + 频闪带） ─────────── */
  function renderScan(ctx, m, o) {
    if(m.cleanWire && window.RiderGeometry) return window.RiderGeometry.render(ctx,m,o);
    const w = o.w, h = o.h;
    const yaw = o.yaw, pitch = o.pitch == null ? 0.20 : o.pitch;
    const dist = 8.6;
    const scale = Math.min(w * 0.62 / m.size.w, h * 0.66 / m.size.h);
    const cx = w * 0.5, cy = h * 0.54;
    const P = p => {
      const q = Cam.rotate(p, yaw, pitch);
      const f = dist / (dist - q[2]);
      return [cx + q[0] * scale * f, cy - q[1] * scale * f, q[2]];
    };
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    const frame = Math.floor(o.time / 85);
    const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    // 揭示进度：主体轮廓（lvl 低）优先出现，细节随后
    const completion = o.completion == null ? 1 : o.completion;
    for (const e of m.edges) {
      // 归一化揭示阈值：主体边立刻出现，细节边按进度依次补齐
      const threshold = e.lvl * 1.15;
      if (threshold > completion * 1.15) continue;
      const a = P(e.a), b = P(e.b);
      const band = Math.floor(a[1] / 21);
      if (hash(band + frame * 0.031) > 0.92) continue;
      const fade = 0.42 + hash(band + Math.floor(frame / 3) * 7) * 0.58;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = "rgba(164,219,237," + (fade * 0.8) + ")";
      ctx.lineWidth = e.w >= 1.1 ? 1.15 : e.w >= 0.8 ? 0.8 : 0.58;
      ctx.stroke();
    }
    // 扫描粒子
    for (let i = 0; i < 90; i++) {
      const s = hash(i + frame * 0.03);
      if (s > completion * 0.8) continue;
      const x = cx + (hash(i * 13) - 0.5) * scale * m.size.w * 1.3;
      const y = cy + (hash(i * 17) - 0.5) * scale * m.size.h * 1.5;
      if (hash(i + frame) > 0.55) continue;
      ctx.fillStyle = "rgba(172,225,243," + (0.08 + s * 0.26) + ")";
      ctx.fillRect(x, y, hash(i * 21) > 0.85 ? 6 : 1.4, 1.1);
    }
    ctx.restore();
  }

  /* ─────────── 动画播放器：扫描 → 实体 ─────────── */
  class Player {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.model = null;
      this.raf = null;
      this.phase = "idle";     // idle | scan | solid
      this.start = 0;
      this.duration = 2100;
      this.onDone = null;
      this.reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
      this.resize();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      // The acquisition frame opens with scale(.28,.02). Bounding rects include
      // that transform; using them permanently squashes the rendered model.
      // Match ac-archive/MeshLoader: projection uses untransformed layout size.
      this.w = Math.max(1, this.canvas.clientWidth || r.width || 300);
      this.h = Math.max(1, this.canvas.clientHeight || r.height || 240);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /* 切换绘制目标画布（扫描画布 ↔ 档案实体画布） */
    attach(canvas) {
      if (!canvas || canvas === this.canvas) return;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.resize();
    }
    /* 扫描阶段：线网逐级揭示 + 旋转 */
    play(category, subtype, opts) {
      opts = opts || {};
      this.model = buildModel(category, subtype);
      this.duration = opts.duration || 2100;
      this.onDone = opts.onDone || null;
      this.phase = "scan";
      this.start = opts.started ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
      this.resize();
      if (this.raf) cancelAnimationFrame(this.raf);
      const loop = (time) => {
        const elapsed = time - this.start;
        const p = clamp(elapsed / this.duration, 0, 1);
        const frame=window.ArchiveSequence.frame(elapsed,this.duration);
        const yaw = this.reduced ? 0 : frame.yaw;
        const completion = frame.completion;
        const opacity = frame.objectOpacity;
        if (this.phase === "scan") {
          renderScan(this.ctx, this.model, {
            w: this.w, h: this.h, yaw: yaw, time: time,
            completion: completion, opacity: opacity
          });
        } else {
          renderSolid(this.ctx, this.model, {
            w: this.w, h: this.h,
            yaw: -0.62, archive: true,
            time: time
          });
        }
        if (this.phase === "scan" && p >= 1) {
          this.phase = "solid";
          if (this.onDone) this.onDone();
        }
        if (this.phase !== "idle") this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    /* 直接进入实体阶段 */
    showSolid(category, subtype) {
      this.model = buildModel(category, subtype);
      this.phase = "solid";
      this.start = performance.now();
      this.resize();
      if (this.raf) cancelAnimationFrame(this.raf);
      const loop = (time) => {
        if (this.phase !== "solid") return;
        renderSolid(this.ctx, this.model, {
          w: this.w, h: this.h,
          yaw: this.reduced ? -0.62 : -0.62 + Math.sin(time * 0.00015) * 0.045, archive: true,
          time: time
        });
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.phase = "idle";
      if (this.ctx) this.ctx.clearRect(0, 0, this.w || 1, this.h || 1);
    }
  }

  window.ModelEngine = {
    Mesh: Mesh,
    primitives: { box: addBox, wheel: addWheel, cylinderY: addCylY, panel: panel },
    buildModel: buildModel,
    detectSubtype: detectSubtype,
    renderSolid: renderSolid,
    renderScan: renderScan,
    Player: Player
  };
})();
