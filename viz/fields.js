/* ════════════════════════════════════════════════════════════════════════
   viz/fields.js — 两套独立的粒子场生成器
   ------------------------------------------------------------------------
   ObjectField（工业制成品 · 左侧）
     形态逻辑：**有向的工业沉积流**。不是一个锥体，而是一条
     「从顶部料口向下浇筑、逐层压实」的结构化料堆：
       · 12 个水平沉积层（layer），层与层之间有清晰的水平边界；
       · 每层内部有 3 条浇筑流道（flow lane），粒子沿流道下落，
         体现「持续制造 / 有方向的流动路径」；
       · 层半径随累计量扩张（r = r0 + k·累计比例），形成可见的横向扩张；
       · 层的厚度（压缩比）随年代变化：早期松散、后期压实，
         体现密度编码 = 局部聚集程度。
     视觉编码：
       · 层高度（Y）      → 制造年份（累计时间轴）
       · 可见粒子比例     → 累计制造量 / 峰值（相对规模）
       · 粒径            → 深度层次（近大远小），非数据量
       · 亮度（colorB混合）→ 层序（越新越亮）
       · 空间位置（XZ）   → 制造分区（flow lane 编号）

   HumanField（世界人口 · 右侧）
     形态逻辑：**有机群体聚落**。与工业场完全不同的分布规律：
       · 6 个非对称密度核（population cluster），位置 / 尺度 / 权重
         不同，形成有机的外轮廓与内部空隙；
       · 粒子在核内服从「各向异性高斯 + 径向包络」，不是球形；
       · 核权重随年份缓慢迁移（人口重心东移的抽象表达），
         但迁移量受控，不改变整体形态语言；
       · 可见粒子数 = 人口总量 / 峰值（时点总量语义，非累计）。
     视觉编码：
       · 可见粒子比例     → 人口总量 / 峰值（时点量）
       · 粒子在核内的疏密 → 局部聚集程度
       · 粒径            → 深度层次，非数据量
       · 亮度            → 所处核的规模权重

   两个场共享：同一时间轴、同一数据状态、同一渲染管理。
   两个场独立：位置算法、分布、运动规律、生长机制、密度函数、形态。
   ════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

/* ── 确定性随机（固定种子 → 刷新后形态稳定） ── */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 共享着色器 ────────────────────────────────────────────────────────
   属性：
     position  静态基础位置
     aBirth    制造/进入年份（工业累积语义）
     aSize     基础粒径
     aSeed     随机种子（相位 / 亮度扰动）
     aLayer    层序 0..1（工业=沉积层；人口=所在核的权重）
     aPhase    动画相位
     aOpacity  基础透明度
     aRank     稳定随机排序（人口场用：可见子集的空间随机采样）
     aHighlight 是否为高亮点（少量，参与 bloom）
   Uniform：
     uYear / uTime / uSizeScale / uPixelRatio
     uVisibleFraction  可见比例（0..1）
     uIsCumulative     1=按 birthYear 累积淡入；0=按 rank 阈值
     uColorA / uColorB 两端色
     uFocusX/uFocusY/uFocusZ  悬停聚焦中心（世界坐标）
     uFocusRadius  聚焦半径；uFocusStrength 聚焦强度（0=无聚焦）
   聚焦实现：距离聚焦中心近的粒子提亮 + 放大，其余粒子压暗，
   实现「其他非相关对象降低亮度以形成视觉焦点」。                    */
const COMMON_VERT = `
  attribute float aBirth;
  attribute float aSize;
  attribute float aSeed;
  attribute float aLayer;
  attribute float aPhase;
  attribute float aOpacity;
  attribute float aRank;
  attribute float aHighlight;
  uniform float uYear;
  uniform float uTime;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uVisibleFraction;
  uniform float uIsCumulative;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uFocusPos;
  uniform float uFocusRadius;
  uniform float uFocusStrength;
  uniform float uProjScale;
  varying float vAlpha;
  varying vec3  vColor;
  varying float vGlow;

  void main() {
    vec3 pos = position;

    // 人口场：受控的群体微动（不重排，仅小幅呼吸式漂移）
    float isHuman = 1.0 - uIsCumulative;
    float drift = sin(uTime * 0.20 + aPhase) * 0.035 * isHuman;
    pos.y += drift;
    pos.x += cos(uTime * 0.15 + aPhase * 1.31) * 0.028 * isHuman;
    pos.z += sin(uTime * 0.17 + aSeed * 6.2831) * 0.022 * isHuman;

    // 可见性
    float born = step(aBirth, uYear);
    float fadeIn = clamp((uYear - aBirth) / 1.4, 0.0, 1.0);
    float popVis = step(aRank, uVisibleFraction);
    float popFade = clamp(1.0 - abs(aRank - uVisibleFraction) / 0.045, 0.0, 1.0);
    float vis = mix(popVis * popFade, born * fadeIn, uIsCumulative);

    // 聚焦：距焦点近 → 放大提亮；远 → 压暗
    float d = distance(pos, uFocusPos);
    float inFocus = 1.0 - smoothstep(uFocusRadius * 0.45, uFocusRadius, d);
    float dim = mix(1.0, 0.22 + 0.78 * inFocus, uFocusStrength);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = aSize * uSizeScale * (0.62 + 0.38 * aLayer);
    // 透视缩放：aSize 以像素为单位，projScale 由主模块按视口高度与 fov 计算
    gl_PointSize = max(1.0, size * uPixelRatio * (uProjScale / max(0.1, -mv.z)))
                 * (1.0 + 0.55 * inFocus * uFocusStrength);
    vAlpha = aOpacity * vis * dim;
    vColor = mix(uColorA, uColorB, clamp(aLayer * 0.68 + aSeed * 0.32, 0.0, 1.0));
    vGlow = aHighlight * (1.0 + 1.4 * inFocus * uFocusStrength);
  }
`;
const COMMON_FRAG = `
  precision mediump float;
  varying float vAlpha;
  varying vec3  vColor;
  varying float vGlow;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // 清晰的核心 + 克制的光晕：避免大面积高斯模糊
    float core = smoothstep(0.5, 0.34, d);        // 边缘锐利
    float halo = smoothstep(0.5, 0.10, d) * 0.22;  // 弱光晕
    float a = (core * 0.88 + halo) * vAlpha;
    if (a < 0.014) discard;
    vec3 col = vColor;
    col += vGlow * vec3(0.50, 0.76, 1.0) * core * 0.95;
    gl_FragColor = vec4(col, a);
  }
`;

export function makeParticleMaterial(cfg, isCumulative) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uYear: { value: 1950 },
      uTime: { value: 0 },
      uSizeScale: { value: 1 },
      uPixelRatio: { value: 1 },
      uVisibleFraction: { value: 0 },
      uIsCumulative: { value: isCumulative ? 1 : 0 },
      uColorA: { value: new THREE.Color(cfg.colorA) },
      uColorB: { value: new THREE.Color(cfg.colorB) },
      uFocusPos: { value: new THREE.Vector3(0, 0, 0) },
      uFocusRadius: { value: 1.6 },
      uFocusStrength: { value: 0 },
      uProjScale: { value: 300 }
    },
    vertexShader: COMMON_VERT,
    fragmentShader: COMMON_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending
  });
}

function buildGeometry(N, pos, attrs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBirth', new THREE.BufferAttribute(attrs.birth, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(attrs.size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(attrs.seed, 1));
  g.setAttribute('aLayer', new THREE.BufferAttribute(attrs.layer, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(attrs.phase, 1));
  g.setAttribute('aOpacity', new THREE.BufferAttribute(attrs.opacity, 1));
  g.setAttribute('aRank', new THREE.BufferAttribute(attrs.rank, 1));
  g.setAttribute('aHighlight', new THREE.BufferAttribute(attrs.highlight, 1));
  g.computeBoundingSphere();
  return g;
}

/* ══════════════════════════════════════════════════════════════════════
   ObjectField — 工业制成品：有向沉积流 + 水平层理 + 浇筑流道
   ══════════════════════════════════════════════════════════════════════ */
export function buildObjectField(cfg) {
  const N = cfg.particleCount;
  const rand = mulberry32(cfg.seed);
  const pos = new Float32Array(N * 3);
  const birth = new Float32Array(N);
  const size = new Float32Array(N);
  const seed = new Float32Array(N);
  const layer = new Float32Array(N);
  const phase = new Float32Array(N);
  const opacity = new Float32Array(N);
  const rank = new Float32Array(N);
  const highlight = new Float32Array(N);

  const LAYERS = cfg.layers;                 // 沉积层数
  const LANES = cfg.lanes;                   // 浇筑流道数
  const rBase = cfg.radius * 0.42;           // 1950 年半径
  const rGrow = cfg.radius - rBase;          // 至峰值的扩张量
  const H = cfg.height;

  for (let i = 0; i < N; i++) {
    const li = Math.floor(rand() * LAYERS);          // 层索引（底→顶）
    const layerT = li / (LAYERS - 1);                // 0 底 1 顶
    const lane = Math.floor(rand() * LANES);
    const laneT = (lane + 0.5) / LANES;

    // 该层的制造年份：底层最早（1950），顶层最新（2025）
    const birthYear = 1950 + layerT * (2025 - 1950) + (rand() - 0.5) * 2.2;

    // 该层在峰值时的半径（随层序扩张：越上层半径越大 = 结构持续扩张）
    const rAtPeak = rBase + rGrow * Math.pow(layerT, 0.72);

    // 流道位置：沿角度分布的扇区，粒子有横向偏移（流道壁）
    const laneAngle = laneT * Math.PI * 2 + (rand() - 0.5) * (Math.PI * 2 / LANES) * 0.85;
    // 半径分布：靠边缘稀疏（流道壁），中心稍密
    const rNorm = Math.pow(rand(), 0.55);
    const rr = rAtPeak * (0.22 + 0.78 * rNorm);

    // 高度：层内压缩厚度。早期层（低 layerT）松散 → 厚；后期层压实 → 薄
    const compress = 0.55 + 0.45 * layerT;            // 压实度
    const y = cfg.baseY + (H * (0.06 + 0.94 * layerT))
            + (rand() - 0.5) * (H / LAYERS) * compress * 2.2;

    pos[i * 3]     = Math.cos(laneAngle) * rr;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(laneAngle) * rr * cfg.depthScale;

    birth[i] = birthYear;
    // 粒径：近大远小（z 越近越大）；不承载数据量含义
    const near = 1 + Math.max(0, pos[i * 3 + 2]) / (cfg.radius * cfg.depthScale) * 0.55;
    size[i] = (cfg.sizeMin + rand() * (cfg.sizeMax - cfg.sizeMin)) * near;
    seed[i] = rand();
    layer[i] = layerT;
    phase[i] = rand() * Math.PI * 2;
    // 透明度：层边缘略高、层中心略低 → 呈现层理边界
    opacity[i] = (0.42 + 0.40 * rand()) * (0.72 + 0.28 * rNorm);
    rank[i] = 0;
    highlight[i] = rand() < cfg.highlightRatio ? 1 : 0;
  }

  const geom = buildGeometry(N, pos, { birth, size, seed, layer, phase, opacity, rank, highlight });
  const mat = makeParticleMaterial(cfg, true);
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  return { points, geom, mat, cfg, kind: 'object' };
}

/* ══════════════════════════════════════════════════════════════════════
   HumanField — 世界人口：非对称密度核 + 各向异性有机分布
   ══════════════════════════════════════════════════════════════════════ */
export function buildHumanField(cfg) {
  const N = cfg.particleCount;
  const rand = mulberry32(cfg.seed);
  const pos = new Float32Array(N * 3);
  const birth = new Float32Array(N);
  const size = new Float32Array(N);
  const seed = new Float32Array(N);
  const layer = new Float32Array(N);
  const phase = new Float32Array(N);
  const opacity = new Float32Array(N);
  const rank = new Float32Array(N);
  const highlight = new Float32Array(N);

  // 密度核：位置 / 尺度 / 权重 互不相同（非对称 → 有机轮廓）
  // 核集中在中心区并向外围递减，避免形成彼此分离的孤立碎块
  const cores = [];
  for (let c = 0; c < cfg.cores; c++) {
    const t = (c + 0.5) / cfg.cores;
    const ang = t * Math.PI * 2 * 2.4 + rand() * 0.7;      // 黄金角螺旋铺开
    const rad = cfg.radius * (0.04 + 0.52 * Math.sqrt(t)) * (0.85 + rand() * 0.3);
    cores.push({
      x: Math.cos(ang) * rad,
      y: cfg.baseY + (rand() - 0.5) * cfg.height * 0.62,
      z: (rand() - 0.5) * cfg.radius * cfg.depthScale * 1.15,
      sx: 0.30 + rand() * 0.34,                       // 各向异性 x
      sy: 0.28 + rand() * 0.30,                       // 各向异性 y
      sz: 0.30 + rand() * 0.30,                       // 各向异性 z
      w: 1.5 - 0.85 * t + rand() * 0.5                // 中心密、外围疏
    });
  }
  const wsum = cores.reduce((s, c) => s + c.w, 0);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  for (let i = 0; i < N; i++) {
    // 按权重挑核
    let pick = rand() * wsum, ci = 0;
    for (; ci < cores.length; ci++) { pick -= cores[ci].w; if (pick <= 0) break; }
    const core = cores[Math.min(ci, cores.length - 1)];

    let x = core.x + gauss() * core.sx;
    let y = core.y + gauss() * core.sy;
    let z = core.z + gauss() * core.sz * cfg.depthScale;
    let edgeFade = 1;

    // 径向包络：整体轮廓为不规则球（多频扰动），而非正圆。
    // 软边界（按距离渐隐密度）而非硬截断，避免出现明显的球壳轮廓
    const dx = x, dy = y - cfg.baseY, dz = z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > cfg.radius) {
      const wobble = 0.86 + 0.14 * Math.sin(Math.atan2(dy, dx) * 3 + core.w * 4);
      const k = (cfg.radius * wobble) / d;
      // 边界处部分粒子被拉回，形成自然衰减的边缘
      const pull = rand() < 0.62 ? k : 1;
      x = dx * pull; y = cfg.baseY + dy * pull; z = dz * pull;
      edgeFade = 1 - Math.min(1, (d / cfg.radius - 1) * 1.6);
    }

    // 少量近景粒子 → 近大远小
    const near = rand() < 0.045;
    if (near) z += cfg.radius * 0.55 * cfg.depthScale;

    pos[i * 3]     = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;

    birth[i] = 1950;                        // 人口场不按年份累积
    const nearK = near ? 1.5 : 1;
    size[i] = (cfg.sizeMin + rand() * (cfg.sizeMax - cfg.sizeMin)) * nearK;
    seed[i] = rand();
    layer[i] = rand();
    phase[i] = rand() * Math.PI * 2;
    opacity[i] = (near ? 0.88 : 0.46 + rand() * 0.42) * (0.42 + 0.58 * edgeFade);
    rank[i] = rand();                       // 稳定随机 → 可见子集空间随机采样
    highlight[i] = rand() < cfg.highlightRatio ? 1 : 0;
  }

  const geom = buildGeometry(N, pos, { birth, size, seed, layer, phase, opacity, rank, highlight });
  const mat = makeParticleMaterial(cfg, false);
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  return { points, geom, mat, cfg, kind: 'human', cores };
}
