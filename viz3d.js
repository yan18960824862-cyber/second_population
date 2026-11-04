/* ════════════════════════════════════════════════════════════════════════
   viz3d.js — SECOND POPULATION 核心数据可视化（Three.js）
   ------------------------------------------------------------------------
   模块划分（职责单一，可独立替换）：
     viz/data-model.js   数据读取 / 插值 / 指数 / 来源与口径
     viz/fields.js       两套独立粒子场生成器 + 共享着色器
     viz/targets.js      工业物体实例 / 拾取 / 面部转译 / 局部放大镜
     viz/ui.js           统计面板 / 时间轴 / 图例 / 详情面板（DOM 层）
     viz3d.js            场景装配 + 渲染循环 + 交互状态机（本文件）

   视觉编码一览（界面图例同步说明）：
     · 时间（1950—2025）  → 时间轴位置 + 工业场沉积层的 Y 高度
     · 工业累计量        → 工业场可见粒子比例（峰值归一化）
     · 人口总量          → 人口场可见粒子比例（峰值归一化）
     · 增长趋势可比      → 相对增长指数（1950=100），两者同尺度
     · 粒子大小          → 深度层次（近大远小），非数据量
     · 颜色              → 区分两套系统（电光蓝 / 冰蓝白）
   ════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { EffectComposer } from './vendor/three/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/jsm/postprocessing/OutputPass.js';

import { DataModel, SOURCES, YEAR_MIN, YEAR_MAX, INDEX_BASE_YEAR } from './viz/data-model.js';
import { buildObjectField, buildHumanField } from './viz/fields.js';
import { buildIndustrialTargets, createPicker, createFocusLens } from './viz/targets.js';
import { FACE_PROFILE } from './viz/face-params.js';
import { VizUI } from './viz/ui.js';

/* ═════════════ 1. 集中视觉参数 ═════════════ */
const VP = {
  camera: {
    fov: 46,
    distance: 11.2,
    height: 0.55,
    driftX: 0.26, driftY: 0.16, driftSpeed: 0.075
  },
  object: {                            // 左：工业制成品
    particleCount: 9000,
    layers: 12,                        // 沉积层数
    lanes: 3,                          // 浇筑流道数
    radius: 1.72, height: 4.4, depthScale: 0.70,
    baseY: -2.35,
    sizeMin: 0.075, sizeMax: 0.165,   // 世界单位；投影后约 2.5–6px
    colorA: 0x0b3f8f, colorB: 0x74c8ff,   // 深电蓝 → 电光蓝
    highlightRatio: 0.012,
    seed: 20251020
  },
  human: {                             // 右：世界人口
    particleCount: 21000,
    cores: 12,                          // 密度核数量
    radius: 2.00, height: 4.4, depthScale: 0.90,
    baseY: -0.10,
    sizeMin: 0.055, sizeMax: 0.115,
    colorA: 0x4aa8d8, colorB: 0xf2fbff,   // 冰蓝 → 近白
    highlightRatio: 0.010,
    seed: 20251105
  },
  targets: {
    seed: 8811
  },
  global: {
    backgroundColor: 0x03050a,
    bloomStrength: 0.20, bloomRadius: 0.34, bloomThreshold: 0.92,
    exposure: 1.0,
    animationSpeed: 1.0,
    scanSpeed: 0.085,
    pixelRatioMax: 1.5,
    playbackRate: 3.2,
    systemGap: 2.05          // 两套系统中心的横向间距（各自局部半径约 2.1）
  }
};

/* ═════════════ 2. 时间轴控制器 ═════════════ */
function TimelineController() {
  const subs = [];
  const state = {
    currentYear: YEAR_MIN,
    isPlaying: true,
    playbackRate: VP.global.playbackRate,
    minYear: YEAR_MIN,
    maxYear: YEAR_MAX
  };
  function emit() { for (const cb of subs) cb(state); }
  return {
    state,
    subscribe(cb) { subs.push(cb); },
    setYear(y) {
      state.currentYear = Math.max(state.minYear, Math.min(state.maxYear, y));
      emit();
    },
    play() {
      if (state.currentYear >= state.maxYear) state.currentYear = state.minYear;
      state.isPlaying = true; emit();
    },
    pause() { state.isPlaying = false; emit(); },
    toggle() { state.isPlaying ? this.pause() : this.play(); },
    reset() { state.currentYear = state.minYear; state.isPlaying = false; emit(); },
    setRate(r) { state.playbackRate = r; emit(); },
    tick(dt) {
      if (!state.isPlaying) return;
      state.currentYear += dt * state.playbackRate;
      if (state.currentYear >= state.maxYear) { state.currentYear = state.maxYear; state.isPlaying = false; }
      emit();
    }
  };
}

/* ═════════════ 3. 主模块 ═════════════ */
export function initViz3D(opts) {
  const { canvas, controls } = opts;
  const plotEl = canvas.parentElement;

  /* ── 渲染器 ── */
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, powerPreference: 'high-performance'
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, VP.global.pixelRatioMax);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(VP.global.backgroundColor, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(VP.global.backgroundColor, 0.020);

  const camera = new THREE.PerspectiveCamera(VP.camera.fov, 1, 0.1, 100);
  camera.position.set(0, VP.camera.height, VP.camera.distance);
  camera.lookAt(0, 0, 0);

  /* ── 两套粒子场（位置生成独立，共享时间/渲染） ── */
  const objectField = buildObjectField(VP.object);
  const humanField = buildHumanField(VP.human);
  // 左右并列：两套系统各占画布一半，中间留出分隔带（对应 overlay 中的 .dv-sep）
  const halfGap = VP.global.systemGap;
  objectField.points.position.x = -halfGap;
  humanField.points.position.x = halfGap;
  scene.add(objectField.points, humanField.points);

  /* ── 工业物体实例（与 tracks.json 真实记录关联） ── */
  let targets = { group: new THREE.Group(), targets: [] };
  let trackRecords = [];
  function applyTargets(records) {
    if (targets.group.parent) scene.remove(targets.group);
    targets.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    // 目标位置需贴合工业粒子场的空间结构，故补齐工业场几何参数
    targets = buildIndustrialTargets(
      Object.assign({ seed: VP.targets.seed }, VP.object), records);
    // 目标属于工业侧，跟随工业场一起左移，保证与粒子场真实空间关系
    targets.group.position.x = -halfGap;
    scene.add(targets.group);
    picker.setCandidates(targets.targets);
    ui.setTargets(targets.targets);
  }

  /* ── 后期处理（仅高亮粒子参与 bloom，不整体糊化） ── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1),
    VP.global.bloomStrength, VP.global.bloomRadius, VP.global.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ── 时间轴 ── */
  const timeline = TimelineController();

  /* ── 拾取 / 放大镜 ── */
  const picker = createPicker();
  const lens = createFocusLens(renderer, scene);

  /* ── UI 层 ── */
  const ui = VizUI({
    controls,
    dataModel: DataModel,
    sources: SOURCES,
    baseYear: INDEX_BASE_YEAR,
    faceProfile: FACE_PROFILE,
    onSeek: (y) => { timeline.pause(); timeline.setYear(y); },
    onToggle: () => timeline.toggle(),
    onReset: () => timeline.reset(),
    onRate: (r) => timeline.setRate(r),
    onFullscreen: () => {
      const on = !document.body.classList.contains('dv-fullscreen');
      document.body.classList.toggle('dv-fullscreen', on);
      controls.fullBtn.textContent = on ? '退出全屏' : '全屏分析';
      controls.fullBtn.setAttribute('aria-pressed', String(on));
      requestAnimationFrame(() => { sizeOf(); ui.layout(); });
    }
  });

  /* ═════ 4. 交互状态机（待机 / 悬停 / 锁定） ═════ */
  const state = {
    hovered: null,      // 当前悬停目标
    locked: null,       // 锁定的目标（优先）
    pointer: { x: -999, y: -999, inside: false }
  };

  function currentFocus() { return state.locked || state.hovered; }

  function setFocus(target) {
    // 锁定时，悬停不改变焦点
    if (state.locked) {
      state.hovered = target;
      ui.setHover(target);
      return;
    }
    if (state.hovered === target) return;
    state.hovered = target;
    applyFocusUniforms();
    ui.setHover(target);
  }

  function lockTarget(target) {
    if (!target) { state.locked = null; applyFocusUniforms(); ui.setLock(null); return; }
    state.locked = target;
    applyFocusUniforms();
    ui.setLock(target);
  }

  function applyFocusUniforms() {
    const f = currentFocus();
    for (const field of [objectField, humanField]) {
      const u = field.mat.uniforms;
      if (f) {
        u.uFocusPos.value.copy(f.worldPos);
        u.uFocusRadius.value = 1.5;
        u.uFocusStrength.value = 1;
      } else {
        u.uFocusStrength.value = 0;
      }
    }
    // 面部转译：聚焦时显现
    for (const t of targets.targets) {
      t.faceTarget = (f && t === f) ? 1 : 0;
    }
  }

  /* ═════ 5. 尺寸 / 布局 ═════ */
  let W = 1, H = 1, dpr = pixelRatio;
  function sizeOf() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    bloom.setSize(W, H);
    camera.aspect = W / H;
    // 窄容器（手机竖排）时拉远，保证两套系统都完整可见
    camera.position.z = VP.camera.distance * (camera.aspect < 0.85 ? 1.42 : 1.0);
    camera.updateProjectionMatrix();
    return { w: W, h: H };
  }
  let dims = sizeOf();

  /* ═════ 6. 数据 → 渲染 同步 ═════ */
  function applyYear() {
    const yr = timeline.state.currentYear;
    const d = DataModel.get(yr);
    objectField.mat.uniforms.uYear.value = yr;
    objectField.mat.uniforms.uVisibleFraction.value = d.industrialFraction;
    humanField.mat.uniforms.uYear.value = yr;
    humanField.mat.uniforms.uVisibleFraction.value = d.populationFraction;
    ui.update(d, timeline.state);
  }
  timeline.subscribe(applyYear);

  /* ═════ 7. 交互事件 ═════ */
  function localPointer(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function onMove(ev) {
    const p = localPointer(ev);
    state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.inside = true;
    ui.pointer.x = p.x; ui.pointer.y = p.y;
    const res = picker.pick(p.x, p.y, camera, W, H, 46);
    // 锁定状态：悬停不改变锁定焦点，详情面板仍显示锁定对象
    if (state.locked) {
      state.hovered = res.target;
      ui.setHover(res.target);
      return;
    }
    setFocus(res.target);
  }
  function onLeave() {
    state.pointer.inside = false;
    state.hovered = null;
    if (!state.locked) { applyFocusUniforms(); }
    ui.setHover(null);
  }
  function onClick(ev) {
    const p = localPointer(ev);
    const res = picker.pick(p.x, p.y, camera, W, H, 46);
    if (res.target) {
      if (state.locked === res.target) lockTarget(null);
      else lockTarget(res.target);
    } else {
      lockTarget(null);
    }
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  /* ═════ 8. 扫描线（克制，扫过目标时触发高亮 + 日志） ═════ */
  let scanY = 0;
  function updateScan(dt) {
    scanY += dt * VP.global.scanSpeed;
    if (scanY > 1.15) scanY = -0.15;
    ui.setScan(scanY);
    return scanY;
  }

  /* ═════ 9. 追踪框 DOM 跟随目标 ═════ */
  function updateBoxes() {
    const v = new THREE.Vector3();
    for (const t of targets.targets) {
      if (!t.box) continue;
      t.object.getWorldPosition(t.worldPos);
      v.copy(t.worldPos).project(camera);
      if (v.z < -1 || v.z > 1) { t.box.style.display = 'none'; continue; }
      const sx = (v.x * 0.5 + 0.5) * W;
      const sy = (-v.y * 0.5 + 0.5) * H;
      const dist = camera.position.distanceTo(t.worldPos);
      const sz = Math.max(26, Math.min(72, 560 / dist));
      // 可见性：锁定 > 悬停 > 扫描命中（常驻识别框，数量克制）
      const show = (state.locked === t) || (state.hovered === t) || t.lit;
      t.box.style.display = show ? 'block' : 'none';
      t.box.style.left = (sx - sz / 2) + 'px';
      t.box.style.top = (sy - sz / 2) + 'px';
      t.box.style.width = sz + 'px';
      t.box.style.height = sz + 'px';
    }
  }

  /* ═════════════ 10. 动画循环（单一 rAF） ═════════════ */
  let last = performance.now();
  let running = true;
  let lowPower = false;

  function loop(now) {
    if (!running) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) * VP.global.animationSpeed;
    last = now;
    timeline.tick(dt);

    const t = now * 0.001;
    objectField.mat.uniforms.uTime.value = t;
    humanField.mat.uniforms.uTime.value = t;
    objectField.mat.uniforms.uPixelRatio.value = dpr;
    humanField.mat.uniforms.uPixelRatio.value = dpr;
    // 点尺寸投影系数：使 aSize 的单位约等于 CSS 像素
    const projScale = H / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
    objectField.mat.uniforms.uProjScale.value = projScale;
    humanField.mat.uniforms.uProjScale.value = projScale;

    // 相机极轻微漂移（不持续晃动）
    camera.position.x = Math.sin(t * VP.camera.driftSpeed) * VP.camera.driftX;
    camera.position.y = VP.camera.height + Math.cos(t * VP.camera.driftSpeed * 0.72) * VP.camera.driftY;
    camera.lookAt(0, 0, 0);

    // 面部转译渐入
    for (const tg of targets.targets) {
      const sp = tg.faceTarget > tg.faceOpacity ? 6 : 3;
      tg.faceOpacity += (tg.faceTarget - tg.faceOpacity) * Math.min(1, dt * sp);
      tg.faceMat.opacity = tg.faceOpacity * 0.92;
      tg.faceGroup.visible = tg.faceOpacity > 0.01;
    }

    // 扫描线 → 目标高亮
    const sy = updateScan(dt);
    for (const tg of targets.targets) {
      tg.object.getWorldPosition(tg.worldPos);
      const v = tg.worldPos.clone().project(camera);
      if (v.z < -1 || v.z > 1) { tg.lit = false; continue; }
      const screenY = (-v.y * 0.5 + 0.5);
      const hit = Math.abs(sy - screenY) < 0.035;
      if (hit && !tg.lit) {
        tg.lit = true;
        ui.log(`SCAN / ${tg.trackingId} · ${tg.cls} · ${tg.clsZh}`);
      } else if (!hit) tg.lit = false;
    }

    composer.render();
    updateBoxes();

    // 放大镜（局部高分辨率重绘，非截图放大）
    const f = currentFocus();
    if (f) {
      const lp = ui.lensRect();
      if (lp) {
        lens.setRect({ x: lp.x * dpr, y: lp.y * dpr, w: lp.w * dpr, h: lp.h * dpr });
        lens.setActive(true);
        lens.render(camera, f.worldPos);
      }
    } else {
      lens.setActive(false);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ═════════════ 11. 尺寸与生命周期 ═════════════ */
  const ro = new ResizeObserver(() => { dims = sizeOf(); ui.layout(); });
  ro.observe(plotEl);
  window.addEventListener('resize', () => { dims = sizeOf(); ui.layout(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  });

  /* ═════════════ 12. 装配数据 ═════════════ */
  applyYear();
  ui.mount();
  ui.layout();

  // 载入 tracks.json（真实目标记录）→ 建立工业物体实例
  fetch('tracks.json')
    .then(r => r.json())
    .then(data => {
      trackRecords = data.objects || [];
      applyTargets(trackRecords);
    })
    .catch(err => {
      console.warn('[viz3d] tracks.json 载入失败，使用空目标集：', err);
      applyTargets([]);
    });

  return {
    timeline,
    refreshLabels: () => applyYear(),
    setYear: y => timeline.setYear(y),
    play: () => timeline.play(),
    pause: () => timeline.pause(),
    reset: () => timeline.reset(),
    get locked() { return state.locked; },
    get hovered() { return state.hovered; },
    /** 目标列表（供外部集成 / 测试读取真实目标与屏幕位置） */
    get targets() { return targets.targets; },
    /** 目标在画布中的屏幕坐标（与追踪框、详情面板同源） */
    targetScreenPos(t) {
      const v = t.worldPos.clone().project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * W,
        y: (-v.y * 0.5 + 0.5) * H,
        visible: v.z >= -1 && v.z <= 1
      };
    },
    /** 低性能模式：减少粒子 + 关闭 bloom */
    setLowPower(v) {
      lowPower = v;
      dpr = v ? 1 : pixelRatio;
      bloom.enabled = !v;
      sizeOf();
    },
    dispose() {
      running = false;
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      objectField.geom.dispose(); objectField.mat.dispose();
      humanField.geom.dispose(); humanField.mat.dispose();
      targets.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      composer.dispose();
      renderer.dispose();
    }
  };
}
