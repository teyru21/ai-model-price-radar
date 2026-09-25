/** 共享 UI：顶栏/页脚、模型表格、模型详情抽屉、数据状态条 */
import { state, setSetting, toggleTheme, getModel } from './store.js';
import { money, price as fmtPrice, score as fmtScore, tokens, date, dateTime, relTime, escapeHtml, CATEGORY_LABEL, modality } from './format.js';
import { vendorColor, barList, hideTip } from './charts.js';

export const NAV = [
  { id: 'home', href: './index.html', label: '总览' },
  { id: 'models', href: './models.html', label: '全部模型' },
  { id: 'calculator', href: './calculator.html', label: '成本计算器' },
  { id: 'compare', href: './compare.html', label: '模型对比' },
  { id: 'about', href: './about.html', label: '方法论' },
];

const base = () => (location.pathname.includes('/model/') ? '../' : './');

/** 渲染顶栏与页脚 */
export function renderChrome(active) {
  const b = base();
  const nav = NAV.map((n) => `<a href="${b}${n.href.replace('./', '')}" class="${n.id === active ? 'active' : ''}">${n.label}</a>`).join('');
  const bar = document.createElement('header');
  bar.className = 'topbar';
  bar.innerHTML = `
    <div class="wrap topbar-inner">
      <button class="hamburger" id="nav-toggle" aria-label="打开导航">☰</button>
      <a class="brand" href="${b}index.html">
        <span class="brand-mark">◈</span>
        <span>AI 模型价格雷达</span>
      </a>
      <nav class="nav" id="site-nav">${nav}</nav>
      <div class="topbar-tools">
        <button class="btn btn-sm" id="ccy-toggle" title="切换计价货币">${state.settings.currency === 'CNY' ? '¥ CNY' : '$ USD'}</button>
        <button class="btn btn-sm" id="theme-toggle" title="切换深浅色">${state.settings.theme === 'dark' ? '🌙' : '☀️'}</button>
      </div>
    </div>`;
  document.body.prepend(bar);
  bar.querySelector('#nav-toggle').onclick = () => {
    bar.querySelector('#site-nav').classList.toggle('open');
  };
  bar.querySelectorAll('.nav a').forEach((a) => {
    a.addEventListener('click', () => bar.querySelector('#site-nav').classList.remove('open'));
  });
  bar.querySelector('#ccy-toggle').onclick = () => {
    setSetting('currency', state.settings.currency === 'CNY' ? 'USD' : 'CNY');
    location.reload();
  };
  bar.querySelector('#theme-toggle').onclick = () => {
    toggleTheme();
    bar.querySelector('#theme-toggle').textContent = state.settings.theme === 'dark' ? '🌙' : '☀️';
  };

  const foot = document.createElement('footer');
  foot.className = 'footer';
  foot.innerHTML = `
    <div class="wrap stack" style="gap:8px">
      <div class="row-between">
        <span>AI 模型价格雷达 · 数据来自 OpenRouter 公开模型接口与 models.dev，能力分来自 Artificial Analysis。</span>
        <span>价格以各厂商官网为准 · <a href="${b}about.html">方法论与免责声明</a></span>
      </div>
      <div class="mute tiny">本页为纯静态站点：数据文件 data/models.json，可用任意静态服务器托管；升级为动态服务时只需设置 window.__AI_API_BASE__。</div>
    </div>`;
  document.body.appendChild(foot);

  ensureDrawer();
}

/** 数据状态条：更新时间 / 来源 / 快照告警 */
export function dataStatusBar(meta) {
  const stale = meta.stale
    ? `<div class="notice warn" style="margin-bottom:14px">⚠ ${escapeHtml(meta.stale_reason || '当前展示的是上一次快照数据')}</div>` : '';
  const src = (meta.sources || []).map((s) => `${s.name}${s.ok ? '' : '（失败）'}`).join(' + ');
  return `${stale}
  <div class="row-between small mute" style="margin-bottom:14px">
    <span>数据更新：<b style="color:var(--text)">${dateTime(meta.generated_at)}</b>（${relTime(meta.generated_at)}） · 来源：${escapeHtml(src)}</span>
    <span>收录 ${meta.counts.all} 个模型 / ${meta.counts.vendors} 家厂商 · 其中 ${meta.counts.ranked} 个有第三方能力评分</span>
  </div>`;
}

/** 厂商名（优先中文） */
export function vendorName(v) { return v?.name_zh || v?.name || v?.id || '未知'; }

export function vendorBadge(m) {
  const v = m._vendor || {};
  return `<span class="vendor-dot" style="background:${v.brand || vendorColor(m.vendor_id)};color:${v.brand || vendorColor(m.vendor_id)}"></span>`;
}

export function modelCell(m, { showVendor = true, b = './' } = {}) {
  const v = m._vendor || {};
  return `<div class="model-cell">
    ${vendorBadge(m)}
    <div style="min-width:0">
      <div class="model-name"><a href="${b}model/${encodeURIComponent(slug(m))}.html" onclick="event.stopPropagation()">${escapeHtml(m.name)}</a></div>
      ${showVendor ? `<div class="model-sub">${escapeHtml(vendorName(v))}${m.deprecated ? ' · 已弃用' : ''}</div>` : ''}
    </div>
  </div>`;
}

export function slug(m) { return m.id.replace(/[^a-zA-Z0-9._-]/g, '-'); }

/** 能力分单元格 */
export function scoreCell(m) {
  if (m._composite == null) return `<span class="mute">—</span>`;
  const cls = m._composite >= 70 ? 'good' : m._composite >= 45 ? '' : 'warn';
  return `<div class="score-cell">
    <span class="score-v">${fmtScore(m._composite)}</span>
    <span class="bar ${cls}" style="width:52px"><i style="width:${m._composite}%"></i></span>
  </div>`;
}

/** 价格单元格：主价 + 缓存价提示 */
export function priceCell(v, extra = '') {
  if (v == null) return '<span class="mute">—</span>';
  return `${fmtPrice(v, { currency: state.settings.currency, rate: state.raw?.meta.fx.usd_cny })}
    ${extra ? `<div class="tiny mute">${extra}</div>` : ''}`;
}

export function paretoBadge(m) {
  return m._pareto && m._composite != null ? '<span class="badge badge-good" title="在价格-能力平面上不被任何模型同时做到更便宜且更强">★ 前沿</span>' : '';
}

/* ---------------- 模型详情抽屉 ---------------- */
let drawer, mask;

function ensureDrawer() {
  if (drawer) return;
  mask = document.createElement('div');
  mask.className = 'drawer-mask';
  mask.onclick = closeDrawer;
  drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', '模型详情');
  document.body.append(mask, drawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  if (/^#model=/.test(location.hash)) setTimeout(() => openModel(decodeURIComponent(location.hash.slice(7))), 60);
  window.addEventListener('hashchange', () => {
    if (/^#model=/.test(location.hash)) openModel(decodeURIComponent(location.hash.slice(7)));
    else closeDrawer();
  });
}

export function openModel(id) {
  const m = getModel(id);
  if (!m) return;
  ensureDrawer();
  hideTip();
  const b = base();
  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <div class="row" style="gap:8px">${vendorBadge(m)}<span class="small muted">${escapeHtml(vendorName(m._vendor))}</span>
          ${m._pareto ? '<span class="badge badge-good">★ 效率前沿</span>' : ''}
          ${m.tags.map((t) => `<span class="badge badge-accent">${escapeHtml(t)}</span>`).join('')}
        </div>
        <h2 style="margin-top:6px">${escapeHtml(m.name)}</h2>
        <div class="small mute mono">${escapeHtml(m.id)}</div>
      </div>
      <button class="btn btn-ghost" onclick="closeDrawer()" aria-label="关闭">✕</button>
    </div>
    <div class="drawer-body">${modelDetailHtml(m, { b })}</div>`;
  drawer.querySelectorAll('a[href]').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
  paintCapabilityBars(drawer, m);
  mask.classList.add('open');
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  history.replaceState(null, '', `#model=${encodeURIComponent(id)}`);
}

/**
 * 模型详情主体 HTML —— 抽屉与独立详情页共用同一份渲染逻辑。
 * @param {object} m 模型对象
 * @param {{b?:string}} opts b = 相对根路径前缀
 */
export function modelDetailHtml(m, { b = './' } = {}) {
  const rate = state.raw?.meta.fx.usd_cny || 7.1;
  const ccy = state.settings.currency;
  const v = m._vendor || {};

  const tiers = (m.price.tiers || []).map((t) => `<tr>
      <td>超过 ${tokens(t.min_input_tokens)} 输入</td>
      <td class="num">${priceOrDash(t.input, rate, ccy)}</td>
      <td class="num">${priceOrDash(t.output, rate, ccy)}</td>
      <td class="num">${priceOrDash(t.cache_read, rate, ccy)}</td></tr>`).join('');

  const officialLinks = [
    ['官方 API 文档', v.links?.docs],
    ['官方定价页', v.links?.pricing],
    ['控制台 / 申请 Key', v.links?.console],
  ].filter(([, url]) => url);

  const linkSourceNote = v.link_source === 'official'
    ? '<div class="tiny mute" style="margin-top:6px">以上为人工核验的厂商官方入口</div>'
    : v.link_source === 'models.dev'
      ? '<div class="tiny mute" style="margin-top:6px">该厂商官方入口来自 models.dev 收录</div>'
      : '<div class="tiny mute" style="margin-top:6px">该厂商未收录官方入口，暂以 OpenRouter 厂商页代替</div>';

  return `
      <div class="grid g4" style="gap:10px">
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${fmtScore(m._composite)}</span><span class="stat-l">综合能力分 / 100</span></div></div>
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${m._value != null ? m._value.toFixed(1) : '—'}</span><span class="stat-l">性价比（分/美元）</span></div></div>
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${m._blended != null ? fmtPrice(m._blended, { currency: ccy, rate }) : '—'}</span><span class="stat-l">混合价格 / 百万 token</span></div></div>
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${tokens(m.context_length)}</span><span class="stat-l">上下文窗口</span></div></div>
      </div>

      ${m.description ? `<div class="card"><p class="small muted" style="line-height:1.7">${escapeHtml(m.description)}</p></div>` : ''}

      <div class="card">
        <div class="card-head"><h3>价格明细</h3><span class="tiny mute">单位：${ccy === 'CNY' ? '人民币 / 百万 token（按汇率折算）' : '美元 / 百万 token'}</span></div>
        <div class="table-wrap" style="border:none">
        <table>
          <thead><tr><th>项目</th><th class="right">输入</th><th class="right">输出</th><th class="right">缓存读取</th></tr></thead>
          <tbody>
            <tr><td>标准价</td>
              <td class="num">${priceOrDash(m.price.input, rate, ccy)}</td>
              <td class="num">${priceOrDash(m.price.output, rate, ccy)}</td>
              <td class="num">${priceOrDash(m.price.cache_read, rate, ccy)}</td></tr>
            ${tiers}
          </tbody>
        </table>
        </div>
        <div class="row" style="gap:14px;margin-top:10px;flex-wrap:wrap">
          ${m.price.cache_write != null ? `<span class="badge badge-outline">缓存写入 ${priceOrDash(m.price.cache_write, rate, ccy)}</span>` : ''}
          ${m.price.web_search != null ? `<span class="badge badge-outline">联网搜索 ${money(m.price.web_search, { currency: ccy, rate, digits: 4 })}/次</span>` : ''}
          ${m.price_cny ? '<span class="badge badge-accent">官方人民币定价已收录</span>' : '<span class="badge badge-outline">人民币为汇率折算</span>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>能力评分</h3><span class="tiny mute">来源：Artificial Analysis</span></div>
        <div class="cap-bars"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
          ${m.scores.intelligence != null ? `<span class="badge badge-accent">智能指数 ${m.scores.intelligence}</span>` : '<span class="badge badge-warn">暂无第三方能力评分</span>'}
          ${m._percentile != null ? `<span class="badge badge-outline">强于 ${m._percentile}% 的收录模型</span>` : ''}
          ${m.scores.arena_elo ? `<span class="badge badge-outline">竞技场最高 Elo ${m.scores.arena_elo}</span>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>规格</h3></div>
        <dl class="kv">
          <dt>上下文</dt><dd class="mono">${tokens(m.context_length)} tokens</dd>
          <dt>最大输出</dt><dd class="mono">${tokens(m.max_output)} tokens</dd>
          <dt>输入模态</dt><dd>${m.modalities.input.map(modality).join(' / ') || '—'}</dd>
          <dt>输出模态</dt><dd>${m.modalities.output.map(modality).join(' / ') || '—'}</dd>
          <dt>推理模式</dt><dd>${m.capabilities.reasoning ? `支持${m.capabilities.reasoning_efforts.length ? '（' + m.capabilities.reasoning_efforts.join(' / ') + '）' : ''}` : '否'}</dd>
          <dt>工具调用</dt><dd>${m.capabilities.tool_call ? '支持' : '不支持'}</dd>
          <dt>结构化输出</dt><dd>${m.capabilities.structured_output ? '支持' : '不支持'}</dd>
          <dt>发布时间</dt><dd class="mono">${date(m.release_date)}</dd>
          <dt>类型</dt><dd>${CATEGORY_LABEL[m.category] || m.category}</dd>
        </dl>
      </div>

      <div class="card">
        <div class="card-head"><h3>API 平台入口</h3></div>
        <div class="link-list">
          ${officialLinks.map(([label, url]) => `<a class="link-item" href="${escapeHtml(url)}" target="_blank" rel="noopener">
              <span><span class="li-t">${label}</span><div class="li-u">${escapeHtml(hostOf(url))}</div></span><span class="mute">↗</span></a>`).join('')}
          <a class="link-item" href="${escapeHtml(m.links.openrouter)}" target="_blank" rel="noopener">
            <span><span class="li-t">OpenRouter 模型页（查看各服务商实时报价）</span><div class="li-u">openrouter.ai</div></span><span class="mute">↗</span></a>
        </div>
        ${linkSourceNote}
      </div>

      <div class="card">
        <div class="card-head"><h3>月成本试算</h3><span class="tiny mute">1 万次调用 × 2K 输入 × 500 输出</span></div>
        <div class="row-between">
          <span class="muted small">按标准价估算</span>
          <span class="mono" style="font-size:19px;font-weight:700">${money(monthly(m, 10000, 2000, 500), { currency: ccy, rate, digits: 2 })}<span class="small mute"> / 月</span></span>
        </div>
        <a class="btn btn-sm" style="margin-top:10px;display:inline-block" href="${b}calculator.html?in=${m.price.input}&out=${m.price.output}&name=${encodeURIComponent(m.name)}">在计算器中调整用量 →</a>
      </div>`;
}

/** 在给定容器内绘制能力条形图（详情抽屉 / 详情页共用） */
export function paintCapabilityBars(root, m) {
  const el = root.querySelector('.cap-bars') || root.querySelector('#cap-bars');
  if (!el) return;
  barList(el, [
    { label: '综合能力分', value: m._composite },
    { label: '智能指数', value: m.scores.intelligence },
    { label: '编程指数', value: m.scores.coding },
    { label: 'Agent 指数', value: m.scores.agentic },
    { label: '竞技场 Elo', value: m.scores.arena_elo ? m.scores.arena_elo - 1000 : null },
  ]);
}

export function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove('open');
  mask.classList.remove('open');
  document.body.style.overflow = '';
  if (/^#model=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}
window.closeDrawer = closeDrawer;
window.openModel = openModel;

function priceOrDash(v, rate, ccy) {
  return v == null ? '<span class="mute">—</span>' : fmtPrice(v, { currency: ccy, rate });
}
function hostOf(url) { try { return new URL(url).host; } catch { return url; } }
function monthly(m, req, inTok, outTok) {
  return (req * (inTok * m.price.input + outTok * m.price.output)) / 1e6;
}

/** 生成一行表格的公共列 */
export function modelRow(m, { rank = null, b = './', extraCols = [] } = {}) {
  const rate = state.raw?.meta.fx.usd_cny || 7.1;
  const ccy = state.settings.currency;
  return `<tr class="clickable" data-id="${escapeHtml(m.id)}">
    <td>${rank != null ? `<span class="rank ${rank <= 3 ? 'r' + rank : ''}">${rank}</span>` : ''}</td>
    <td>${modelCell(m, { b })}</td>
    <td>${scoreCell(m)}</td>
    <td class="num">${priceCell(m.price.input)}</td>
    <td class="num">${priceCell(m.price.output)}</td>
    <td class="num">${m._blended != null ? fmtPrice(m._blended, { currency: ccy, rate }) : '—'}</td>
    <td class="num">${m._value != null ? m._value.toFixed(1) : '<span class="mute">—</span>'}</td>
    <td class="num">${tokens(m.context_length)}</td>
    <td>${paretoBadge(m)}${m.open_weights ? '<span class="badge badge-outline">开源权重</span>' : ''}</td>
    ${extraCols.join('')}
  </tr>`;
}

/** 绑定表格行点击 → 打开详情 */
export function bindRows(host) {
  host.querySelectorAll('tr.clickable').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      openModel(tr.dataset.id);
    });
  });
}

/** 排序表头 */
export function sortableTh(key, label, sort, onSort, cls = '') {
  const active = sort.key === key;
  return `<th class="sortable ${cls} ${active ? 'sorted' : ''}" data-key="${key}">${label}<span class="arrow">${active ? (sort.dir === 'desc' ? '▼' : '▲') : '▼'}</span></th>`;
}
