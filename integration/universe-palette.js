/* 单一配色 / 尺寸 token 表（classic script，供 global-survey-engine 读取）。
   所有星点色、发光冠色、雾层色、背景底色都从这里读，不在绘制代码里散落硬编码。
   换配色方案 = 只改这张表 + UniversePalette.palette.set(name)，其余代码不动。 */
(function () {
  "use strict";

  /* ── 尺寸档：按真实物理尺度分档（车 > 围护/停放 > 地表设施 > 导视牌 > 灯具小件）
     scale 是相对屏幕半径的倍数，minPx 是屏幕投影的最小可见下限（缩到最小也看得见）。 */
  var SIZE_TIERS = {
    transit:   { order: 5, scale: 1.00, minPx: 3.2, cn: '车流主体' },
    equipment: { order: 4, scale: 0.86, minPx: 2.8, cn: '围护 / 停放' },
    ground:    { order: 3, scale: 0.78, minPx: 2.5, cn: '地表设施' },
    person:    { order: 3, scale: 0.74, minPx: 2.6, cn: '骑手行人' },
    signage:   { order: 2, scale: 0.68, minPx: 2.2, cn: '导视牌' },
    lighting:  { order: 1, scale: 0.58, minPx: 1.9, cn: '灯具小件' },
    other:     { order: 3, scale: 0.70, minPx: 2.4, cn: '其他' }
  };

  /* 物理分档规则：先匹配更小的结构件，再落到大件，避免 "LANE MARK" 被当成导视牌。 */
  var CLASS_RULES = [
    ['ground',    ['KERB', 'MANHOLE', 'LANE', 'PAVING', 'DRAIN', 'COVER', 'ARROW']],
    ['lighting',  ['LUMINAIRE', 'STREETLIGHT', 'LAMP', 'LIGHT', 'CAMERA POLE']],
    ['equipment', ['BARRIER', 'GUARDRAIL', 'FENCE', 'RACK', 'BOLLARD', 'BIN', 'CABINET', 'HYDRANT', 'BOX']],
    ['signage',   ['SIGN', 'BANNER', 'PLATE', 'TOTEM', 'POSTER', 'MARK']],
    ['transit',   ['SEDAN', 'SUV', 'BUS', 'TRUCK', 'VAN', 'TAXI', 'CAR', 'MOTO', 'SCOOTER', 'BICYCLE', 'BIKE', 'TRAILER']]
  ];

  function physicalClass(record) {
    if (!record) return 'other';
    if (record.category === 'person') return 'person';
    if (record.category === 'vehicle') return 'transit';
    var label = String(record.labelEn || record.label || '').toUpperCase();
    for (var i = 0; i < CLASS_RULES.length; i++) {
      var keys = CLASS_RULES[i][1];
      for (var j = 0; j < keys.length; j++) if (label.indexOf(keys[j]) !== -1) return CLASS_RULES[i][0];
    }
    return record.category === 'infrastructure' ? 'ground' : 'other';
  }

  /* ── 配色方案：至少两套，palette.set()/cycle() 可实时切换 ── */
  var SCHEMES = {
    cool5: {
      id: 'cool5', label: '冷调五色',
      bg: '#02070b', bgEdge: '#0a141c',
      haze: [64, 86, 107], hazeAlpha: 1,          // v5 星云的蓝灰 #40566b
      classes: {
        transit: '#9ed8ff', equipment: '#7fc7d8', ground: '#a8c8ba',
        person: '#c9d6c4', signage: '#b9c8d6', lighting: '#b8aed9', other: '#8fa9b6'
      }
    },
    monoAccent: {
      id: 'monoAccent', label: '单色 + 暖点缀',
      bg: '#02070b', bgEdge: '#08121a',
      haze: [58, 78, 96], hazeAlpha: 0.9,
      accent: '#f2b38f',                         // 暖色只给体量最大的一档，不做平均分配
      classes: {
        transit: '#f2b38f', equipment: '#a8d3e0', ground: '#a8d3e0',
        person: '#8fa9b6', signage: '#a8d3e0', lighting: '#a8d3e0', other: '#8fa9b6'
      }
    },
    /* 方案 C：参考图做法 —— 每群一组同色系，群间换色相；黑底、低饱和。
       五个群相：青 186° / 绿 132° / 黄 50° / 玫瑰 345° / 紫 272°，
       饱和度压到 42–52%，明度 58–72%；群内用 variation 做深浅变化。 */
    groupHues: {
      id: 'groupHues', label: '群落分色',
      bg: '#02070b', bgEdge: '#081018',
      haze: [52, 72, 88], hazeAlpha: 0.85,
      variation: 0.18,
      /* 方案 C 的核心：颜色跟着群落走（而不是按物理类别重组），保证一群一色。 */
      groups: { vehicles: '#56b9c2', signage: '#e290a8', lighting: '#b396de', 'street-equipment': '#7fcf92', ground: '#e3c264' },
      classes: {
        transit: '#56b9c2', equipment: '#7fcf92', ground: '#e3c264',
        person: '#56b9c2', signage: '#e290a8', lighting: '#b396de', other: '#8d9a9e'
      }
    }
  };

  var SCHEME_NAMES = Object.keys(SCHEMES);

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbCsv(hex) { return hexToRgb(hex).join(', '); }

  var current = 'cool5';
  var listeners = new Set();

  var palette = {
    get name() { return current; },
    get: function () { return SCHEMES[current]; },
    list: function () { return SCHEME_NAMES.map(function (n) { return SCHEMES[n]; }); },
    style: function (cls) { return SCHEMES[current].classes[cls] || SCHEMES[current].classes.other; },
    rgb: function (cls) { return rgbCsv(this.style(cls)); },
    hazeRgb: function () { return SCHEMES[current].haze.join(', '); },
    set: function (name) {
      if (!SCHEMES[name] || name === current) return current;
      current = name;
      listeners.forEach(function (fn) { fn(SCHEMES[current]); });
      return current;
    },
    cycle: function () {
      return this.set(SCHEME_NAMES[(SCHEME_NAMES.indexOf(current) + 1) % SCHEME_NAMES.length]);
    },
    onChange: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }
  };

  window.UniversePalette = {
    SIZE_TIERS: SIZE_TIERS,
    SCHEMES: SCHEMES,
    SCHEME_NAMES: SCHEME_NAMES,
    physicalClass: physicalClass,
    hexToRgb: hexToRgb,
    rgbCsv: rgbCsv,
    palette: palette
  };
})();
