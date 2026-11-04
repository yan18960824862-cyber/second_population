/* ════════════════════════════════════════════════════════════════════════
   viz/data-model.js — 数据层（唯一数据来源）
   ------------------------------------------------------------------------
   职责：读取/插值统计数据，提供绝对数量、相对增长指数、数据模式与来源。
   规则（任务书 §6 / §7）：
     · 绝对数量与相对增长指数分开提供，指数明确标注基准年。
     · 人口＝真实统计（UN 估算，5 年节点之间为线性插值，插值年份被标记）。
     · 工业累计＝概念示意模型（无可靠全球总量数据源），明确标注，
       不与人口共用同一数值尺度，比较只通过「相对增长指数」进行。
     · 视觉组件不得硬编码任何统计值，一律经由本模块读取。
   ════════════════════════════════════════════════════════════════════════ */

export const YEAR_MIN = 1950;
export const YEAR_MAX = 2025;

/* ── 数据来源登记（界面必须原样展示，不得省略） ── */
export const SOURCES = {
  population: {
    id: 'un-wpp',
    name: 'UN World Population Prospects（联合国世界人口展望）',
    org: 'United Nations, DESA / Population Division',
    url: 'https://population.un.org/wpp/',
    dataMode: 'estimate',        // estimate = 有来源的官方估算
    modeLabel: '真实估算',
    unit: '人',
    unitShort: 'B',
    note: '本项目内置该来源的 5 年节点值（十亿），节点之间为线性插值；插值年份在界面中标记为「插值」。'
  },
  industrial: {
    id: 'concept-model',
    name: '概念示意模型（本项目自建）',
    org: 'SECOND POPULATION / CONCEPT MODEL',
    url: null,
    dataMode: 'conceptual',      // conceptual = 概念模型，无统计来源
    modeLabel: '示意模型',
    unit: '累计制造单元',
    unitShort: 'B',
    note: '全球工业制成品累计制造总量目前没有可靠、可公开引用的统一统计源。此处数值为概念模型，用于表达「持续累积」的形态与增长趋势，不代表真实制造量，不可与人口数量直接比较。'
  }
};

/* ── 世界人口（十亿）· UN 估算，5 年节点 ── */
export const POPULATION_TABLE = [
  [1950, 2.53], [1955, 2.78], [1960,  3.03], [1965,  3.35],
  [1970, 3.70], [1975, 4.08], [1980,  4.46], [1985,  4.85],
  [1990, 5.32], [1995, 5.74], [2000,  6.13], [2005,  6.52],
  [2010, 6.96], [2015, 7.38], [2020,  7.84], [2025,  8.18]
];

/* ── 工业制成品累计制造（十亿单元）· 概念示意模型，5 年节点 ── */
export const INDUSTRIAL_TABLE = [
  [1950, 0.80], [1955, 1.40], [1960,  2.30], [1965,  3.50],
  [1970, 5.00], [1975, 6.90], [1980,  9.20], [1985, 12.00],
  [1990, 15.50], [1995, 19.80], [2000, 25.00], [2005, 31.50],
  [2010, 39.50], [2015, 49.00], [2020, 60.50], [2025, 74.00]
];

const POP_PEAK = POPULATION_TABLE[POPULATION_TABLE.length - 1][1];
const IND_PEAK = INDUSTRIAL_TABLE[INDUSTRIAL_TABLE.length - 1][1];

/* 基准年（相对增长指数 = 100 的年份） */
export const INDEX_BASE_YEAR = 1950;

/* ── 工具：线性插值 + 是否插值标记 ── */
function interp(table, year) {
  if (year <= table[0][0]) return { value: table[0][1], interpolated: year < table[0][0] };
  const last = table[table.length - 1];
  if (year >= last[0]) return { value: last[1], interpolated: year > last[0] };
  for (let i = 0; i < table.length - 1; i++) {
    const [y0, v0] = table[i], [y1, v1] = table[i + 1];
    if (year >= y0 && year <= y1) {
      const t = (year - y0) / (y1 - y0);
      return { value: v0 + (v1 - v0) * t, interpolated: year !== y0 && year !== y1 };
    }
  }
  return { value: last[1], interpolated: true };
}

/* ── 基准年取值（独立计算，避免与 get() 互相递归） ── */
function baseValues() {
  const bp = interp(POPULATION_TABLE, INDEX_BASE_YEAR);
  const bo = interp(INDUSTRIAL_TABLE, INDEX_BASE_YEAR);
  return { population: bp.value, industrialUnits: bo.value };
}

/* ── 主数据模型 ──────────────────────────────────────────────────────────
   get(year) 返回一个「唯一数据状态」，可视化、统计面板、趋势线、
   追踪日志全部读同一份状态，避免多处维护年份数值。                    */
export const DataModel = {
  YEAR_MIN, YEAR_MAX, INDEX_BASE_YEAR,
  POP_PEAK, IND_PEAK,
  SOURCES,

  /** 指定年份的完整数据状态 */
  get(year) {
    const p = interp(POPULATION_TABLE, year);
    const o = interp(INDUSTRIAL_TABLE, year);
    const base = baseValues();
    return {
      year,
      /* 绝对数量（各自口径，互不可比） */
      population: p.value,
      populationInterpolated: p.interpolated,
      industrialUnits: o.value,
      industrialInterpolated: o.interpolated,
      /* 相对规模（各自峰值归一化，仅用于控制粒子可见比例） */
      populationFraction: p.value / POP_PEAK,
      industrialFraction: o.value / IND_PEAK,
      /* 相对增长指数（基准年 = 100，两套系统可比） */
      populationIndex: (p.value / base.population) * 100,
      industrialIndex: (o.value / base.industrialUnits) * 100,
      /* 相对基准年的变化量 */
      populationDelta: p.value - base.population,
      industrialDelta: o.value - base.industrialUnits,
      /* 数据模式与来源 */
      populationMode: SOURCES.population.dataMode,
      industrialMode: SOURCES.industrial.dataMode,
      source: SOURCES
    };
  },

  /** 基准年数据 */
  getBase() {
    return Object.assign({ year: INDEX_BASE_YEAR }, baseValues());
  },

  /** 全序列（供趋势线绘制） */
  series() {
    const out = [];
    for (let y = YEAR_MIN; y <= YEAR_MAX; y++) out.push(this.get(y));
    return out;
  },

  /** 取指定年份的原始表格值（不插值），用于「原始/插值」标记 */
  isRawPopulationYear(y) {
    return POPULATION_TABLE.some(r => r[0] === y);
  },
  isRawIndustrialYear(y) {
    return INDUSTRIAL_TABLE.some(r => r[0] === y);
  }
};

export default DataModel;
