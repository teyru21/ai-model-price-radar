/**
 * 首页：效率前沿榜 + 性价比榜（能力门槛）+ 价格-能力象限图 + 场景入口
 *
 * 设计原则（v2 调整）：
 *  - 榜单只收录「有第三方能力评分」的模型，无评分模型不进榜（仍可在全部模型页查到）
 *  - 主榜用「效率前沿」而非裸性价比，避免极低价弱模型霸榜
 *  - 次榜（性价比）加能力分 ≥ 60 门槛，并明确标注口径
 *  - 首页不再堆筛选控件、厂商卡片与长说明，需要筛选请去「全部模型」页
 */
import { boot } from './common.js';
import { state, setSetting } from '../store.js';
import { scatterChart, vendorColor } from '../charts.js';
import {
  dataStatusBar, scoreCell, openModel, vendorName,
} from '../ui.js';
import { price as fmtPrice, score as fmtScore, escapeHtml } from '../format.js';

const VALUE_MIN_SCORE = 60; // 性价比榜的能力门槛：低于此分不参与（避免「便宜但弱」霸榜）
let legendFilter = new Set(); // 图例点击只做视觉过滤，不写 URL、不产生筛选状态
let host;

boot('home').then((ok) => {
  if (!ok) return;
  host = document.querySelector('#app');
  render();
});

function render() {
  const meta = state.raw.meta;
  const rate = meta.fx.usd_cny;
  const ccyNow = state.settings.currency;

  // 榜单池：仅统计有第三方评分的模型（对应 Q6：无评分模型不进任何榜单）
  const scored = state.models.filter((m) => m._composite != null);
  const frontier = scored.filter((m) => m._pareto).sort((a, b) => b._composite - a._composite);
  const topFrontier = frontier.slice(0, 8);
  const best = [...scored].sort((a, b) => b._composite - a._composite)[0];
  const bestValue = scored
    .filter((m) => m._composite >= VALUE_MIN_SCORE && m._value != null)
    .sort((a, b) => b._value - a._value)
    .slice(0, 10);

  host.innerHTML = `
  ${dataStatusBar(meta)}

  <section class="hero stack" style="gap:16px">
    <div>
      <h1>主流 AI 模型 <span class="grad">价格 · 能力 · 性价比</span> 一屏看清</h1>
      <p class="lede">汇总 ${meta.counts.all} 个可调用模型的 <b>token 单价</b>与 <b>Artificial Analysis 能力评分</b>，
      用统一口径算出<b>性价比</b>与<b>效率前沿</b>，并直达各厂商的 <b>API 平台入口</b>。</p>
    </div>
    <div class="grid g4">
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${meta.counts.all}</span><span class="stat-l">收录模型（${meta.counts.vendors} 家厂商）</span></div></div>
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${meta.counts.ranked}</span><span class="stat-l">有第三方能力评分</span></div></div>
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${best ? fmtScore(best._composite) : '—'}</span><span class="stat-l">当前最强：${best ? escapeHtml(best.name) : '—'}</span></div></div>
      <div class="card pad-sm"><div class="stat"><span class="stat-v">${frontier.length}</span><span class="stat-l">位于效率前沿</span></div></div>
    </div>
  </section>

  <section class="stack" style="margin-top:22px">
    <div class="row-between">
      <h2>★ 效率前沿榜 <span class="small mute">（共 ${frontier.length} 个，展示前 ${topFrontier.length}）</span></h2>
      <span class="small mute">性价比 = 能力分 ÷ 混合价 · <a href="./about.html">完整口径</a></span>
    </div>
    <p class="small mute" style="margin-top:-8px">
      前沿上的模型，<b>没有任何模型能同时做到更便宜且更强</b>——这比「性价比排行榜」更接近「真正值得买」，
      因为后者会被极低价但很弱的模型霸榜。
    </p>
    <div class="rank-cards" id="frontier-cards"></div>
  </section>

  <section class="card" style="margin-top:22px">
    <div class="card-head">
      <h2>性价比榜 <span class="badge badge-accent">能力分 ≥ ${VALUE_MIN_SCORE}</span></h2>
      <span class="small mute">已排除能力分低于 ${VALUE_MIN_SCORE} 的弱模型 · 完整榜单见「全部模型」页</span>
    </div>
    <div class="table-wrap" style="border:none">
      <table>
        <thead><tr><th style="width:52px">#</th><th>模型</th><th>能力分</th><th class="right">混合价格</th><th class="right">性价比</th></tr></thead>
        <tbody id="value-rows"></tbody>
      </table>
    </div>
  </section>

  <section class="card" style="margin-top:22px">
    <div class="card-head">
      <h2>能力 - 价格象限图</h2>
      <span class="small mute">虚线为效率前沿 · 点击圆点查看详情</span>
    </div>
    <div class="ratio-inline">
      <span class="small nowrap"><b>输入 token 占比</b></span>
      <input type="range" id="ratio" min="0" max="100" step="5" value="${Math.round(state.settings.ratio * 100)}">
      <span class="mono small nowrap" id="ratio-v">${Math.round(state.settings.ratio * 100)}%</span>
      <span class="tiny mute nowrap">拖动改变混合价与横轴位置</span>
    </div>
    <div class="chart-host" id="scatter"></div>
    <div class="legend" id="legend"></div>
  </section>

  <section class="stack" style="margin-top:22px">
    <h2>按场景快速选</h2>
    <div class="grid g3">
      <a class="scene-card" href="./models.html?sort=blended&amp;dir=asc">
        <span class="scene-icon">💰</span>
        <span class="scene-title">预算优先</span>
        <span class="scene-desc">按混合价格从低到高，列出最省钱的可选模型。</span>
        <span class="scene-go">打开全部模型（按价格升序）→</span>
      </a>
      <a class="scene-card" href="./models.html?sort=intelligence&amp;dir=desc">
        <span class="scene-icon">🚀</span>
        <span class="scene-title">能力优先</span>
        <span class="scene-desc">按能力分从高到低，看当前最强的梯队是哪几家。</span>
        <span class="scene-go">打开全部模型（按能力降序）→</span>
      </a>
      <a class="scene-card" href="./calculator.html">
        <span class="scene-icon">🧮</span>
        <span class="scene-title">算清成本</span>
        <span class="scene-desc">填入你的调用量，估算每月实际花多少钱、谁最划算。</span>
        <span class="scene-go">打开成本计算器 →</span>
      </a>
    </div>
  </section>
  `;

  // --- 效率前沿榜卡片 ---
  host.querySelector('#frontier-cards').innerHTML = topFrontier.length ? topFrontier.map((m, i) => `
    <article class="rank-card ${i < 3 ? 'rc-top rc-top-' + (i + 1) : ''}" data-id="${escapeHtml(m.id)}">
      <div class="rank-card-top">
        <div class="row" style="gap:8px;min-width:0">
          <span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span>
          <div style="min-width:0">
            <div class="model-name" style="font-size:14px">${escapeHtml(m.name)}</div>
            <div class="model-sub">${escapeHtml(vendorName(m._vendor))}</div>
          </div>
        </div>
        <span class="badge badge-good" title="没有任何模型能同时做到更便宜且更强">★ 前沿</span>
      </div>
      <div class="rank-card-metrics">
        <div class="metric"><span class="metric-v">${fmtScore(m._composite)}</span><span class="metric-l">能力分</span></div>
        <div class="metric"><span class="metric-v">${fmtPrice(m._blended, { currency: ccyNow, rate })}</span><span class="metric-l">混合价/百万</span></div>
        <div class="metric"><span class="metric-v">${m._value != null ? m._value.toFixed(1) : '—'}</span><span class="metric-l">性价比</span></div>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <span class="badge badge-outline">输入 ${fmtPrice(m.price.input, { currency: ccyNow, rate })}</span>
        <span class="badge badge-outline">输出 ${fmtPrice(m.price.output, { currency: ccyNow, rate })}</span>
        ${m.open_weights ? '<span class="badge badge-outline">开源权重</span>' : ''}
      </div>
    </article>`).join('') : '<p class="muted">没有可展示的前沿模型。</p>';
  host.querySelectorAll('#frontier-cards .rank-card').forEach((c) => { c.onclick = () => openModel(c.dataset.id); });

  // --- 性价比榜（有门槛） ---
  host.querySelector('#value-rows').innerHTML = bestValue.length ? bestValue.map((m, i) => `
    <tr class="clickable" data-id="${escapeHtml(m.id)}">
      <td><span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span></td>
      <td>
        <div class="row" style="gap:8px">
          <span class="vendor-dot" style="background:${m._vendor?.brand || vendorColor(m.vendor_id)};color:${m._vendor?.brand || vendorColor(m.vendor_id)}"></span>
          <span class="model-name">${escapeHtml(m.name)}</span>
          <span class="model-sub nowrap">${escapeHtml(vendorName(m._vendor))}</span>
        </div>
      </td>
      <td>${scoreCell(m)}</td>
      <td class="num">${fmtPrice(m._blended, { currency: ccyNow, rate })}</td>
      <td class="num"><b>${m._value.toFixed(1)}</b></td>
    </tr>`).join('') : '<tr><td colspan="5" class="center muted" style="padding:26px">没有满足条件的模型</td></tr>';
  host.querySelectorAll('#value-rows tr.clickable').forEach((tr) => {
    tr.onclick = () => openModel(tr.dataset.id);
  });

  // --- 占比滑块（影响混合价、性价比与横轴） ---
  const ratio = host.querySelector('#ratio');
  const paint = () => ratio.style.setProperty('--pct', `${ratio.value}%`);
  paint();
  ratio.oninput = () => {
    host.querySelector('#ratio-v').textContent = `${ratio.value}%`;
    paint();
  };
  ratio.onchange = () => { setSetting('ratio', Number(ratio.value) / 100); render(); };

  // --- 象限图 ---
  const vendorSet = [...new Set(scored.map((m) => m.vendor_id))];
  const topVendors = vendorSet
    .map((v) => [v, scored.filter((m) => m.vendor_id === v).length])
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v]) => v);

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
      dim: legendFilter.size ? !legendFilter.has(m.vendor_id) : false,
    })),
    currency: ccyNow,
    rate,
    fmtMoney: (v, o) => fmtPrice(v, o),
    onSelect: openModel,
  });

  host.querySelector('#legend').innerHTML = topVendors.map((v) => {
    const vd = state.vendorById.get(v);
    const on = legendFilter.has(v);
    return `<span class="legend-item" data-vendor="${v}" style="${on ? 'color:var(--accent);font-weight:600' : ''}">
      <span class="chip-dot" style="background:${vd?.brand || vendorColor(v)}"></span>${escapeHtml(vendorName(vd))}</span>`;
  }).join('')
    + (legendFilter.size ? '<span class="legend-item" data-clear style="color:var(--accent)">✕ 清除高亮</span>' : '')
    + '<span class="legend-item" style="cursor:default"><span style="display:inline-block;width:14px;border-top:2px dashed var(--good)"></span>效率前沿</span>';

  host.querySelectorAll('.legend-item[data-vendor]').forEach((l) => {
    l.onclick = () => {
      const v = l.dataset.vendor;
      legendFilter.has(v) ? legendFilter.delete(v) : legendFilter.add(v);
      render();
    };
  });
  const lc = host.querySelector('.legend-item[data-clear]');
  if (lc) lc.onclick = () => { legendFilter = new Set(); render(); };
}
