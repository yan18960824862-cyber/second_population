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
  let gfxActive = false, gfxRaf = 0;

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
      /* 开场背景只是噪声质感，1x 像素足够；dpr 1 比 1.5 省掉 55% 像素运算 */
      dpr = 1;
      /* 同时硬性限制 backing store 长边，避免 4K 屏每帧数百万像素运算 */
      const maxDim = 1280;
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

      /* ── 9.5) 原「唤醒协议」鼠标扫描小游戏已移除：开场不再跑物体轮廓与粒子 ── */

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

  /* ═════════════ 2. 自定义准星光标 ═════════════ */
  const cursor = $("bootCursor");
  let lastT = 0;

  function trackMouse(e) {
    if (!Gfx) return;
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
    { t: "SYNC FOUR OBSERVATION SECTORS", s: "ok" },
    { t: "LOADING UNIFIED CENSUS — 75 SOURCE RECORDS", s: "ok" },
    { t: "3 SIGNATURES UNVERIFIED", s: "warn" },
    { t: "BUFFERING DATAMOSH ENGINE", s: "ok" },
    { t: "GEOMETRY ENGINE — 9 SUBTYPES", s: "ok" },
    { t: "ALIGNING CHANNEL OFFSET ±3px", s: "ok" },
    { t: "SIGNAL LOCKED", s: "ok" }
  ];

  /* 标题揭示：原先由「唤醒玩法」集齐 9 个后解锁，玩法移除后在这里直接完成 */
  function markTitleReady() {
    const wrap = document.getElementById("bootTitleWrap");
    if (wrap) wrap.classList.add("is-locked");
  }

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
    markTitleReady();
    if (bootEnter) {
      bootEnter.disabled = false;
      bootEnter.focus();
    }
  }

  /* ═════════════ 4. 转场：信号崩塌 ═════════════ */
  function enterSite() {
    if (bootDone) return;
    bootDone = true;
    if (!reduced && bootScreen) bootScreen.classList.add("is-collapsing");
    document.body.classList.remove("is-booting");

    /* 转场期：canvas 故障强度爆表，逐帧衰减 */
    if (Gfx && !reduced && !window.CameraPrelude.directEntry) {
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
      cancelAnimationFrame(gfxRaf);
      window.removeEventListener('mousemove',trackMouse);
      if (bootScreen && bootScreen.parentNode) bootScreen.parentNode.removeChild(bootScreen);
      startDegrade();
      window.dispatchEvent(new CustomEvent("boot:entered"));
    }, window.CameraPrelude.directEntry ? 0 : reduced ? 60 : 640);
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
    if (!sliceHost || level === 0 || document.hidden || !window.RenderLifecycle.stageVisible()) return;
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

  /* Prelude hands off the same video texture into the original glitch renderer. */
  function startGlitch() {
    if (bootDone) return;
    if (Gfx) Gfx.init();
    if (Gfx && !reduced) {
      Gfx.video.muted = true;
      Gfx.video.play().catch(function(){});
      gfxActive = true;
      const loop = now => {
        gfxRaf = 0;
        if (!gfxActive || document.hidden) return;
        if (!lastT || now-lastT>=33) { const dt=lastT?now-lastT:33;lastT=now;Gfx.frame(Math.min(64,dt)); }
        gfxRaf=requestAnimationFrame(loop);
      };
      const sync=()=>{if(document.hidden){cancelAnimationFrame(gfxRaf);gfxRaf=0;Gfx.video.pause();}else if(gfxActive&&!gfxRaf){lastT=0;Gfx.video.play().catch(()=>{});gfxRaf=requestAnimationFrame(loop)}};
      document.addEventListener('visibilitychange',sync);
      gfxRaf=requestAnimationFrame(loop);
      window.addEventListener('mousemove',trackMouse,{passive:true});
    } else markTitleReady();
    runBootSequence();
  }
  window.CameraPrelude.finished.then(result=>{if(result?.integrated)enterSite();else startGlitch();});
  window.addEventListener('sp:viewchange',()=>{if(bootDone)startDegrade();});
  document.addEventListener('visibilitychange',()=>{if(bootDone)startDegrade();});
})();
