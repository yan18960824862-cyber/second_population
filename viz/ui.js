/* ════════════════════════════════════════════════════════════════════════
   viz/ui.js — 可视化的 DOM 层
   ------------------------------------------------------------------------
   职责（只负责呈现，不持有数据逻辑）：
     · 顶部统计：两套系统的名称 / 绝对值 / 单位 / 相对基准年变化 /
       相对增长指数 / 数据模式 / 来源
     · 图例：把每一条视觉编码的含义写清楚
     · 时间轴：播放 / 暂停 / 重置 / 速率 / 拖动
     · 趋势线：两条相对增长指数曲线（SVG），同尺度可比
     · 追踪框 / 扫描线 / 识别日志
     · 悬停提示 + 目标详情面板（锁定时展开）
     · Focus Lens 视窗定位
   所有数值来自 data-model 的同一份状态，不在 DOM 里另存一份年份数据。
   ════════════════════════════════════════════════════════════════════════ */

export function VizUI(opts) {
  const {
    controls, dataModel, sources, baseYear, faceProfile,
    onSeek, onToggle, onReset, onRate, onFullscreen, onHoverTarget
  } = opts;

  const el = id => document.getElementById(id);
  const root = el('dvRoot') || (controls.range && controls.range.closest('.dataviz'));
  if (!root) { console.warn('[viz-ui] 未找到容器 root'); }

  /* ── 统计面板 DOM（动态创建，便于在窄栏中折叠） ── */
  const canvas = el('dvCanvas');
  const statBox = el('dvStats');
  const legendBox = el('dvLegend');
  const detailBox = el('dvDetail');
  const logBox = el('dvLog');
  const overlay = el('dvOverlay');
  const lensBox = el('dvLens');
  const scanEl = el('dvScan');
  const trendBox = el('dvTrend');

  const statEls = new Map();       // 'statObject' / 'statHuman' → 统计面板 DOM
  const trackBoxes = new Map();   // trackingId → DOM 追踪框
  let targetList = [];
  let lockedTarget = null;
  let hoverTarget = null;
  let lensPos = { x: 0, y: 0, w: 210, h: 150 };
  // 指针位置由主模块每帧写入（放大镜视窗需跟随指针且被约束在画布内）
  const pointer = { x: 0, y: 0 };

  /* ═══════ 1. 统计面板 ═══════ */
  function buildStats() {
    if (!statBox) return;
    statBox.innerHTML = '';
    const mk = (side, s) => {
      const d = document.createElement('div');
      d.className = 'dv-stat ' + side;
      d.innerHTML =
        '<div class="dv-stat-h"><i class="swatch"></i><span class="nm"></span>' +
        '<span class="mode"></span></div>' +
        '<div class="dv-stat-v"><strong class="val">–</strong><span class="unit"></span></div>' +
        '<div class="dv-stat-d"><span class="delta"></span><span class="idx"></span></div>' +
        '<div class="dv-stat-s"></div>';
      d.querySelector('.nm').textContent = s;
      d.querySelector('.mode').textContent = '';
      statBox.appendChild(d);
      return d;
    };
    const src = sources;
    statEls.set('statObject', mk('object', 'INDUSTRIAL OBJECTS · 工业制成品'));
    statEls.get('statObject').querySelector('.mode').textContent = src.industrial.modeLabel;
    statEls.get('statObject').querySelector('.mode').classList.add('is-concept');
    statEls.get('statObject').querySelector('.unit').textContent = src.industrial.unitShort + ' ' + src.industrial.unit;
    statEls.get('statObject').querySelector('.dv-stat-s').textContent =
      src.industrial.name + '（无公开统一统计源，概念模型）';

    statEls.set('statHuman', mk('human', 'WORLD POPULATION · 世界人口'));
    statEls.get('statHuman').querySelector('.mode').textContent = src.population.modeLabel;
    statEls.get('statHuman').querySelector('.mode').classList.add('is-estimate');
    statEls.get('statHuman').querySelector('.unit').textContent = src.population.unitShort + ' ' + src.population.unit;
    statEls.get('statHuman').querySelector('.dv-stat-s').textContent =
      src.population.name + '（' + src.population.org + '）';
  }

  /* ═══════ 2. 图例：把视觉编码写清楚 ═══════ */
  function buildLegend() {
    if (!legendBox) return;
    legendBox.innerHTML =
      '<div class="dv-lg-h">VISUAL ENCODING / 视觉编码</div>' +
      '<ul>' +
      '<li><i class="k k-time"></i>时间轴 1950—2025 → 工业场沉积层高度</li>' +
      '<li><i class="k k-obj"></i>工业场：可见粒子比例 = 累计制造量 / 峰值</li>' +
      '<li><i class="k k-hum"></i>人口场：可见粒子比例 = 人口总量 / 峰值</li>' +
      '<li><i class="k k-idx"></i>相对增长指数（' + baseYear + ' = 100）→ 两系统可比</li>' +
      '<li><i class="k k-size"></i>粒子大小 = 空间深度，非数据量</li>' +
      '<li><i class="k k-face"></i>面部线条 = 同一组演示参数转译到不同物体</li>' +
      '</ul>' +
      '<div class="dv-lg-note">粒子为<b>抽样可视化单位</b>，非逐件计数；工业累计量为概念模型，不可与人口直接比较量级。</div>';
  }

  /* ═══════ 3. 趋势线（相对增长指数，同尺度） ═══════ */
  function buildTrend() {
    if (!trendBox) return;
    const series = dataModel.series();
    const w = 300, h = 62, pad = 3;
    let maxIdx = 1;
    for (const s of series) maxIdx = Math.max(maxIdx, s.populationIndex, s.industrialIndex);
    const xAt = i => pad + (i / (series.length - 1)) * (w - pad * 2);
    const yAt = v => h - pad - (v / maxIdx) * (h - pad * 2);
    const pathOf = key => series.map((s, i) =>
      (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(s[key]).toFixed(1)).join(' ');
    const gx = [];
    for (let i = 0; i <= 4; i++) {
      gx.push('<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" class="tg-grid"/>');
    }
    trendBox.innerHTML =
      '<div class="dv-tr-h">RELATIVE GROWTH INDEX · 相对增长指数（' + baseYear + ' = 100）</div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" class="dv-tr-svg">' +
      gx.join('') +
      '<path d="' + pathOf('industrialIndex') + '" class="tg-obj"/>' +
      '<path d="' + pathOf('populationIndex') + '" class="tg-hum"/>' +
      '</svg>' +
      '<div class="dv-tr-k"><span class="k-obj">■ 工业制成品</span><span class="k-hum">■ 世界人口</span>' +
      '<span class="dv-tr-max">峰值 ' + Math.round(maxIdx) + '</span></div>';
  }

  /* ═══════ 4. 追踪框 / 日志 / 扫描线 ═══════ */
  function buildBoxes(list) {
    if (!overlay) return;
    // 清理旧的
    overlay.querySelectorAll('.dv-track-box').forEach(n => n.remove());
    trackBoxes.clear();
    for (const t of list) {
      const b = document.createElement('div');
      b.className = 'dv-track-box';
      b.innerHTML = '<span class="tb-id">' + t.trackingId + '</span>' +
        '<span class="tb-cls">' + t.cls + '</span>' +
        '<span class="tb-conf">CONF ' + t.conf.toFixed(2) + '</span>';
      overlay.appendChild(b);
      t.box = b;
      trackBoxes.set(t.trackingId, b);
    }
  }

  function log(text) {
    if (!logBox) return;
    const ul = logBox.querySelector('ul');
    if (!ul) return;
    const li = document.createElement('li');
    li.textContent = text;
    ul.prepend(li);
    while (ul.children.length > 5) ul.removeChild(ul.lastChild);
  }

  function setScan(t) {
    if (scanEl) scanEl.style.top = (t * 100) + '%';
  }

  /* ═══════ 5. 悬停提示 + 详情面板 ═══════ */
  function targetInfo(t) {
    const d = dataModel.get(timelineYear());
    const rec = t.record || {};
    const info = rec.info || {};
    const rows = [];
    rows.push(['对象名称', t.label]);
    rows.push(['对象类别', t.cls + ' / ' + t.clsZh]);
    rows.push(['唯一标识', t.trackingId]);
    rows.push(['所属区域', t.region]);
    rows.push(['当前年份', Math.floor(d.year) + ' 年']);
    rows.push(['累计制造量（系统）', d.industrialUnits.toFixed(2) + ' B ' + sources.industrial.unit]);
    rows.push(['相对增长指数', '工业 ' + Math.round(d.industrialIndex) + ' / 人口 ' + Math.round(d.populationIndex)]);
    if (info['年运营碳排放']) rows.push(['年运营碳排放', info['年运营碳排放']]);
    if (info['车辆制造能耗'] || info['制造能耗']) rows.push(['制造能耗', info['车辆制造能耗'] || info['制造能耗']]);
    rows.push(['追踪状态', lockedTarget === t ? 'LOCKED / 已锁定' : 'TRACKING / 追踪中']);
    rows.push(['识别置信度', t.conf.toFixed(2)]);
    rows.push(['样本性质', '固定参考样本 · 非按年份淡入淡出']);
    return rows;
  }

  function renderDetail(t, isLock) {
    if (!detailBox) return;
    if (!t) { detailBox.hidden = true; detailBox.innerHTML = ''; return; }
    const rows = targetInfo(t);
    detailBox.hidden = false;
    detailBox.innerHTML =
      '<div class="dv-d-h"><span>' + (isLock ? 'TARGET LOCKED · 目标锁定' : 'TARGET · 目标') + '</span>' +
      '<button type="button" class="dv-d-x" title="取消锁定">✕</button></div>' +
      '<dl>' + rows.map(r => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</dl>' +
      '<div class="dv-d-face">面部转译：' + faceProfile.label + ' · ' + faceProfile.note + '</div>';
    const x = detailBox.querySelector('.dv-d-x');
    if (x) x.addEventListener('click', () => onLockTarget(null));
  }

  function setHover(t) {
    hoverTarget = t;
    layout();
    if (lockedTarget) { renderDetail(lockedTarget, true); return; }
    renderDetail(t, false);
  }
  function setLock(t) {
    lockedTarget = t;
    layout();
    renderDetail(t || hoverTarget, !!t);
    // 锁定由主模块驱动（onClick → lockTarget → setLock），UI 不再反向回调，避免循环
  }
  function setTargets(list) {
    targetList = list;
    buildBoxes(list);
  }

  /* ═══════ 6. 数值更新（唯一数据状态） ═══════ */
  let currentYear = dataModel.YEAR_MIN;
  function timelineYear() { return currentYear; }

  function update(d, tstate) {
    currentYear = d.year;
    const o = statEls.get('statObject');
    const h = statEls.get('statHuman');
    if (o) {
      o.querySelector('.val').textContent = d.industrialUnits.toFixed(2);
      o.querySelector('.delta').textContent =
        (d.industrialDelta >= 0 ? '+' : '') + d.industrialDelta.toFixed(2) + ' vs ' + baseYear;
      o.querySelector('.idx').textContent = 'IDX ' + Math.round(d.industrialIndex);
    }
    if (h) {
      h.querySelector('.val').textContent = d.population.toFixed(2);
      h.querySelector('.delta').textContent =
        (d.populationDelta >= 0 ? '+' : '') + d.populationDelta.toFixed(2) + ' vs ' + baseYear;
      h.querySelector('.idx').textContent = 'IDX ' + Math.round(d.populationIndex);
    }
    if (controls.yearValue) controls.yearValue.textContent = String(Math.floor(d.year));
    if (controls.objectsValue) controls.objectsValue.textContent = d.industrialUnits.toFixed(2) + 'B';
    if (controls.peopleValue) controls.peopleValue.textContent = d.population.toFixed(2) + 'B';
    if (controls.range) controls.range.value = String(Math.floor(d.year));
    if (controls.toggle) {
      controls.toggle.textContent = tstate.isPlaying ? '暂停' : '播放';
      controls.toggle.setAttribute('aria-pressed', String(tstate.isPlaying));
    }
    // 插值标记
    if (controls.interpFlag) {
      const raw = dataModel.isRawPopulationYear(Math.floor(d.year)) && dataModel.isRawIndustrialYear(Math.floor(d.year));
      controls.interpFlag.textContent = raw ? '原始节点' : '插值年份';
      controls.interpFlag.classList.toggle('is-interp', !raw);
    }
    // 详情面板随年份刷新
    if (lockedTarget || hoverTarget) renderDetail(lockedTarget || hoverTarget, !!lockedTarget);
  }

  /* ═══════ 7. 放大镜定位（跟随指针，约束在可视区内） ═══════ */
  function lensRect() {
    if (!lensBox || lensBox.hidden) return null;
    const r = lensBox.getBoundingClientRect();
    if (r.width < 20) return null;
    // scissor 需要的是画布内部坐标（原点左下），而非视口坐标
    const c = canvas.getBoundingClientRect();
    const sx = canvas.width / Math.max(1, c.width);   // 含 devicePixelRatio
    const sy = canvas.height / Math.max(1, c.height);
    return {
      x: (r.left - c.left) * sx,
      y: (c.bottom - r.bottom) * sy,   // WebGL 原点在左下
      w: r.width * sx,
      h: r.height * sy
    };
  }

  function layout() {
    // 放大镜视窗位置：靠近指针，但约束在画布内
    if (!lensBox || !overlay) return;
    const target = lockedTarget || hoverTarget;
    const show = !!target;
    lensBox.hidden = !show;
    if (!show) return;
    const pr = overlay.getBoundingClientRect();
    const lr = lensBox.getBoundingClientRect();
    const w = lr.width || 210, h = lr.height || 150;
    const px = pointer.x, py = pointer.y;
    let x = px + 26, y = py - h - 20;
    if (x + w > pr.width - 6) x = px - w - 26;
    if (x < 6) x = 6;
    if (y < 6) y = 6;
    if (y + h > pr.height - 6) y = pr.height - h - 6;
    lensBox.style.left = x + 'px';
    lensBox.style.top = y + 'px';
  }

  /* ═══════ 8. 控件绑定 ═══════ */
  function mount() {
    buildStats();
    buildLegend();
    buildTrend();
    if (controls.toggle) controls.toggle.addEventListener('click', () => onToggle());
    if (controls.resetBtn) controls.resetBtn.addEventListener('click', () => onReset());
    if (controls.range) controls.range.addEventListener('input', e => onSeek(Number(e.target.value)));
    if (controls.rateSel) controls.rateSel.addEventListener('change', e => onRate(Number(e.target.value)));
  if (controls.fullBtn) controls.fullBtn.addEventListener('click', () => onFullscreen());
    if (controls.footEl) {
      controls.footEl.innerHTML =
        '人口＝<b>' + sources.population.modeLabel + '</b>（' + sources.population.name + '）· ' +
        '工业累积＝<b>' + sources.industrial.modeLabel + '</b>（概念模型，无统计源）· ' +
        '两者口径不同，比较请用相对增长指数';
    }
    log('SYSTEM READY / 数据层载入');
  }

  return {
    mount, update, layout, log, setScan, setHover, setLock, setTargets, lensRect, pointer,
    get targets() { return targetList; }
  };
}
