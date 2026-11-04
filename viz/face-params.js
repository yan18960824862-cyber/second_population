/* ════════════════════════════════════════════════════════════════════════
   viz/face-params.js — 面部特征转译层
   ------------------------------------------------------------------------
   概念：同一组人的面部特征被转译到不同工业物体上，使物体获得可辨认的
   人类表情表达；物体改变，身份特征保持稳定。

   数据性质（必须如实标注）：
     本项目尚未接入真实人脸采集 / 人脸识别。下方 FACE_PROFILE 是
     「演示用面部参数」（DEMO PARAMS），由项目自设的一组归一化五官参数
     构成，用于展示「同一组参数映射到不同物体几何」的转译机制。
     它不是任何真实人物的肖像，也不能被解读为已完成人脸识别。

   参数全部为归一化值（0..1 相对物体包围盒），因此可直接映射到任意
   尺寸 / 形状的物体表面，与几何解耦。
   ════════════════════════════════════════════════════════════════════════ */

export const FACE_PROFILE = {
  id: 'DEMO-PROFILE-01',
  label: '演示面部参数 DEMO',
  isRealCapture: false,
  note: '演示参数，非真实人脸采集结果；用于展示面部特征向工业物体的转译机制。',

  /* 眼部 */
  eyeY: 0.44,             // 眼睛高度（相对包围盒，0=底 1=顶）
  eyeSpacing: 0.30,       // 双眼间距（眼中心距 = 间距 × 物体宽度）
  eyeSize: 0.115,         // 眼睛半径（相对物体宽度）
  eyeAspect: 0.62,        // 眼睛宽高比
  eyeTilt: 0.06,          // 眼角上扬量（相对眼睛半径）

  /* 嘴部 */
  mouthY: 0.76,           // 嘴部高度
  mouthWidth: 0.26,       // 嘴宽（相对物体宽度）
  mouthCurve: 0.34,       // 嘴角曲率（正=微笑，负=下沉）
  mouthThickness: 0.022,  // 嘴线粗细（相对物体宽度）

  /* 眉（辅助识别） */
  browY: 0.545,
  browWidth: 0.20,
  browTilt: 0.12
};

/**
 * 把面部参数映射到某个物体的表面坐标。
 * @param {object} p     FACE_PROFILE
 * @param {object} box   物体包围盒 {w,h,d}（局部坐标尺寸）
 * @param {number} faceZ 面部朝向表面的 z 偏移（贴附于该表面）
 * @returns {object} 各五官在物体局部坐标系中的位置与尺寸
 */
export function mapFaceToObject(p, box, faceZ) {
  const w = box.w, h = box.h;
  const eyeDx = p.eyeSpacing * w * 0.5;         // 单眼水平偏移
  const eyeR = p.eyeSize * w;
  const mouthW = p.mouthWidth * w;
  const z = (faceZ === undefined ? box.d * 0.5 : faceZ);
  return {
    eyes: [
      { x: -eyeDx, y: (p.eyeY - 0.5) * h, z, rx: eyeR, ry: eyeR * p.eyeAspect, tilt: p.eyeTilt },
      { x:  eyeDx, y: (p.eyeY - 0.5) * h, z, rx: eyeR, ry: eyeR * p.eyeAspect, tilt: -p.eyeTilt }
    ],
    mouth: {
      x: 0,
      y: (p.mouthY - 0.5) * h,
      z,
      halfW: mouthW * 0.5,
      curve: p.mouthCurve * mouthW * 0.5,
      thickness: p.mouthThickness * w
    },
    brows: [
      { x: -eyeDx, y: (p.browY - 0.5) * h, z: z - 0.001, w: p.browWidth * w, tilt: p.browTilt },
      { x:  eyeDx, y: (p.browY - 0.5) * h, z: z - 0.001, w: p.browWidth * w, tilt: -p.browTilt }
    ]
  };
}

/**
 * 由面部参数生成一组「笔画点」，用于在物体表面绘制五官线条。
 * 眼睛 = 椭圆轮廓；嘴 = 二次曲线采样；眉 = 短线。
 * 返回 { eyes:[{pts:[x,y,z]...}], mouth:{pts:[...]}, brows:[{pts:[...]}] }
 * 全部为物体局部坐标。
 */
export function buildFaceStrokes(p, box, faceZ) {
  const f = mapFaceToObject(p, box, faceZ);
  const strokes = { eyes: [], mouth: null, brows: [] };

  // 眼睛：椭圆环（28 段）
  for (const e of f.eyes) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const lx = Math.cos(a) * e.rx;
      const ly = Math.sin(a) * e.ry;
      // 眼角上扬：随 x 方向抬升
      const lift = (lx / e.rx) * e.tilt * e.ry;
      pts.push([e.x + lx, e.y + ly + lift, e.z]);
    }
    strokes.eyes.push(pts);
  }

  // 嘴：二次曲线（嘴角上扬 → 中间下沉的微笑弧）
  const m = f.mouth;
  const mpts = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * 2 - 1;                // -1..1
    const x = t * m.halfW;
    // 嘴角在 t=±1 处上扬 m.curve，中心下沉
    const y = m.y - m.curve * (1 - t * t) * 0.5 + m.curve * 0.5;
    mpts.push([m.x + x, y, m.z]);
  }
  strokes.mouth = mpts;

  // 眉：短线（带倾斜）
  for (const b of f.brows) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * 2 - 1;
      pts.push([b.x + t * b.w * 0.5, b.y + t * b.tilt * b.w * 0.5, b.z]);
    }
    strokes.brows.push(pts);
  }
  return strokes;
}
