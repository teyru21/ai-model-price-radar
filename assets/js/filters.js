/** 筛选与排序：状态可写入 URL，方便分享筛选结果 */
import { state } from './store.js';
import { vendorName } from './ui.js';
import { escapeHtml } from './format.js';

/**
 * 排序选项：每个关键指标都提供「高→低 / 低→高」两个方向，
 * 因此「性价比最高/最低、能力最高/最低、价格最低/最高」都可以直接选。
 */
export const SORT_OPTIONS = [
  { key: 'value', dir: 'desc', label: '性价比 高 → 低（最划算）' },
  { key: 'value', dir: 'asc', label: '性价比 低 → 高（最不划算）' },
  { key: 'intelligence', dir: 'desc', label: '综合能力分 高 → 低（最强）' },
  { key: 'intelligence', dir: 'asc', label: '综合能力分 低 → 高（最弱）' },
  { key: 'blended', dir: 'asc', label: '混合价格 低 → 高（最便宜）' },
  { key: 'blended', dir: 'desc', label: '混合价格 高 → 低（最贵）' },
  { key: 'input', dir: 'asc', label: '输入价 低 → 高' },
  { key: 'input', dir: 'desc', label: '输入价 高 → 低' },
  { key: 'output', dir: 'asc', label: '输出价 低 → 高' },
  { key: 'output', dir: 'desc', label: '输出价 高 → 低' },
  { key: 'context', dir: 'desc', label: '上下文 大 → 小' },
  { key: 'context', dir: 'asc', label: '上下文 小 → 大' },
  { key: 'release', dir: 'desc', label: '发布时间 新 → 旧' },
  { key: 'release', dir: 'asc', label: '发布时间 旧 → 新' },
];

export const DEFAULT_SORT = { key: 'value', dir: 'desc' };
const sortId = (s) => `${s.key}:${s.dir}`;
const LABEL_BY_ID = new Map(SORT_OPTIONS.map((s) => [sortId(s), s.label]));

/** 由 key + dir 还原一个排序对象（用于 URL 直接指定排序） */
export function makeSort(key, dir) {
  const opt = SORT_OPTIONS.find((s) => s.key === key && s.dir === dir);
  return opt ? { ...opt } : { ...SORT_OPTIONS[0] };
}

/** 兼容旧引用：SORTS.value 等 */
export const SORTS = Object.fromEntries(SORT_OPTIONS.map((s) => [`${s.key}_${s.dir}`, s]));
SORTS.value = SORT_OPTIONS[0];
SORTS.intelligence = SORT_OPTIONS[2];

export function defaultFilters(overrides = {}) {
  return {
    q: '',
    vendors: [],
    category: 'text',
    mainstreamOnly: true,
    scoredOnly: false,
    openOnly: false,
    paretoOnly: false,
    minScore: 0,
    priceMax: null,
    minContext: 0,
    includeDeprecated: false,
    sort: { ...SORT_OPTIONS[0] },
    ...overrides,
  };
}

export function mainstreamVendorIds() {
  return new Set(state.raw?.meta?.mainstream?.vendors || []);
}

export function applyFilters(models, f) {
  const mset = mainstreamVendorIds();
  const q = f.q.trim().toLowerCase();
  return models.filter((m) => {
    if (!f.includeDeprecated && m.deprecated) return false;
    if (f.category !== 'all' && m.category !== f.category) return false;
    if (f.mainstreamOnly && mset.size && !mset.has(m.vendor_id)) return false;
    if (f.scoredOnly && m._composite == null) return false;
    if (f.paretoOnly && !m._pareto) return false;
    if (f.minScore && (m._composite == null || m._composite < f.minScore)) return false;
    if (f.openOnly && !m.open_weights) return false;
    if (f.priceMax != null && m._blended != null && m._blended > f.priceMax) return false;
    if (f.minContext && (m.context_length || 0) < f.minContext) return false;
    if (f.vendors.length && !f.vendors.includes(m.vendor_id)) return false;
    if (q) {
      const hay = `${m.name} ${m.id} ${vendorName(m._vendor)} ${m._vendor?.name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortModels(list, sort) {
  const { key, dir } = sort;
  const mul = dir === 'desc' ? -1 : 1;
  const get = (m) => {
    switch (key) {
      case 'value': return m._value;
      case 'intelligence': return m._composite;
      case 'blended': return m._blended;
      case 'input': return m.price.input;
      case 'output': return m.price.output;
      case 'context': return m.context_length || 0;
      case 'release': return m.release_date ? Date.parse(m.release_date) : 0;
      default: return null;
    }
  };
  return [...list].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va == null && vb == null) return a.id.localeCompare(b.id);
    if (va == null) return 1;      // 无数据永远排最后
    if (vb == null) return -1;
    return (va - vb) * mul || a.id.localeCompare(b.id);
  });
}

/* ---------------- URL 同步 ---------------- */
export function filtersFromUrl(base) {
  const p = new URLSearchParams(location.search);
  const f = base;
  if (p.has('q')) f.q = p.get('q');
  if (p.has('v')) f.vendors = p.get('v').split(',').filter(Boolean);
  if (p.has('cat')) f.category = p.get('cat');
  if (p.has('main')) f.mainstreamOnly = p.get('main') === '1';
  if (p.has('scored')) f.scoredOnly = p.get('scored') === '1';
  if (p.has('pareto')) f.paretoOnly = p.get('pareto') === '1';
  if (p.has('minscore')) f.minScore = Number(p.get('minscore')) || 0;
  if (p.has('open')) f.openOnly = p.get('open') === '1';
  if (p.has('pmax')) f.priceMax = Number(p.get('pmax')) || null;
  if (p.has('ctx')) f.minContext = Number(p.get('ctx')) || 0;
  if (p.has('dep')) f.includeDeprecated = p.get('dep') === '1';
  if (p.has('sort')) f.sort = makeSort(p.get('sort'), p.get('dir') || 'desc');
  return f;
}

export function filtersToUrl(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.vendors.length) p.set('v', f.vendors.join(','));
  if (f.category !== 'text') p.set('cat', f.category);
  if (!f.mainstreamOnly) p.set('main', '0');
  if (f.scoredOnly) p.set('scored', '1');
  if (f.paretoOnly) p.set('pareto', '1');
  if (f.minScore) p.set('minscore', String(f.minScore));
  if (f.openOnly) p.set('open', '1');
  if (f.priceMax != null) p.set('pmax', String(f.priceMax));
  if (f.minContext) p.set('ctx', String(f.minContext));
  if (f.includeDeprecated) p.set('dep', '1');
  if (sortId(f.sort) !== sortId(DEFAULT_SORT)) { p.set('sort', f.sort.key); p.set('dir', f.sort.dir); }
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/* ---------------- 筛选栏 ---------------- */
/**
 * @param {HTMLElement} host
 * @param {object} f 筛选状态
 * @param {(patch:object, rerender?:boolean)=>void} onChange
 */
export function renderFilterBar(host, f, onChange, { showSort = true, extraHtml = '' } = {}) {
  const models = state.models;
  const mset = mainstreamVendorIds();
  const pool = models.filter((m) => (mset.size ? mset.has(m.vendor_id) : true));
  const vendorCounts = new Map();
  for (const m of models) vendorCounts.set(m.vendor_id, (vendorCounts.get(m.vendor_id) || 0) + 1);
  const topVendors = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const allVendors = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1]);

  const cats = [
    ['text', '文本生成'], ['image', '图像生成'], ['video', '视频生成'], ['audio', '音频生成'], ['all', '全部类型'],
  ];
  const cur = sortId(f.sort);

  host.innerHTML = `
    <div class="card" style="padding:14px">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
        <label class="field" style="flex:1;min-width:210px">
          搜索模型 / 厂商
          <input type="search" id="f-q" placeholder="输入模型名、厂商名或模型 id，例如：GPT、Claude、DeepSeek、qwen" value="${escapeHtml(f.q)}">
        </label>
        ${showSort ? `<label class="field" style="min-width:230px">
          排序（最高 / 最低）
          <select id="f-sort">
            ${SORT_OPTIONS.map((s) => `<option value="${sortId(s)}" ${cur === sortId(s) ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>` : ''}
        <label class="field" style="min-width:190px">
          按厂商筛选（全部 ${allVendors.length} 家）
          <select id="f-vendor">
            <option value="">— 选择厂商加入筛选 —</option>
            ${allVendors.map(([id, n]) => {
              const v = state.vendorById.get(id);
              return `<option value="${id}" ${f.vendors.includes(id) ? 'disabled' : ''}>${escapeHtml(vendorName(v))}（${n}）</option>`;
            }).join('')}
          </select>
        </label>
        <label class="field" style="width:180px">
          混合价格上限（美元/百万）
          <input type="number" id="f-pmax" min="0" step="0.5" placeholder="不限" value="${f.priceMax ?? ''}">
        </label>
        <label class="field" style="width:150px">
          最小上下文
          <select id="f-ctx">
            ${[[0, '不限'], [32000, '32K+'], [128000, '128K+'], [200000, '200K+'], [1000000, '1M+']]
              .map(([v, l]) => `<option value="${v}" ${f.minContext === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="f-reset">重置</button>
      </div>

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        ${cats.map(([v, l]) => `<button class="chip" data-cat="${v}" aria-pressed="${f.category === v}">${l}</button>`).join('')}
        <span style="width:1px;height:20px;background:var(--border)"></span>
        <button class="chip" data-toggle="mainstreamOnly" aria-pressed="${f.mainstreamOnly}">只看主流厂商</button>
        <button class="chip" data-toggle="scoredOnly" aria-pressed="${f.scoredOnly}">只看有第三方评分</button>
        <button class="chip" data-toggle="paretoOnly" aria-pressed="${f.paretoOnly}">只看效率前沿</button>
        <button class="chip" data-toggle="openOnly" aria-pressed="${f.openOnly}">只看开源权重</button>
        <button class="chip" data-toggle="includeDeprecated" aria-pressed="${f.includeDeprecated}">包含已弃用</button>
      </div>

      <div class="row" style="gap:7px;flex-wrap:wrap;margin-top:9px">
        <span class="tiny mute" style="width:52px">能力下限</span>
        ${[[0, '不限'], [30, '≥30 分'], [45, '≥45 分'], [60, '≥60 分'], [75, '≥75 分']].map(([v, l]) =>
          `<button class="chip" data-minscore="${v}" aria-pressed="${f.minScore === v}">${l}</button>`).join('')}
      </div>

      <div class="row" style="gap:7px;flex-wrap:wrap;margin-top:11px">
        <span class="tiny mute" style="width:52px">厂商</span>
        ${topVendors.map(([id, n]) => {
          const v = state.vendorById.get(id);
          return `<button class="chip" data-vendor="${id}" aria-pressed="${f.vendors.includes(id)}">
            <span class="chip-dot" style="background:${v?.brand || 'var(--text-mute)'}"></span>${escapeHtml(vendorName(v))}<span class="mute tiny">${n}</span>
          </button>`;
        }).join('')}
        ${f.vendors.length ? '<button class="chip" data-clear-vendors>清除厂商</button>' : '<span class="tiny mute">（常用厂商快捷筛选，完整列表见上方下拉框）</span>'}
      </div>
      ${f.vendors.length ? `<div class="row" style="gap:7px;flex-wrap:wrap;margin-top:8px">
        <span class="tiny mute" style="width:52px">已选</span>
        ${f.vendors.map((id) => {
          const v = state.vendorById.get(id);
          return `<button class="chip" data-vendor="${id}" aria-pressed="true" title="点击移除">
            <span class="chip-dot" style="background:${v?.brand || 'var(--text-mute)'}"></span>${escapeHtml(vendorName(v))} ✕</button>`;
        }).join('')}
      </div>` : ''}
      ${extraHtml}
    </div>`;

  const q = host.querySelector('#f-q');
  let timer;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => onChange({ q: q.value }), 180); };
  const sortSel = host.querySelector('#f-sort');
  if (sortSel) {
    sortSel.onchange = () => {
      const [key, dir] = sortSel.value.split(':');
      onChange({ sort: makeSort(key, dir) });
    };
  }
  const vendorSel = host.querySelector('#f-vendor');
  if (vendorSel) {
    vendorSel.onchange = () => {
      if (!vendorSel.value) return;
      onChange({ vendors: [...new Set([...f.vendors, vendorSel.value])] });
    };
  }
  host.querySelector('#f-pmax').onchange = (e) => {
    const v = e.target.value === '' ? null : Number(e.target.value);
    onChange({ priceMax: Number.isFinite(v) ? v : null });
  };
  host.querySelector('#f-ctx').onchange = (e) => onChange({ minContext: Number(e.target.value) || 0 });
  host.querySelector('#f-reset').onclick = () => onChange(defaultFilters({ category: f.category }), true);

  host.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => onChange({ category: b.dataset.cat }); });
  host.querySelectorAll('[data-minscore]').forEach((b) => { b.onclick = () => onChange({ minScore: Number(b.dataset.minscore) || 0 }); });
  host.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = () => onChange({ [b.dataset.toggle]: b.getAttribute('aria-pressed') !== 'true' });
  });
  host.querySelectorAll('[data-vendor]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.vendor;
      const set = new Set(f.vendors);
      set.has(id) ? set.delete(id) : set.add(id);
      onChange({ vendors: [...set] });
    };
  });
  const clear = host.querySelector('[data-clear-vendors]');
  if (clear) clear.onclick = () => onChange({ vendors: [] });
}
