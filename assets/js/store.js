/**
 * 数据加载与全局状态（store）
 *
 * 静态 → 动态 的切换点就在这里：
 *   window.__AI_API_BASE__ = 'https://your-server.com/api'   → 走远程 API
 *   留空（默认）                                              → 走本地 data/models.json（零后端）
 * 两种模式返回同一份数据契约，页面代码无需改动。
 */
import {
  blendedPrice, compositeScore, percentileRank, valueScore, paretoFrontier, DEFAULT_INPUT_RATIO,
} from './metrics.js';

const API_BASE = (typeof window !== 'undefined' && window.__AI_API_BASE__) || '';
/** 站点根路径前缀：模型详情页在 /model/ 子目录下，需要回退一层 */
export const ROOT = /\/model\//.test(location.pathname) ? '../' : './';
const DATA_URL = API_BASE ? `${API_BASE.replace(/\/$/, '')}/models` : `${ROOT}data/models.json`;
const CACHE_KEY = 'ai-price-radar:settings';

/** 全局状态 */
export const state = {
  raw: null,          // 原始数据契约
  models: [],         // 富化后的模型（含 blended / value / rank）
  byId: new Map(),
  vendors: [],
  vendorById: new Map(),
  settings: {
    ratio: DEFAULT_INPUT_RATIO,   // 输入 token 占比
    currency: 'USD',              // USD | CNY
    theme: 'dark',
    ...loadSettings(),
  },
  listeners: new Set(),
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { /* 忽略 */ }
  // 允许用 URL 覆盖主题/货币，便于分享特定外观（例如 ?theme=light）
  const p = new URLSearchParams(location.search);
  const t = p.get('theme');
  if (t === 'light' || t === 'dark') s.theme = t;
  const c = p.get('ccy');
  if (c === 'CNY' || c === 'USD') s.currency = c;
  return s;
}
function saveSettings() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state.settings)); } catch { /* 隐私模式忽略 */ }
}

/** 加载数据（fetch 失败时按需注入 data/models.js，支持 file:// 直接打开，正常访问不会加载它） */
export async function loadData() {
  if (state.raw) return state.raw;
  let payload = null;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (err) {
    payload = await loadFallbackScript();
    if (!payload) {
      throw new Error(`无法加载数据（${err.message}）。请确认 data/models.json 存在，或先运行 npm run data。`);
    }
    state.source = 'fallback';
  }
  state.raw = payload;
  state.vendors = payload.vendors || [];
  state.vendorById = new Map(state.vendors.map((v) => [v.id, v]));
  applySettings();
  return payload;
}

/** 动态注入 data/models.js（仅在 fetch 不可用时，例如直接用 file:// 打开） */
function loadFallbackScript() {
  if (window.__AI_PRICE_DATA__) return Promise.resolve(window.__AI_PRICE_DATA__);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `${ROOT}data/models.js`;
    s.onload = () => resolve(window.__AI_PRICE_DATA__ || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

/** 重新计算派生指标（切换输入占比 / 币种时调用） */
export function applySettings() {
  if (!state.raw) return;
  const { ratio } = state.settings;
  const composite = compositeScore(state.raw.models);

  for (const m of state.raw.models) {
    m._composite = composite(m.scores.intelligence);
    m._percentile = percentileRank(state.raw.models, m.scores.intelligence);
    m._blended = blendedPrice(m.price, ratio);
    m._value = valueScore(m._composite, m._blended);
    m._vendor = state.vendorById.get(m.vendor_id) || { id: m.vendor_id, name: m.vendor_id, brand: null };
  }

  // 性价比排名（仅对有第三方评分的模型）
  const scored = state.raw.models.filter((m) => m._value != null);
  const sorted = [...scored].sort((a, b) => b._value - a._value || a.id.localeCompare(b.id));
  sorted.forEach((m, i) => { m._valueRank = i + 1; });

  const byIntel = [...state.raw.models.filter((m) => m._composite != null)]
    .sort((a, b) => b._composite - a._composite || a.id.localeCompare(b.id));
  byIntel.forEach((m, i) => { m._intelRank = i + 1; });

  const byCheap = [...state.raw.models.filter((m) => m._blended > 0)]
    .sort((a, b) => a._blended - b._blended || a.id.localeCompare(b.id));
  byCheap.forEach((m, i) => { m._cheapRank = i + 1; });

  // 帕累托效率前沿（价格-能力平面上不被支配的模型）
  const frontier = paretoFrontier(
    state.raw.models.map((m) => ({ id: m.id, price: m._blended, score: m._composite })),
  );
  for (const m of state.raw.models) m._pareto = frontier.has(m.id);

  state.models = state.raw.models;
  state.byId = new Map(state.models.map((m) => [m.id, m]));
}

export function setSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  if (key === 'ratio') applySettings();
  if (key === 'theme') applyTheme(value);
  emit();
}

export function emit() { state.listeners.forEach((fn) => fn(state)); }
export function subscribe(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme() {
  setSetting('theme', state.settings.theme === 'dark' ? 'light' : 'dark');
}

export function getModel(id) { return state.byId.get(id) || null; }
