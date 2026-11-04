/* ═══════════════════════════════════════════════════════════════════════
   GLITCH RUNTIME — 全屏视觉开场 + 信号劣化
   配色仅用 #000000 + #A8D3E0（含透明度层级）
   参考语法：chrislemke.github.io「Glitch Art」研究页
     · 双通道错位重影（单色青版）
     · clip-path + steps() 横向切片位移
     · SVG feTurbulence 噪声
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const TAU = Math.PI * 2;

  /* ═══════════════════════════════════════════════════════════════════
     1. 全屏 GLITCH 视觉引擎
     —— 监控视频作纹理，canvas 实时损坏处理
     管线：视频帧 → 青色调染色 → 通道分离 → 切片位移 → 块位移
           → 噪声 → 扫描线 → 鼠标磁吸故障
     ═══════════════════════════════════════════════════════════════════ */
  const Gfx = (function () {
    const canvas = $("bootCanvas");
    const video = $("bootVideo");
    if (!canvas || !video) return null;

    const ctx = canvas.getContext("2d", { alpha: false });
    let W = 0, H = 0, dpr = 1;

    /* 离屏画布：噪声瓦片 / 扫描线瓦片，避免每帧重建 */
    const noiseTile = document.createElement("canvas");
    noiseTile.width = noiseTile.height = 160;
    const nctx = noiseTile.getContext("2d");
    const nimg = nctx.createImageData(160, 160);
    (function seedNoise() {
      for (let i = 0; i < nimg.data.length; i += 4) {
        const v = 120 + Math.random() * 135;
        nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = v;
        nimg.data[i + 3] = 255;
      }
      nctx.putImageData(nimg, 0, 0);
    })();

    /* 扫描线瓦片（1×4，半透明黑行）→ 一次 pattern 填充替代每帧数百次 fillRect */
    const scanTile = document.createElement("canvas");
    scanTile.width = 1;
    scanTile.height = 4;
    const sctx = scanTile.getContext("2d");
    sctx.fillStyle = "rgba(0,0,0,.42)";
    sctx.fillRect(0, 2, 1, 2);
    const scanPattern = ctx.createPattern(scanTile, "repeat");

    /* 鼠标状态：位置 + 平滑后的位置 + 是否悬停可交互元素 */
    const mouse = { x: -999, y: -999, sx: -999, sy: -999, hot: false, active: false };

    /* 故障状态：随时间起伏，鼠标附近加剧 */
    let t = 0;
    let baseIntensity = 0.35;

    function resize() {
      /* 限制内部分辨率：glitch 背景为噪声质感，dpr 1.5 足够且大幅减负 */
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      /* 同时硬性限制 backing store 长边，避免 4K 屏每帧 8M+ 像素运算 */
      const maxDim = 2200;
      let bw = Math.round(W * dpr), bh = Math.round(H * dpr);
      if (Math.max(bw, bh) > maxDim) {
        const s = maxDim / Math.max(bw, bh);
        dpr *= s;
      }
      W = Math.max(1, canvas.clientWidth);
      H = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }

    /* 主渲染：一帧 */
    function frame(dt) {
      t += dt;
      if (!W || !H) return;

      /* 鼠标平滑跟随（惯性） */
      mouse.sx += (mouse.x - mouse.sx) * 0.18;
      mouse.sy += (mouse.y - mouse.sy) * 0.18;

      /* 基础故障强度：慢波 + 偶发尖峰 */
      const wave = 0.5 + 0.5 * Math.sin(t * 0.0009);
      const spike = Math.random() < 0.012 ? rnd(1.4, 2.6) : 1;
      let I = baseIntensity * (0.7 + wave * 0.6) * spike;

      /* 鼠标磁吸：越靠近光标，故障越强 */
      if (mouse.active) {
        I *= 1 + (mouse.hot ? 2.6 : 0.9);
      }

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const vReady = video.readyState >= 2;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      if (!vReady) {
        /* 视频未就绪：画静态故障网格兜底 */
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "rgba(168,211,224,.3)";
        ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 24) {
          ctx.beginPath();
          ctx.moveTo(0, y + Math.sin(t * 0.002 + y * 0.05) * 6);
          ctx.lineTo(W, y + Math.sin(t * 0.002 + y * 0.05) * 6);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      /* ── 1) 视频铺满（cover 裁剪），带轻微视差缩放 ── */
      const scale = 1.06 + Math.sin(t * 0.0006) * 0.012;
      const sw = vw * scale, sh = vh * scale;
      const sx = (vw - sw) / 2 + (mouse.active ? (mouse.sx - W / 2) * -0.008 : 0);
      const sy = (vh - sh) / 2 + (mouse.active ? (mouse.sy - H / 2) * -0.008 : 0);

      ctx.save();
      /* 中档压暗：保住暗部细节（右侧街景），又给文字留可读空间 */
      ctx.filter = "grayscale(1) contrast(1.15) brightness(0.52)";
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      ctx.restore();

      /* ── 2) 青色调染色：用 'color' 合成保留亮度、替换色相 ── */
      ctx.save();
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "#A8D3E0";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      /* ── 3) 暗部提细节：soft-light 把死黑区（右侧街景）的层次拉出来 ── */
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.55;
      ctx.filter = "grayscale(1) contrast(1.5) brightness(1.6)";
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      ctx.restore();
      ctx.filter = "none";

      /* ── 4) 双通道分离：复制两次错位的青调版（模拟 RGB split） ── */
      const splitPx = (2 + I * 7) * (Math.random() < 0.35 ? 1.8 : 1);
      const dirA = Math.random() < 0.5 ? -1 : 1;

      for (let k = 0; k < 2; k++) {
        const off = (k === 0 ? -splitPx : splitPx * 0.8) * dirA;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = k === 0 ? 0.4 : 0.26;
        /* 只取视频的一个横条区域，制造通道错位 */
        const bandY = rnd(0, H * 0.7);
        const bandH = rnd(H * 0.12, H * 0.55);
        ctx.drawImage(canvas, 0, bandY * dpr, W * dpr, bandH * dpr, off, bandY, W, bandH);
        ctx.restore();
      }

      /* ── 5) 横向切片位移：随机横条整块左右跳 ── */
      const nSlices = Math.round(1 + I * 3);
      for (let i = 0; i < nSlices; i++) {
        const sy2 = rnd(0, H * 0.94);
        const sh2 = rnd(H * 0.012, H * 0.09);
        const dx = rnd(-1, 1) * (6 + I * 26);
        ctx.save();
        ctx.globalAlpha = rnd(0.55, 0.95);
        ctx.drawImage(canvas,
          0, sy2 * dpr, W * dpr, sh2 * dpr,
          dx, sy2, W, sh2);
        ctx.restore();
        /* 切片边缘加一道青色亮线 */
        if (Math.random() < 0.7) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = "#A8D3E0";
          ctx.fillRect(0, sy2, W, 1);
          ctx.restore();
        }
      }

      /* ── 6) 块状位移（datamosh 感）：随机矩形从错位位置取 ── */
      if (I > 0.5) {
        const nBlocks = Math.round(rnd(1, 3));
        for (let i = 0; i < nBlocks; i++) {
          const bw = rnd(W * 0.08, W * 0.3);
          const bh = rnd(H * 0.05, H * 0.2);
          const bx = rnd(0, W - bw);
          const by = rnd(0, H - bh);
          ctx.save();
          ctx.globalAlpha = rnd(0.6, 0.9);
          ctx.drawImage(canvas,
            bx * dpr, by * dpr, bw * dpr, bh * dpr,
            bx + rnd(-1, 1) * (8 + I * 30), by + rnd(-1, 1) * 4, bw, bh);
          ctx.restore();
        }
      }

      /* ── 7) 鼠标周围的局部故障增强（磁吸核心） ── */
      if (mouse.active) {
        const R = mouse.hot ? 240 : 150;
        const gx = mouse.sx, gy = mouse.sy;
        /* 以光标为中心叠几道错位横条 */
        const n = mouse.hot ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const hh = rnd(4, 26);
          const yy = gy + rnd(-R, R);
          const dx = rnd(-1, 1) * (mouse.hot ? 26 : 12);
          ctx.save();
          ctx.globalAlpha = rnd(0.25, 0.6);
          ctx.drawImage(canvas,
            0, yy * dpr, W * dpr, hh * dpr,
            dx, yy, W, hh);
          ctx.restore();
        }
        /* 光标青色光晕 */
        const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
        rg.addColorStop(0, "rgba(168,211,224,.16)");
        rg.addColorStop(1, "rgba(168,211,224,0)");
        ctx.save();
        ctx.fillStyle = rg;
        ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
        ctx.restore();
      }

      /* ── 8) 噪声层（瓦片随机偏移 + steps 感） ── */
      const nOffX = -Math.floor(rnd(0, 160));
      const nOffY = -Math.floor(rnd(0, 160));
      ctx.save();
      ctx.globalAlpha = 0.055 + I * 0.05;
      ctx.drawImage(noiseTile, nOffX, nOffY, W + 160, H + 160);
      ctx.restore();

      /* ── 9) 扫描线（pattern 一次填充） ── */
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = scanPattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      /* ── 9.5) 第二人口 · 唤醒协议（轮廓 + 粒子 + 残影） ── */
      if (Awaken) Awaken.draw(ctx, W, H, t, dt);

      /* ── 10) 偶发整帧信号丢失 ── */
      if (Math.random() < 0.004 + I * 0.006) {
        const lh = rnd(H * 0.1, H * 0.4);
        const ly = rnd(0, H - lh);
        ctx.save();
        ctx.fillStyle = "rgba(168,211,224,.08)";
        ctx.fillRect(0, ly, W, lh);
        ctx.strokeStyle = "rgba(168,211,224,.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(W, ly);
        ctx.stroke();
        ctx.restore();
      }

      /* ── 11) 转场期：整体强度爆表（由 JS 设置） ── */
      if (collapseBoost > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = collapseBoost * 0.3;
        ctx.fillStyle = "#A8D3E0";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    /* 转场增强：进入时被设为 1，逐帧衰减 */
    let collapseBoost = 0;
    function boost(v) { collapseBoost = v; }

    return {
      init: function () {
        resize();
        window.addEventListener("resize", resize);
      },
      frame: frame,
      boost: boost,
      mouse: mouse,
      video: video,
      size: function () { return { w: W, h: H }; }
    };
  })();

  /* ═══════════════════════════════════════════════════════════════════
     2. 音效合成器 —— 纯 WebAudio，无外部音频文件
     ═══════════════════════════════════════════════════════════════════ */
  const Sfx = {
    ctx: null,
    on: true,
    ensure: function () {
      if (!this.on) return null;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) { this.on = false; return null; }
          this.ctx = new AC();
        }
        if (this.ctx.state === "suspended") this.ctx.resume();
        return this.ctx;
      } catch (e) { this.on = false; return null; }
    },
    tone: function (f0, f1, dur, type, vol, delay) {
      const ac = this.ensure();
      if (!ac) return;
      const t0 = ac.currentTime + (delay || 0);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(Math.max(1, f0), t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    },
    noiseBurst: function (dur, vol, freq) {
      const ac = this.ensure();
      if (!ac) return;
      const t0 = ac.currentTime;
      const n = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = freq || 900;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol || 0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp);
      lp.connect(g);
      g.connect(ac.destination);
      src.start(t0);
    },
    wake: function () {
      this.tone(620, 1180, 0.17, "sine", 0.05, 0);
      this.tone(1240, 1560, 0.12, "triangle", 0.018, 0.035);
    },
    scan: function () { this.tone(920, 920, 0.028, "square", 0.010, 0); },
    pop: function () { this.noiseBurst(0.09, 0.05, 720); },
    fanfare: function () {
      const seq = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < seq.length; i++) {
        this.tone(seq[i], seq[i], 0.34, "sine", 0.042, i * 0.085);
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     3. 第二人口 · 唤醒协议（AWAKENING PROTOCOL）
     —— 概念：人类之外还有「第二人口」，它们由钢铁、塑料与电流构成，
        一直被信号噪声包裹着，肉眼看不见。
        玩法：9 个物品轮廓在故障画面里游荡，鼠标靠近 → 显形并躲闪，
        停留 0.45s → 唤醒：碎片爆开 + 圆环扩散 + 登记入册。
        全部唤醒 → 「第二人口」四个字砸下，ENTER 解锁。
     ═══════════════════════════════════════════════════════════════════ */

  /* 9 种造型的 2D 轮廓（0-1 归一化坐标，y 向下，底部对齐地面） */
  const RIDER_BODY = [
    [[.5, .08], [.6, .1], [.63, .3], [.55, .43], [.39, .45], [.35, .29], [.43, .1]],
    [[.38, .45], [.3, .66], [.34, .88], [.43, .88], [.47, .6], [.5, .47]],
    [[.6, .45], [.67, .66], [.63, .88], [.54, .88], [.5, .6], [.47, .47]]
  ];
  const SHAPES = {
    sedan: {
      polys: [[[0, .66], [.07, .5], [.2, .4], [.35, .29], [.5, .26], [.65, .29], [.8, .4], [.93, .5], [1, .66], [1, .82], [.86, .88], [.14, .88], [0, .82]]],
      wheels: [[.24, .86, .085], [.76, .86, .085]]
    },
    suv: {
      polys: [[[0, .6], [.04, .4], [.14, .18], [.42, .13], [.62, .16], [.82, .24], [.96, .44], [1, .62], [1, .84], [.14, .84], [0, .6]]],
      wheels: [[.25, .84, .1], [.75, .84, .1]]
    },
    truck: {
      polys: [
        [[.06, .28], [.56, .28], [.56, .84], [.06, .84]],
        [[.6, .5], [.63, .3], [.76, .26], [.87, .4], [.9, .84], [.6, .84]]
      ],
      wheels: [[.2, .86, .09], [.72, .86, .09]]
    },
    bus: {
      polys: [[[.04, .16], [.96, .16], [1, .84], [0, .84]]],
      wheels: [[.2, .86, .08], [.8, .86, .08]]
    },
    coach: {
      polys: [[[.02, .12], [.98, .12], [1, .86], [0, .86]]],
      wheels: [[.22, .86, .07], [.78, .86, .07]]
    },
    rider: {
      polys: RIDER_BODY,
      wheels: [[.22, .84, .16], [.72, .84, .16]]
    },
    delivery: {
      polys: RIDER_BODY.concat([[[.76, .5], [.99, .5], [.99, .74], [.76, .74]]]),
      wheels: [[.22, .84, .16], [.72, .84, .16]]
    },
    ac: {
      polys: [[[.08, .2], [.92, .2], [.92, .8], [.08, .8]]],
      disc: [[.5, .5, .22]],
      grilles: true
    },
    streetlight: {
      polys: [
        [[.46, .04], [.54, .04], [.56, .95], [.44, .95]],
        [[.5, .06], [.86, .09], [.86, .18], [.5, .15]]
      ]
    }
  };

  const POP_META = [
    { kind: "sedan",      name: "轿车",     co2: "1.6t CO₂e" },
    { kind: "suv",        name: "SUV",      co2: "2.4t CO₂e" },
    { kind: "truck",      name: "货车",     co2: "4.1t CO₂e" },
    { kind: "bus",        name: "巴士",     co2: "18.6t CO₂e" },
    { kind: "coach",      name: "大巴",     co2: "21.3t CO₂e" },
    { kind: "rider",      name: "骑行者",   co2: "0.0t CO₂e" },
    { kind: "delivery",   name: "外卖骑手", co2: "0.4t CO₂e" },
    { kind: "ac",         name: "空调外机", co2: "0.9t CO₂e" },
    { kind: "streetlight", name: "路灯",    co2: "0.3t CO₂e" }
  ];

  const Awaken = {
    pops: [],
    parts: [],
    rings: [],
    trail: [],
    count: 0,
    locked: false,

    /* ── 生成 9 个游荡的第二人口 ── */
    spawn: function (W, H) {
      if (!W || !H) return;
      this.pops = POP_META.map(function (m) {
        const w = rnd(W * 0.065, W * 0.115);
        const h = w * rnd(0.62, 1.08);
        return {
          meta: m,
          x: rnd(W * 0.12, W * 0.88),
          y: rnd(H * 0.6, H * 0.94),
          w: w,
          h: h,
          vx: rnd(-14, 14),
          reveal: 0.06,
          done: false,
          phase: rnd(0, 6.28),
          seed: rnd(0, 100),
          lastScanSfx: 0,
          stamina: 1,
          tiredT: 0
        };
      });
    },

    /* ── 更新逻辑：靠近显形 + 躲闪 + 体力耗尽 + 停留唤醒 ── */
    update: function (dt, t, mouse, W, H) {
      if (!this.pops.length) this.spawn(W, H);
      const self = this;

      this.pops.forEach(function (p) {
        if (p.done) return;
        const dx = mouse.x - p.x;
        const dy = mouse.y - (p.y - p.h * 0.5);
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const nearR = Math.max(p.w, p.h) * 0.9;
        const near = mouse.active && dist < nearR;

        /* 力竭状态倒计时 */
        if (p.tiredT > 0) {
          p.tiredT -= dt;
          if (p.tiredT <= 0) { p.tiredT = 0; p.stamina = 1; }
        }

        if (near) {
          const s = 1 - dist / nearR;
          /* 被光照到就躲；力竭时躲不动 → 给玩家抓住的机会 */
          if (p.tiredT <= 0) {
            p.vx -= (dx / dist) * 34 * s * (dt / 16);
            p.vx *= 0.985;
            p.stamina -= dt / 1500;
            if (p.stamina <= 0) {
              p.stamina = 0;
              p.tiredT = 2100;                 // 力竭 2.1s：速度骤降 + 显形加速
              p.vx *= 0.25;
            }
          } else {
            p.vx *= 0.93;
          }
          /* 力竭时扫描速度 ×2.2 */
          p.reveal += dt / (p.tiredT > 0 ? 205 : 450);
          if (p.reveal >= 1) { self.wake(p); return; }
          if (t - p.lastScanSfx > 190) {
            p.lastScanSfx = t;
            Sfx.scan();
          }
        } else {
          p.reveal -= dt / 1500;
          p.vx += rnd(-5, 5) * (dt / 16);
          p.vx *= 0.992;
          if (p.tiredT <= 0 && p.stamina < 1) p.stamina = Math.min(1, p.stamina + dt / 2600);
        }

        /* 限速：正常 18px/帧（≈1080px/s，追得上）；力竭 6px/帧 */
        const vmax = p.tiredT > 0 ? 6 : 18;
        p.vx = Math.max(-vmax, Math.min(vmax, p.vx));
        p.x += p.vx * dt / 16;
        const pad = p.w * 0.55;
        if (p.x < pad) { p.x = pad; p.vx = Math.abs(p.vx); }
        if (p.x > W - pad) { p.x = W - pad; p.vx = -Math.abs(p.vx); }
        p.reveal = Math.max(0.06, Math.min(1, p.reveal));
      });

      /* 粒子 / 圆环 / 残影 */
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i];
        q.life -= dt;
        q.x += q.vx * dt / 16;
        q.y += q.vy * dt / 16;
        q.vy += 0.055 * (dt / 16);
        q.rot += q.vr * dt / 16;
        if (q.life <= 0) this.parts.splice(i, 1);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        r.rad += r.vr * dt / 16;
        if (r.life <= 0) this.rings.splice(i, 1);
      }
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].life -= dt;
        if (this.trail[i].life <= 0) this.trail.splice(i, 1);
      }
      if (mouse.active) {
        this.trail.push({ x: mouse.x, y: mouse.y, life: 420 });
        if (this.trail.length > 26) this.trail.shift();
      }
    },

    /* ── 唤醒一个第二人口 ── */
    wake: function (p) {
      if (p.done) return;
      p.done = true;
      p.reveal = 1;
      this.count++;
      const cx = p.x, cy = p.y - p.h * 0.5;
      this.burst(cx, cy, 30);
      this.rings.push({ x: cx, y: cy, rad: Math.max(p.w, p.h) * 0.3, vr: 320, life: 520 });
      Sfx.wake();
      this.register(p);
      if (this.count >= POP_META.length) this.finish(false);
    },

    register: function (p) {
      const feed = document.getElementById("awakeFeed");
      if (feed) {
        const li = document.createElement("li");
        const idx = String(this.count).padStart(3, "0");
        li.innerHTML = '<span class="bf-idx">POP-' + idx + '</span>' +
          '<span class="bf-name">' + p.meta.name + '</span>' +
          '<span class="bf-meta">' + p.meta.co2 + '</span>';
        feed.appendChild(li);
        while (feed.children.length > 4) feed.removeChild(feed.firstChild);
      }
      const c = document.getElementById("awakeCount");
      if (c) c.textContent = String(this.count);
      const bar = document.getElementById("awakeBar");
      if (bar) bar.style.width = (this.count / POP_META.length * 100) + "%";
    },

    /* ── 全部唤醒 → 标题砸下 + ENTER 解锁 ── */
    finish: function (quiet) {
      if (this.locked) return;
      this.locked = true;
      /* quiet（无障碍降级）：直接视为全部登记完成 */
      if (quiet && this.count < POP_META.length) {
        this.count = POP_META.length;
        const c0 = document.getElementById("awakeCount");
        if (c0) c0.textContent = String(this.count);
        const b0 = document.getElementById("awakeBar");
        if (b0) b0.style.width = "100%";
        const hint0 = document.getElementById("awakeHint");
        if (hint0) { hint0.textContent = "已登记 9 / 9 · 可以进入"; hint0.style.animation = "none"; }
      }
      const wrap = document.getElementById("bootTitleWrap");
      if (wrap) wrap.classList.add("is-locked");
      const feed = document.getElementById("awakeFeed");
      if (feed) {
        const li = document.createElement("li");
        li.innerHTML = '<span class="bf-idx">ALL</span>' +
          '<span class="bf-name">SIGNAL LOCKED</span>' +
          '<span class="bf-meta">9 / 9</span>';
        feed.appendChild(li);
        while (feed.children.length > 4) feed.removeChild(feed.firstChild);
      }
      const hint = document.getElementById("awakeHint");
      if (hint) {
        hint.textContent = "全部登记完成 · 可以进入";
        hint.style.animation = "none";
        hint.style.color = "var(--ink)";
      }
      if (bootEnter && bootEnter.disabled) {
        bootEnter.disabled = false;
        bootEnter.focus();
      }
      if (!quiet) {
        Sfx.fanfare();
        const W = Gfx ? Gfx.size().w : 0, H = Gfx ? Gfx.size().h : 0;
        if (W) {
          for (let i = 0; i < 3; i++) {
            this.burst(rnd(W * 0.2, W * 0.8), rnd(H * 0.3, H * 0.7), 18);
          }
        }
      }
    },

    /* ── 碎片爆发 ── */
    burst: function (x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(1.4, 7.5);
        this.parts.push({
          x: x, y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - rnd(0.5, 2.6),
          w: rnd(2, 7),
          h: rnd(1.5, 4),
          rot: rnd(0, 6.28),
          vr: rnd(-0.3, 0.3),
          life: rnd(520, 1050),
          maxLife: 1050
        });
      }
      if (this.parts.length > 320) this.parts.splice(0, this.parts.length - 320);
    },

    /* ── 绘制 ── */
    draw: function (ctx, W, H, t, dt) {
      const self = this;
      if (!this.pops.length) this.spawn(W, H);
      if (!this._font) {
        this._font = "9px " + (getComputedStyle(document.body).fontFamily || "monospace");
      }
      const mouse = Gfx ? Gfx.mouse : { x: -999, y: -999, active: false };
      this.update(dt, t, mouse, W, H);

      /* 鼠标残影 */
      ctx.save();
      for (let i = 0; i < this.trail.length; i++) {
        const q = this.trail[i];
        const k = q.life / 420;
        ctx.globalAlpha = 0.1 * k;
        ctx.fillStyle = "#A8D3E0";
        const r = 1.2 + 2.6 * k;
        ctx.fillRect(q.x - r / 2, q.y - r / 2, r, r);
      }
      ctx.restore();

      /* 9 个第二人口轮廓 */
      this.pops.forEach(function (p) {
        const bob = p.done ? 0 : Math.sin(t * 0.0013 + p.phase) * p.h * 0.02;
        const jit = (1 - p.reveal) * 0.012;
        const shape = SHAPES[p.meta.kind];
        if (!shape) return;

        ctx.save();

        /* 地面投影（椭圆） */
        ctx.save();
        ctx.globalAlpha = 0.1 + p.reveal * 0.16;
        ctx.fillStyle = "#A8D3E0";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 3, p.w * 0.42, p.w * 0.1, 0, 0, TAU);
        ctx.fill();
        ctx.restore();

        /* 轮廓（虚线密度随 reveal 收敛 → 越清晰越实） */
        ctx.globalAlpha = 0.09 + p.reveal * 0.82;
        ctx.strokeStyle = "#A8D3E0";
        ctx.lineWidth = 1 + p.reveal * 1.5;
        ctx.setLineDash([2 + p.reveal * 7, Math.max(1, 9 - p.reveal * 8)]);
        ctx.beginPath();
        shape.polys.forEach(function (poly, pi) {
          poly.forEach(function (pt, i) {
            const jx = Math.sin(t * 0.006 + p.seed + i * 1.7 + pi) * 0.006 + (Math.random() - 0.5) * jit;
            const jy = Math.cos(t * 0.007 + p.seed + i * 2.3 + pi) * 0.005 + (Math.random() - 0.5) * jit;
            const px = p.x + (pt[0] + jx - 0.5) * p.w;
            const py = p.y + (pt[1] + jy - 1) * p.h + bob;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        });
        ctx.stroke();

        /* 高 reveal 时淡填充 */
        if (p.reveal > 0.4) {
          ctx.setLineDash([]);
          ctx.globalAlpha = (p.reveal - 0.4) * 0.14;
          ctx.fillStyle = "#A8D3E0";
          ctx.fill();
        }

        /* 轮子 / 风扇 / 栅格 */
        ctx.setLineDash([]);
        if (shape.wheels) {
          ctx.globalAlpha = 0.35 + p.reveal * 0.5;
          shape.wheels.forEach(function (c) {
            ctx.beginPath();
            ctx.arc(p.x + (c[0] - 0.5) * p.w, p.y + (c[1] - 1) * p.h + bob, c[2] * p.w, 0, TAU);
            ctx.stroke();
          });
        }
        if (shape.disc) {
          ctx.globalAlpha = 0.3 + p.reveal * 0.45;
          shape.disc.forEach(function (c) {
            const cx = p.x + (c[0] - 0.5) * p.w;
            const cy = p.y + (c[1] - 1) * p.h + bob;
            ctx.beginPath();
            ctx.arc(cx, cy, c[2] * p.w, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, c[2] * p.w * 0.45, 0, TAU);
            ctx.stroke();
          });
        }
        if (shape.grilles && p.reveal > 0.25) {
          ctx.globalAlpha = (p.reveal - 0.25) * 0.9;
          for (let g = 1; g <= 3; g++) {
            const gy = p.y + (0.3 + g * 0.13 - 1) * p.h + bob;
            ctx.beginPath();
            ctx.moveTo(p.x - p.w * 0.3, gy);
            ctx.lineTo(p.x + p.w * 0.3, gy);
            ctx.stroke();
          }
        }
        ctx.restore();

        /* 扫描进度：脚下弧 + 百分比 */
        if (!p.done && p.reveal > 0.08) {
          const tired = p.tiredT > 0;
          ctx.save();
          ctx.globalAlpha = Math.min(1, p.reveal * 1.4);
          ctx.strokeStyle = "#A8D3E0";
          ctx.lineWidth = tired ? 3 : 2;
          const rr = p.w * 0.5;
          const a0 = -Math.PI * 0.82;
          ctx.beginPath();
          ctx.arc(p.x, p.y + 3, rr, a0, a0 + Math.PI * 1.64 * p.reveal);
          ctx.stroke();
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "#A8D3E0";
          ctx.font = self._font;
          ctx.textAlign = "center";
          ctx.fillText(tired ? "EXHAUSTED — 锁定中" : "SCAN " + Math.round(p.reveal * 100) + "%", p.x, p.y - p.h - 12);
          ctx.restore();
        }
      });

      /* 碎片粒子 */
      ctx.save();
      this.parts.forEach(function (q) {
        const k = q.life / q.maxLife;
        ctx.globalAlpha = Math.max(0, k) * 0.9;
        ctx.fillStyle = "#A8D3E0";
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        ctx.restore();
      });
      ctx.restore();

      /* 扩散圆环 */
      ctx.save();
      this.rings.forEach(function (r) {
        const k = r.life / 520;
        ctx.globalAlpha = Math.max(0, k) * 0.75;
        ctx.strokeStyle = "#A8D3E0";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.rad, 0, TAU);
        ctx.stroke();
      });
      ctx.restore();
    }
  };

  /* ═════════════ 2. 自定义准星光标 ═════════════ */
  const cursor = $("bootCursor");
  let lastT = 0;

  function trackMouse(e) {
    if (!Gfx) return;
    const r = cursor.getBoundingClientRect();
    Gfx.mouse.x = e.clientX;
    Gfx.mouse.y = e.clientY;
    Gfx.mouse.active = true;
    if (cursor) {
      cursor.classList.add("is-on");
      cursor.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    }
    /* 悬停检测：可交互元素 → 光标变形 + 故障加剧 */
    const hot = e.target.closest && e.target.closest("button, .boot-skip, .be-label");
    Gfx.mouse.hot = !!hot;
    if (cursor) cursor.classList.toggle("is-hot", !!hot);
  }

  /* ═════════════ 3.5 标题拆字（唤醒后逐字砸下） ═════════════ */
  (function splitTitle() {
    const el = document.getElementById("bootTitle");
    if (!el) return;
    const chars = Array.from(el.textContent.trim());
    el.textContent = "";
    chars.forEach(function (ch) {
      const s = document.createElement("span");
      s.className = "bt-ch glitch-split";
      s.textContent = ch;
      s.setAttribute("data-text", ch);
      el.appendChild(s);
    });
  })();

  /* ═════════════ 4. 交互：点击故障爆发 + 音效开关 ═════════════ */
  const _bootScreen = $("bootScreen");
  if (_bootScreen) {
    _bootScreen.addEventListener("pointerdown", function (e) {
      /* 按钮 / 跳过链接不触发爆发 */
      if (e.target.closest && e.target.closest("button, .boot-skip, .be-label")) return;
      Awaken.burst(e.clientX, e.clientY, 14);
      Sfx.pop();
      if (Gfx) {
        Gfx.boost(0.4);
        setTimeout(function () { if (!bootDone) Gfx.boost(0); }, 240);
      }
    });
  }

  const sfxBtn = document.getElementById("sfxBtn");
  const sfxState = document.getElementById("sfxState");
  if (sfxBtn) {
    sfxBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      Sfx.on = !Sfx.on;
      sfxBtn.classList.toggle("is-off", !Sfx.on);
      if (sfxState) sfxState.textContent = Sfx.on ? "ON" : "OFF";
      if (Sfx.on) Sfx.tone(880, 1180, 0.08, "sine", 0.03, 0);
    });
  }

  /* ═════════════ 5. 启动序列 ═════════════ */
  const bootScreen = $("bootScreen");
  const bootLog = $("bootLog");
  const bootFill = $("bootFill");
  const bootPct = $("bootPct");
  const bootErr = $("bootErr");
  const bootLvl = $("bootLvl");
  const bootEnter = $("bootEnter");
  const bootSkip = document.querySelector(".boot-skip");
  let bootDone = false;

  const BOOT_LINES = [
    { t: "MOUNT /dev/signal", s: "ok" },
    { t: "DECODING CHANNEL R", s: "ok" },
    { t: "DECODING CHANNEL G — DRIFT", s: "warn" },
    { t: "DECODING CHANNEL B", s: "ok" },
    { t: "SYNC 40 TRACK SIGNATURES", s: "ok" },
    { t: "LOADING tracks.json — 40 OBJECTS", s: "ok" },
    { t: "3 SIGNATURES UNVERIFIED", s: "warn" },
    { t: "BUFFERING DATAMOSH ENGINE", s: "ok" },
    { t: "GEOMETRY ENGINE — 9 SUBTYPES", s: "ok" },
    { t: "ALIGNING CHANNEL OFFSET ±3px", s: "ok" },
    { t: "SIGNAL LOCKED", s: "ok" }
  ];

  function setProgress(p) {
    if (!bootFill || !bootPct) return;
    bootFill.style.width = p + "%";
    bootPct.textContent = String(p).padStart(2, "0") + "%";
  }

  function pushLogLine(item, idx) {
    if (!bootLog) return;
    const el = document.createElement("div");
    el.className = "bl-line";
    const idxEl = document.createElement("span");
    idxEl.className = "bl-idx";
    idxEl.textContent = String(idx + 1).padStart(2, "0");
    const txtEl = document.createElement("span");
    txtEl.className = "bl-txt " + (item.s === "warn" ? "bl-warn" : "bl-ok");
    txtEl.textContent = item.t;
    el.appendChild(idxEl);
    el.appendChild(txtEl);
    bootLog.appendChild(el);
    while (bootLog.children.length > 6) bootLog.removeChild(bootLog.firstChild);
  }

  function runBootSequence() {
    if (!bootLog) { finishBoot(); return; }
    let i = 0;
    const total = BOOT_LINES.length;
    (function next() {
      if (i >= total) { finishBoot(); return; }
      pushLogLine(BOOT_LINES[i], i);
      i++;
      setProgress(Math.round(92 * (i / total)));
      if (!reduced && Math.random() < 0.25) {
        if (bootErr) bootErr.textContent = pick(["ERR_NONE", "0x00", "FRAME_OFFSET", "CRC_MISMATCH", "0xDEAD"]);
        if (bootLvl) bootLvl.textContent = Math.round(rnd(8, 94)).toString().padStart(2, "0") + "%";
      }
      setTimeout(next, rnd(90, 200));
    })();
  }

  function finishBoot() {
    setProgress(100);
    if (bootEnter) {
      bootEnter.disabled = false;
      bootEnter.focus();
    }
  }

  /* ═════════════ 4. 转场：信号崩塌 ═════════════ */
  let gfxActive = true;   // 开场 glitch 主循环开关：进入主站后置 false 以停止空烧 CPU
  function enterSite() {
    if (bootDone) return;
    bootDone = true;
    if (!reduced && bootScreen) bootScreen.classList.add("is-collapsing");
    document.body.classList.remove("is-booting");

    /* 转场期：canvas 故障强度爆表，逐帧衰减 */
    if (Gfx && !reduced) {
      let b = 1;
      const decay = setInterval(function () {
        b -= 0.07;
        if (b <= 0) { clearInterval(decay); Gfx.boost(0); return; }
        Gfx.boost(b);
      }, 45);
      /* 同时让视频快进，增强撕裂感 */
      if (Gfx.video) { try { Gfx.video.playbackRate = 2.4; } catch (e) {} }
    }

    setTimeout(function () {
      /* 干净卸载开场视频，避免移除节点时仍在缓冲 → 控制台 requestfailed 噪声 */
      if (Gfx && Gfx.video) {
        try { Gfx.video.pause(); Gfx.video.removeAttribute("src"); Gfx.video.load(); } catch (e) {}
      }
      /* 开场画布已离场 → 停止 glitch 主循环，把 CPU 还给主站交互 */
      gfxActive = false;
      if (bootScreen && bootScreen.parentNode) bootScreen.parentNode.removeChild(bootScreen);
      startDegrade();
      window.dispatchEvent(new CustomEvent("boot:entered"));
    }, reduced ? 60 : 640);
  }

  if (bootEnter) bootEnter.addEventListener("click", enterSite);
  if (bootSkip) bootSkip.addEventListener("click", enterSite);

  document.addEventListener("keydown", function (e) {
    if (bootDone || !bootScreen) return;
    if (e.key === "Enter" && bootEnter && !bootEnter.disabled) {
      e.preventDefault();
      enterSite();
    }
  });

  /* ═════════════ 5. 主站视频信号劣化（原有功能） ═════════════ */
  const degrade = $("sigDegrade");
  const sliceHost = $("sdSlices");
  let level = 1;
  let sliceTimer = null;

  function spawnSlice() {
    if (!sliceHost) return;
    const el = document.createElement("i");
    el.className = "sd-slice";
    const h = rnd(2, 9);
    const top = rnd(0, 96);
    const shift = rnd(-3.2, 3.2);
    const dur = Math.round(rnd(90, 220));
    el.style.height = h + "%";
    el.style.top = top + "%";
    el.style.opacity = "0";
    sliceHost.appendChild(el);
    el.style.transform = "translateX(" + shift.toFixed(2) + "px)";
    el.style.opacity = String(rnd(0.10, 0.24));
    requestAnimationFrame(function () {
      el.style.transition = "transform " + dur + "ms steps(2), opacity " + dur + "ms steps(2)";
      el.style.transform = "translateX(0)";
      el.style.opacity = "0";
    });
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, dur + 60);
  }

  function scheduleSlice() {
    clearTimeout(sliceTimer);
    if (!sliceHost || level === 0) return;
    const base = level === 1 ? [2600, 5400] : [700, 2100];
    sliceTimer = setTimeout(function () {
      spawnSlice();
      scheduleSlice();
    }, Math.round(rnd(base[0], base[1])));
  }

  function startDegrade() {
    if (sliceHost) sliceHost.innerHTML = "";
    scheduleSlice();
  }

  const ctl = $("sigCtl");
  if (ctl) {
    ctl.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-lv]");
      if (!btn) return;
      level = parseInt(btn.getAttribute("data-lv"), 10);
      if (degrade) degrade.setAttribute("data-level", String(level));
      Array.prototype.forEach.call(ctl.querySelectorAll("button[data-lv]"), function (b) {
        b.classList.toggle("on", b === btn);
      });
      if (sliceHost) sliceHost.innerHTML = "";
      scheduleSlice();
    });
  }

  /* ═════════════ 6. 启动 ═════════════ */
  if (Gfx && !reduced) {
    Gfx.init();

    /* 视频静音自动播放（浏览器策略兜底） */
    Gfx.video.muted = true;
    const tryPlay = function () {
      const pr = Gfx.video.play();
      if (pr && pr.catch) pr.catch(function () {
        /* 被拦截 → 等首次交互再播 */
        document.addEventListener("pointerdown", function once() {
          document.removeEventListener("pointerdown", once);
          Gfx.video.play().catch(function () {});
        });
      });
    };
    if (Gfx.video.readyState >= 2) tryPlay();
    else Gfx.video.addEventListener("loadeddata", tryPlay, { once: true });

    /* 主循环 —— 仅服务于开场 glitch 画布；进入主站后停掉，避免空烧 CPU */
    gfxActive = true;
    (function loop(now) {
      if (!gfxActive) return;
      if (!lastT) lastT = now;
      const dt = Math.min(48, now - lastT);
      lastT = now;
      Gfx.frame(dt);
      requestAnimationFrame(loop);
    })(performance.now());

    /* 鼠标交互 */
    window.addEventListener("mousemove", trackMouse, { passive: true });
    window.addEventListener("mouseleave", function () {
      Gfx.mouse.active = false;
      if (cursor) cursor.classList.remove("is-on");
    });

    runBootSequence();
  } else {
    /* reduced-motion 或缺少 canvas：跳过唤醒玩法，直接呈现完整标题 */
    Awaken.finish(true);
    document.body.classList.remove("is-booting");
    if (Gfx) { Gfx.init(); runBootSequence(); }
    else { runBootSequence(); }
    if (bootEnter) bootEnter.disabled = false;
    /* 无动画时也要能进主站 */
    if (bootEnter) bootEnter.addEventListener("click", function () {
      document.body.classList.remove("is-booting");
      if (bootScreen && bootScreen.parentNode) bootScreen.parentNode.removeChild(bootScreen);
      startDegrade();
    });
    startDegrade();
  }
})();