/* ════════════════════════════════════════════════════════════════════════
   viz/targets.js — 代表性工业物体 / 目标拾取 / 面部转译 / 局部放大
   ------------------------------------------------------------------------
   组成：
     · IndustrialTargets   在工业场中放置可辨认的工业物体实例
                            （车身 / 外壳 / 电芯 / 面板 / 驱动单元），
                            与粒子场共享同一空间坐标（不是浮在图形上方）。
     · TargetPicker        鼠标拾取：用屏幕空间最近邻（对投影后的目标
                            中心点）而非 Raycaster 遍历海量粒子，
                            保证与「追踪框对应同一实际对象」。
     · FaceTranslator      面部特征 → 物体表面线框（五官用 Line 绘制，
                            随物体几何缩放，身份参数全局唯一）。
     · FocusLens           局部放大镜：用独立的正交小相机 + scissor
                            渲染高分辨率局部，而非放大低分辨率截图。
   ════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { buildFaceStrokes, FACE_PROFILE } from './face-params.js';
import { mulberry32 } from './fields.js';

/* ── 工业物体原型（程序化几何，无需外部模型） ────────────────────────
   每个原型 = 包围盒尺寸 + 面部件构成 + 面部附着面。               */
export const OBJECT_PROTOTYPES = [
  {
    key: 'VEHICLE', cls: 'VEHICLE', zh: '车身总成',
    size: [1.05, 0.52, 0.66],
    parts: [
      { type: 'box', p: [0, 0, 0], s: [1.0, 0.34, 0.62] },
      { type: 'box', p: [-0.12, 0.26, 0], s: [0.52, 0.30, 0.56] },
      { type: 'cyl', p: [0.30, -0.10, 0.32], r: 0.13, h: 0.08, axis: 'z' },
      { type: 'cyl', p: [0.30, -0.10, -0.32], r: 0.13, h: 0.08, axis: 'z' },
      { type: 'cyl', p: [-0.32, -0.10, 0.32], r: 0.13, h: 0.08, axis: 'z' },
      { type: 'cyl', p: [-0.32, -0.10, -0.32], r: 0.13, h: 0.08, axis: 'z' }
    ],
    face: { x: 0, y: 0, z: 0.315, w: 0.5, h: 0.34, d: 0.62 }   // 贴在车身前面
  },
  {
    key: 'HOUSING', cls: 'APPLIANCE', zh: '外壳件',
    size: [0.72, 0.78, 0.52],
    parts: [
      { type: 'box', p: [0, 0, 0], s: [0.70, 0.76, 0.50] },
      { type: 'box', p: [0, 0, 0.26], s: [0.50, 0.54, 0.02] },
      { type: 'box', p: [0, 0.26, 0], s: [0.74, 0.06, 0.54] }
    ],
    face: { x: 0, y: 0, z: 0.27, w: 0.70, h: 0.76, d: 0.50 }
  },
  {
    key: 'CELL', cls: 'ENERGY CELL', zh: '电芯单元',
    size: [0.34, 0.62, 0.34],
    parts: [
      { type: 'cyl', p: [0, 0, 0], r: 0.17, h: 0.60, axis: 'y' },
      { type: 'cyl', p: [0, 0.31, 0], r: 0.08, h: 0.04, axis: 'y' }
    ],
    face: { x: 0, y: 0, z: 0.175, w: 0.34, h: 0.60, d: 0.34 }
  },
  {
    key: 'PANEL', cls: 'PANEL MODULE', zh: '面板模组',
    size: [0.86, 0.62, 0.10],
    parts: [
      { type: 'box', p: [0, 0, 0], s: [0.84, 0.60, 0.08] },
      { type: 'box', p: [0, 0, 0.06], s: [0.70, 0.46, 0.02] }
    ],
    face: { x: 0, y: 0, z: 0.08, w: 0.84, h: 0.60, d: 0.10 }
  },
  {
    key: 'MOTOR', cls: 'DRIVE UNIT', zh: '驱动单元',
    size: [0.56, 0.56, 0.42],
    parts: [
      { type: 'cyl', p: [0, 0, 0], r: 0.27, h: 0.40, axis: 'z' },
      { type: 'cyl', p: [0, 0, 0.24], r: 0.10, h: 0.10, axis: 'z' },
      { type: 'box', p: [0, -0.28, 0], s: [0.34, 0.10, 0.30] }
    ],
    face: { x: 0, y: 0, z: 0.25, w: 0.54, h: 0.54, d: 0.42 }
  }
];

/* ── 构建原型的几何体（线框风格：EdgesGeometry） ── */
function buildPrototypeGeometry(proto) {
  const geos = [];
  for (const part of proto.parts) {
    let g;
    if (part.type === 'box') {
      g = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]);
    } else {
      g = new THREE.CylinderGeometry(part.r, part.r, part.h, 16);
      if (part.axis === 'z') g.rotateX(Math.PI / 2);
    }
    g.translate(part.p[0], part.p[1], part.p[2]);
    geos.push(g);
  }
  // 合并
  const merged = mergeGeometries(geos);
  const edges = new THREE.EdgesGeometry(merged, 20);
  geos.forEach(g => g.dispose());
  merged.dispose();
  return edges;
}

/* 轻量的 BufferGeometry 合并（仅 position 属性） */
function mergeGeometries(list) {
  let total = 0;
  const nonIndexed = list.map(g => g.index ? g.toNonIndexed() : g);
  nonIndexed.forEach(g => { total += g.attributes.position.count; });
  const pos = new Float32Array(total * 3);
  let off = 0;
  for (const g of nonIndexed) {
    const a = g.attributes.position.array;
    pos.set(a, off);
    off += a.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  nonIndexed.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   IndustrialTargets — 工业场中的可辨认物体实例
   每个目标：trackingId / 类别 / 状态 / 所属区域 / 对应数据 / 追踪框
   数据来源：复用项目 tracks.json 中的真实目标记录（objectId / label /
   category / info），不伪造识别结果。
   ══════════════════════════════════════════════════════════════════════ */
export function buildIndustrialTargets(cfg, trackRecords) {
  const rand = mulberry32(cfg.seed);
  const group = new THREE.Group();
  const targets = [];
  const protoByKey = {};
  for (const p of OBJECT_PROTOTYPES) protoByKey[p.key] = p;

  // 从 tracks.json 挑工业类目标（排除 person）
  const pool = trackRecords.filter(r => r.category !== 'person');
  const picked = [];
  const used = new Set();
  for (const proto of OBJECT_PROTOTYPES) {
    // 依类别挑一条真实记录
    const cand = pool.find(r => !used.has(r.objectId) && (
      proto.cls === 'VEHICLE' ? r.category === 'vehicle' :
      proto.cls === 'APPLIANCE' ? r.category === 'appliance' :
      proto.cls === 'ENERGY CELL' ? r.category === 'vehicle' :
      proto.cls === 'PANEL MODULE' ? r.category === 'vehicle' :
      r.category === 'infrastructure' || r.category === 'vehicle'));
    if (!cand) continue;
    used.add(cand.objectId);
    picked.push({ proto, rec: cand });
  }

  picked.forEach((entry, i) => {
    const { proto, rec } = entry;
    const geo = buildPrototypeGeometry(proto);
    const mat = new THREE.LineBasicMaterial({
      color: 0x6ec4ff, transparent: true, opacity: 0.85, depthWrite: false
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 3;

    // 放置：贴近粒子场结构（工业场为层状沉积）。
    // 高度锚定在沉积堆的下部 —— 底部层自1950 年即存在，保证任何年份下
    // 目标都落在真实堆积体内，而不是悬浮在空场中。
    // 注意：tracks.json 中没有「制造年份」字段，故目标不按年份淡入淡出，
    // 而是作为固定参考样本常驻（详情面板中已注明）。
    const ang = (i / Math.max(1, picked.length)) * Math.PI * 2 + rand() * 0.5;
    const rad = cfg.radius * (0.26 + rand() * 0.34);
    const layerT = 0.14 + rand() * 0.34;                 // 落在下部 1/5 ~ 1/2 层区间
    const y = cfg.baseY + cfg.height * (0.06 + 0.94 * layerT);
    lines.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad * cfg.depthScale);
    lines.rotation.y = rand() * Math.PI * 2;
    group.add(lines);

    // 面部转译层（同一组参数 → 身份一致）
    const faceGroup = new THREE.Group();
    const strokes = buildFaceStrokes(FACE_PROFILE, proto.face);
    const faceMat = new THREE.LineBasicMaterial({
      color: 0xbfe8ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false
    });
    const addStroke = (pts) => {
      const g = new THREE.BufferGeometry().setFromPoints(
        pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
      const l = new THREE.Line(g, faceMat);
      l.renderOrder = 5;
      faceGroup.add(l);
    };
    strokes.eyes.forEach(addStroke);
    strokes.brows.forEach(addStroke);
    addStroke(strokes.mouth);
    // 面部层挂在物体上，跟随其变换
    lines.add(faceGroup);

    targets.push({
      trackingId: rec.objectId,
      label: rec.label,
      labelEn: rec.labelEn,
      cls: proto.cls,
      clsZh: proto.zh,
      category: rec.category,
      function: rec.function,
      conf: rec.conf != null ? rec.conf : 0.8,
      region: 'INDUSTRIAL FIELD · LAYER ' + (1 + Math.round(layerT * (cfg.layers - 1))),
      record: rec,
      object: lines,
      faceGroup, faceMat,
      faceOpacity: 0,
      faceTarget: 0,
      box: null,
      worldPos: new THREE.Vector3(),
      lit: false
    });
  });

  return { group, targets };
}

/* ══════════════════════════════════════════════════════════════════════
   TargetPicker — 屏幕空间最近邻拾取
   目标中心每帧投影到屏幕；鼠标位置取最近的目标（且在阈值内）。
   保证「鼠标指向的对象 / 追踪框 / 详情面板」是同一个数据对象。
   ══════════════════════════════════════════════════════════════════════ */
export function createPicker() {
  let candidates = [];
  const projected = [];

  function setCandidates(list) { candidates = list; }

  /**
   * @param {number} mx 鼠标 X（相对画布）
   * @param {number} my 鼠标 Y
   * @param {THREE.Camera} camera
   * @param {number} w 画布宽
   * @param {number} h 画布高
   * @param {number} threshold 拾取半径（像素）
   */
  function pick(mx, my, camera, w, h, threshold) {
    projected.length = 0;
    let best = null, bestD = threshold;
    const v = new THREE.Vector3();
    for (const t of candidates) {
      v.copy(t.worldPos).project(camera);
      if (v.z < -1 || v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const d = Math.hypot(sx - mx, sy - my);
      projected.push({ t, sx, sy, d });
      if (d < bestD) { bestD = d; best = t; }
    }
    return { target: best, projected };
  }

  return { setCandidates, pick, get projected() { return projected; } };
}

/* ══════════════════════════════════════════════════════════════════════
   FocusLens — 局部放大镜
   独立相机 + setScissor/setViewport 渲染高分辨率局部，
   不是复制低分辨率画面，因此放大后仍然锐利。
   ══════════════════════════════════════════════════════════════════════ */
export function createFocusLens(renderer, scene) {
  const lensCam = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  let active = false;
  let rect = { x: 0, y: 0, w: 0, h: 0 };

  function setActive(v) { active = v; }
  function setRect(r) { rect = r; }

  /** 渲染放大镜内容到主画布的指定区域 */
  function render(camera, focusPos) {
    if (!active) return;
    const { x, y, w, h } = rect;
    if (w < 8 || h < 8) return;

    lensCam.aspect = w / h;
    // 焦点稍微偏向物体中心上方，避免被自身遮挡
    const target = focusPos.clone();
    lensCam.position.set(target.x, target.y + 0.06, target.z + 1.05);
    lensCam.lookAt(target);
    lensCam.updateProjectionMatrix();

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    // 清掉该区域的颜色与深度，避免残留上一帧内容
    renderer.setClearColor(0x03050a, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, lensCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
    renderer.autoClear = prevAutoClear;
  }

  return { setActive, setRect, render, camera: lensCam, get active() { return active; } };
}
