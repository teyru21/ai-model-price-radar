/**
 * 指标计算 —— 纯函数，无任何运行时依赖。
 * 同时被浏览器端 (assets/js/*) 和 Node 抓取脚本 (scripts/fetch-data.mjs) 复用，
 * 保证「站上看到的算法」与「构建时算的算法」完全一致。
 *
 * @module metrics
 */

/** 默认输入 token 占比（3:1），用户可在界面上调整 */
export const DEFAULT_INPUT_RATIO = 0.75;

/**
 * 混合价格：按调用量结构把输入价/输出价合并成「等效每百万 token 价格」。
 * blended = input * r + output * (1 - r)
 */
export function blendedPrice(price, inputRatio = DEFAULT_INPUT_RATIO) {
  if (!price) return null;
  const i = Number(price.input) || 0;
  const o = Number(price.output) || 0;
  if (i <= 0 && o <= 0) return null;
  const r = clamp(inputRatio, 0, 1);
  return i * r + o * (1 - r);
}

/** 一次典型调用的成本（美元） */
export function callCost(price, inputTokens, outputTokens) {
  if (!price) return null;
  const i = Number(price.input) || 0;
  const o = Number(price.output) || 0;
  return (inputTokens * i + outputTokens * o) / 1e6;
}

/** 月度成本（美元） */
export function monthlyCost(price, { requests, inputTokens, outputTokens }) {
  const per = callCost(price, inputTokens, outputTokens);
  return per == null ? null : per * requests;
}

/**
 * 综合能力分（0-100）：以 Artificial Analysis 智能指数为口径，
 * 0 分对应 0，当前收录的最高分对应 100。数据来源在界面上必须标注。
 */
export function compositeScore(models) {
  const vals = models.map((m) => m.scores?.intelligence).filter((v) => typeof v === 'number');
  const max = vals.length ? Math.max(...vals) : 0;
  return (v) => (typeof v !== 'number' || max <= 0 ? null : round1((v / max) * 100));
}

/** 百分位（0-100，越高越强） */
export function percentileRank(models, value) {
  const vals = models.map((m) => m.scores?.intelligence).filter((v) => typeof v === 'number');
  if (typeof value !== 'number' || !vals.length) return null;
  const below = vals.filter((v) => v < value).length;
  return Math.round((below / vals.length) * 100);
}

/**
 * 帕累托效率前沿：在「价格-能力」平面上，不被任何其他模型同时做到
 * 「更便宜且更强」的模型。这些就是严格意义上的高性价比选择。
 * @returns {Set<string>} 位于前沿上的模型 id 集合
 */
export function paretoFrontier(points) {
  const pts = points.filter((p) => p.price > 0 && typeof p.score === 'number');
  const frontier = new Set();
  for (const a of pts) {
    const dominated = pts.some(
      (b) => b !== a && b.price <= a.price && b.score >= a.score && (b.price < a.price || b.score > a.score),
    );
    if (!dominated) frontier.add(a.id);
  }
  return frontier;
}

/** 性价比：每 1 美元混合价格能买到的综合能力分 */
export function valueScore(score, blended) {
  if (typeof score !== 'number' || !blended || blended <= 0) return null;
  return round1(score / blended);
}

/** 用固定种子生成稳定排序号（同分时按 id 保证确定性） */
export function rankBy(items, keyFn, { desc = true } = {}) {
  const ranked = items
    .map((item) => ({ id: item.id, v: keyFn(item) }))
    .filter((x) => typeof x.v === 'number' && Number.isFinite(x.v))
    .sort((a, b) => (desc ? b.v - a.v : a.v - b.v) || (a.id < b.id ? -1 : 1));
  const map = new Map();
  ranked.forEach((x, i) => map.set(x.id, i + 1));
  return map;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** 价格换算成人民币（仅按汇率折算，界面须标注「按汇率折算」） */
export function toCny(usd, rate) {
  return usd == null ? null : Math.round(usd * rate * 10000) / 10000;
}
