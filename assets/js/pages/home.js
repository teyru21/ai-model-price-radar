/** 首页：总览榜单 + 价格-能力象限图 + 快捷筛选 */
import { boot } from './common.js';
import { state, setSetting } from '../store.js';
import { applyFilters, defaultFilters, sortModels, filtersFromUrl, filtersToUrl, renderFilterBar } from '../filters.js';
import { scatterChart, vendorColor } from '../charts.js';
import {
  dataStatusBar, modelCell, scoreCell, priceCell, paretoBadge, vendorName, vendorBadge, openModel, bindRows, modelRow,
} from '../ui.js';
import { money, price as fmtPrice, score as fmtScore, tokens, escapeHtml } from '../format.js';

let F = defaultFilters({ category: 'text', scoredOnly: false });
let host;

boot('home').then((ok) => {
  if (!ok) return;
  host = document.querySelector('#app');
  filtersFromUrl(F);
  render();
});

function render() {
  const meta = state.raw.meta;
  const rate = meta.fx.usd_cny;
  const ccyNow = state.settings.currency;
  const pool = applyFilters(state.models, F);
  const scored = pool.filter((m) => m._composite != null);

  const topValue = sortModels(scored, { key: 'value', dir: 'desc' }).slice(0, 12);
  const topIntel = [...state.models].filter((m) => m._composite != null).sort((a, b) => b._composite - a._composite).slice(0, 10);
  const cheapest = [...state.models].filter((m) => m._blended > 0 && m._composite != null).sort((a, b) => a._blended - b._blended).slice(0, 10);
  const best = topIntel[0];
  const frontierCount = state.models.filter((m) => m._pareto && m._composite != null).length;

  host.innerHTML = `
  ${dataStatusBar(meta)}

  <section class="hero stack" style="gap:16px">
    <div>
      <h1>主流 AI 模型 <span class="grad">价格 · 能力 · 性价比</span> 一屏看清</h1>
      <p class="lede">汇总 ${meta.counts.all} 个可调用模型的 <b>实时 token 单价</b>（输入 / 输出 / 缓存）、<b>Artificial Analysis 能力评分</b>，
      用统一口径算出 <b>性价比</b> 与 <b>效率前沿</b>，并直达每家厂商的 <b>API 平台入口</b>。</p>
    </div>
    <div class="grid g4">
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${meta.counts.all}</span><span class="stat-l">收录模型（${meta.counts.vendors} 家厂商）</span></div></div>
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${meta.counts.ranked}</span><span class="stat-l">有第三方能力评分</span></div></div>
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${best ? fmtScore(best._composite) : '—'}</span><span class="stat-l">当前最强：${best ? escapeHtml(best.name) : '—'}</span></div></div>
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${frontierCount}</span><span class="stat-l">位于效率前沿的模型</span></div></div>
    </div>

    <div class="card">
      <div class="row" style="gap:18px;flex-wrap:wrap">
        <div style="flex:1;min-width:280px">
          <div class="row-between" style="margin-bottom:6px">
            <span class="small"><b>调用结构假设</b>：输入 token 占比 <span class="mono" id="ratio-v">${Math.round(state.settings.ratio * 100)}%</span>
              <span class="mute">（输出占 ${100 - Math.round(state.settings.ratio * 100)}%）</span></span>
            <span class="tiny mute">拖动可改变性价比排名与图表横轴</span>
          </div>
          <input type="range" id="ratio" min="0" max="100" step="5" value="${Math.round(state.settings.ratio * 100)}">
          <div class="row-between tiny mute" style="margin-top:2px"><span>全部为输出（生成型）</span><span>3:1（默认，接近多数对话/RAG 场景）</span><span>全部为输入（读长文）</span></div>
        </div>
        <div style="min-width:240px">
          <div class="tiny mute">混合价格公式</div>
          <div class="mono small">blended = 输入价 × ${Math.round(state.settings.ratio * 100)}% + 输出价 × ${100 - Math.round(state.settings.ratio * 100)}%</div>
          <div class="tiny mute" style="margin-top:5px">性价比 = 综合能力分 ÷ 混合价格（单位：分 / 美元）</div>
        </div>
      </div>
    </div>
  </section>

  <div id="filter-bar" style="margin-top:18px"></div>

  <section class="stack" style="margin-top:18px">
    <div class="row-between">
      <h2>★ 性价比排行榜 <span class="small mute">（当前筛选下 ${scored.length} 个有评分的模型参与排名）</span></h2>
      <span class="small mute">性价比 = 综合能力分 ÷ 混合价格</span>
    </div>
    <div class="notice info">
      性价比是「每 1 美元买到的能力分」，因此<b>极低价模型天然排在最前</b>——它回答的是「最省钱」，不是「最值得买」。
      想看真正该选的型号，请用下方<b>能力下限</b>筛选，或直接看象限图上的<b>效率前沿</b>（★）：前沿上的模型，没有任何模型能同时做到更便宜且更强。
    </div>
    <div class="rank-cards" id="value-cards"></div>
  </section>

  <section class="card" style="margin-top:22px">
    <div class="card-head">
      <h2>能力 - 价格象限图</h2>
      <span class="small mute">虚线为效率前沿：线上的模型没有任何模型能同时做到更便宜且更强 · 点击圆点查看详情</span>
    </div>
    <div class="chart-host" id="scatter"></div>
    <div class="legend" id="legend"></div>
  </section>

  <div class="grid g2" style="margin-top:22px">
    <section class="card">
      <div class="card-head"><h2>能力最强 TOP 10</h2><span class="small mute">Artificial Analysis 智能指数</span></div>
      <div class="table-wrap" style="border:none">
        <table>
          <thead><tr><th>#</th><th>模型</th><th>能力分</th><th class="right">混合价格</th><th class="right">性价比</th></tr></thead>
          <tbody id="top-intel"></tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>最便宜的可用模型 TOP 10</h2><span class="small mute">仅统计有第三方评分的模型</span></div>
      <div class="table-wrap" style="border:none">
        <table>
          <thead><tr><th>#</th><th>模型</th><th>能力分</th><th class="right">混合价格</th><th class="right">性价比</th></tr></thead>
          <tbody id="cheap"></tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="card" style="margin-top:22px">
    <div class="card-head"><h2>按厂商浏览 API 平台</h2><span class="small mute">点击进入该厂商官方 API 文档 / 定价页</span></div>
    <div class="rank-cards" id="vendor-cards"></div>
  </section>
  `;

  // --- 占比滑块 ---
  const ratio = host.querySelector('#ratio');
  const paint = () => ratio.style.setProperty('--pct', `${ratio.value}%`);
  paint();
  ratio.oninput = () => {
    host.querySelector('#ratio-v').textContent = `${ratio.value}%`;
    paint();
  };
  ratio.onchange = () => { setSetting('ratio', Number(ratio.value) / 100); render(); };

  // --- 筛选栏 ---
  renderFilterBar(host.querySelector('#filter-bar'), F, (patch, reset) => {
    F = reset ? defaultFilters({ category: patch.category ?? F.category }) : { ...F, ...patch };
    filtersToUrl(F);
    render();
  });

  // --- 性价比卡片 ---
  host.querySelector('#value-cards').innerHTML = topValue.length ? topValue.map((m, i) => `
    <article class="rank-card ${i < 3 ? 'rc-top rc-top-' + (i + 1) : ''}" data-id="${escapeHtml(m.id)}">
      <div class="rank-card-top">
        <div class="row" style="gap:8px;min-width:0">
          <span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${m._valueRank}</span>
          <div style="min-width:0">
            <div class="model-name" style="font-size:14px">${escapeHtml(m.name)}</div>
            <div class="model-sub">${escapeHtml(vendorName(m._vendor))}</div>
          </div>
        </div>
        ${m._pareto ? '<span class="badge badge-good" title="效率前沿">★</span>' : ''}
      </div>
      <div class="rank-card-metrics">
        <div class="metric"><span class="metric-v">${m._value.toFixed(1)}</span><span class="metric-l">性价比</span></div>
        <div class="metric"><span class="metric-v">${fmtScore(m._composite)}</span><span class="metric-l">能力分</span></div>
        <div class="metric"><span class="metric-v">${fmtPrice(m._blended, { currency: ccyNow, rate })}</span><span class="metric-l">混合价/百万</span></div>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <span class="badge badge-outline">输入 ${fmtPrice(m.price.input, { currency: ccyNow, rate })}</span>
        <span class="badge badge-outline">输出 ${fmtPrice(m.price.output, { currency: ccyNow, rate })}</span>
        ${m.open_weights ? '<span class="badge badge-outline">开源权重</span>' : ''}
      </div>
    </article>`).join('') : '<p class="muted">当前筛选条件下没有模型。</p>';
  host.querySelectorAll('.rank-card').forEach((c) => { c.onclick = () => openModel(c.dataset.id); });

  // --- 散点图 ---
  const vendorSet = [...new Set(scored.map((m) => m.vendor_id))];
  const topVendors = vendorSet
    .map((v) => [v, scored.filter((m) => m.vendor_id === v).length])
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v]) => v);
  const activeVendors = F.vendors.length ? new Set(F.vendors) : null;

  scatterChart(host.querySelector('#scatter'), {
    points: scored.map((m) => ({
      id: m.id,
      label: m.name,
      vendor: vendorName(m._vendor),
      price: m._blended,
      score: m._composite,
      value: m._value,
      pareto: m._pareto,
      color: m._vendor?.brand || vendorColor(m.vendor_id),
      dim: activeVendors ? !activeVendors.has(m.vendor_id) : false,
    })),
    currency: ccyNow,
    rate,
    fmtMoney: (v, o) => money(v, o),
    onSelect: openModel,
  });

  host.querySelector('#legend').innerHTML = topVendors.map((v) => {
    const vd = state.vendorById.get(v);
    return `<span class="legend-item" data-vendor="${v}">
      <span class="chip-dot" style="background:${vd?.brand || vendorColor(v)}"></span>${escapeHtml(vendorName(vd))}</span>`;
  }).join('') + `<span class="legend-item" style="cursor:default"><span style="display:inline-block;width:14px;border-top:2px dashed var(--good)"></span>效率前沿</span>`;

  host.querySelectorAll('.legend-item[data-vendor]').forEach((l) => {
    l.onclick = () => {
      const set = new Set(F.vendors);
      set.has(l.dataset.vendor) ? set.delete(l.dataset.vendor) : set.add(l.dataset.vendor);
      F = { ...F, vendors: [...set] };
      filtersToUrl(F);
      render();
    };
  });

  // --- TOP 表 ---
  const rowMini = (m, rank) => `<tr class="clickable" data-id="${escapeHtml(m.id)}">
      <td><span class="rank ${rank <= 3 ? 'r' + rank : ''}">${rank}</span></td>
      <td>${modelCell(m, { b: './' })}</td>
      <td>${scoreCell(m)}</td>
      <td class="num">${fmtPrice(m._blended, { currency: ccyNow, rate })}</td>
      <td class="num">${m._value != null ? m._value.toFixed(1) : '—'}</td>
    </tr>`;
  host.querySelector('#top-intel').innerHTML = topIntel.map((m, i) => rowMini(m, i + 1)).join('');
  host.querySelector('#cheap').innerHTML = cheapest.map((m, i) => rowMini(m, i + 1)).join('');
  host.querySelectorAll('table').forEach(bindRows);

  // --- 厂商入口 ---
  const vlist = state.vendors
    .map((v) => ({ v, n: state.models.filter((m) => m.vendor_id === v.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  host.querySelector('#vendor-cards').innerHTML = vlist.map(({ v, n }) => {
    const links = v.links || {};
    const target = links.pricing || links.docs || '#';
    return `<a class="rank-card" href="${escapeHtml(target)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div class="rank-card-top">
        <div class="row" style="gap:8px">
          <span class="chip-dot" style="background:${v.brand || vendorColor(v.id)};width:10px;height:10px"></span>
          <div><div class="model-name">${escapeHtml(vendorName(v))}</div>
          <div class="model-sub">${escapeHtml(v.region === 'cn' ? '中国大陆' : v.region === 'eu' ? '欧洲' : v.region === 'us' ? '美国' : '其他')} · ${n} 个模型</div></div>
        </div>
        ${v.official ? '<span class="badge badge-good">官方入口</span>' : '<span class="badge badge-outline">聚合入口</span>'}
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        ${links.docs ? '<span class="badge badge-outline">API 文档</span>' : ''}
        ${links.pricing ? '<span class="badge badge-outline">定价页</span>' : ''}
        ${links.console ? '<span class="badge badge-outline">控制台</span>' : ''}
      </div>
    </a>`;
  }).join('');
}
