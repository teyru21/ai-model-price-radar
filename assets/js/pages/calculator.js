/** 成本计算器：按真实调用量估算月成本，并给出同预算下的最优选择 */
import { boot, rateOf } from './common.js';
import { state } from '../store.js';
import { applyFilters, defaultFilters, mainstreamVendorIds } from '../filters.js';
import { dataStatusBar, openModel, modelCell, scoreCell, paretoBadge, vendorName } from '../ui.js';
import { money, price as fmtPrice, score as fmtScore, tokens, int, escapeHtml } from '../format.js';

const PRESETS = [
  { id: 'chatbot', name: '客服机器人', requests: 30000, inTok: 1500, outTok: 400, note: '每轮带历史上下文，回答较短' },
  { id: 'rag', name: 'RAG 知识库问答', requests: 20000, inTok: 6000, outTok: 500, note: '检索片段长，输出为要点式回答' },
  { id: 'code', name: '代码助手补全', requests: 50000, inTok: 3000, outTok: 300, note: '高频、短输出、低延迟敏感' },
  { id: 'doc', name: '长文档摘要', requests: 3000, inTok: 60000, outTok: 2500, note: '超长输入，输出为结构化摘要' },
  { id: 'agent', name: 'Agent 工作流', requests: 8000, inTok: 20000, outTok: 4000, note: '多轮工具调用，输入输出都大' },
  { id: 'batch', name: '批量分类打标', requests: 500000, inTok: 300, outTok: 30, note: '海量短请求，成本极度敏感' },
];

let cfg = { ...PRESETS[0], budget: null, category: 'text', mainstreamOnly: true, scoredOnly: true };
let host;

boot('calculator').then((ok) => {
  if (!ok) return;
  host = document.querySelector('#app');
  const p = new URLSearchParams(location.search);
  if (p.has('name')) cfg.presetName = p.get('name');
  if (p.has('in')) cfg.inTok = Number(p.get('in')) || cfg.inTok;
  if (p.has('out')) cfg.outTok = Number(p.get('out')) || cfg.outTok;
  if (p.has('req')) cfg.requests = Number(p.get('req')) || cfg.requests;
  render();
});

/** 单次调用成本 */
function callCost(m) {
  return (cfg.inTok * m.price.input + cfg.outTok * m.price.output) / 1e6;
}
function monthly(m) { return callCost(m) * cfg.requests; }

function render() {
  const meta = state.raw.meta;
  const rate = meta.fx.usd_cny;
  const ccyNow = state.settings.currency;

  // 计算器里按调用量口径评估，所以「混合比例」由输入/输出 token 直接决定
  const models = applyFilters(
    state.models,
    defaultFilters({ category: cfg.category, mainstreamOnly: cfg.mainstreamOnly, scoredOnly: cfg.scoredOnly }),
  ).filter((m) => m.category === cfg.category);

  const calc = models.map((m) => ({ m, monthly: monthly(m), call: callCost(m) }))
    .filter((x) => Number.isFinite(x.monthly));
  const byCost = [...calc].sort((a, b) => a.monthly - b.monthly);
  const inBudget = cfg.budget ? calc.filter((x) => x.monthly <= cfg.budget) : calc;
  const bestInBudget = [...inBudget].sort((a, b) => (b.m._composite ?? -1) - (a.m._composite ?? -1))[0];
  const cheapest = byCost[0];
  const maxCost = byCost.length ? byCost[byCost.length - 1].monthly : 0;

  host.innerHTML = `
    <div style="margin-bottom:14px">
      <h1>API 成本计算器</h1>
      <p class="muted" style="margin-top:6px">输入你的真实调用量，估算各模型的月度成本，并找出「同预算下能力最强」的选择。数据为公开标价，实际费用以厂商账单为准。</p>
    </div>
    ${dataStatusBar(meta)}

    <div class="grid g-1-2" style="margin-top:16px">
      <section class="card stack" style="gap:14px">
        <div>
          <h3 style="margin-bottom:9px">场景预设</h3>
          <div class="preset-row">
            ${PRESETS.map((p) => `<button class="chip" data-preset="${p.id}" aria-pressed="${cfg.requests === p.requests && cfg.inTok === p.inTok && cfg.outTok === p.outTok}">${p.name}</button>`).join('')}
          </div>
          <p class="tiny mute" style="margin-top:8px">${escapeHtml(PRESETS.find((p) => p.requests === cfg.requests && p.inTok === cfg.inTok && p.outTok === cfg.outTok)?.note || '已自定义用量参数')}</p>
        </div>

        <label class="field">每月请求数（次）
          <input type="number" id="c-req" min="1" step="1000" value="${cfg.requests}"></label>
        <label class="field">平均输入 tokens / 次
          <input type="number" id="c-in" min="0" step="100" value="${cfg.inTok}"></label>
        <label class="field">平均输出 tokens / 次
          <input type="number" id="c-out" min="0" step="100" value="${cfg.outTok}"></label>
        <label class="field">月度预算上限（${ccyNow === 'CNY' ? '人民币' : '美元'}，可选）
          <input type="number" id="c-budget" min="0" step="100" placeholder="不限" value="${cfg.budget ? (ccyNow === 'CNY' ? Math.round(cfg.budget * rate) : cfg.budget) : ''}"></label>

        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="chip" data-t="mainstreamOnly" aria-pressed="${cfg.mainstreamOnly}">只看主流厂商</button>
          <button class="chip" data-t="scoredOnly" aria-pressed="${cfg.scoredOnly}">只看有第三方评分</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${[['text', '文本生成'], ['image', '图像生成'], ['video', '视频生成'], ['audio', '音频生成']]
            .map(([v, l]) => `<button class="chip" data-cat="${v}" aria-pressed="${cfg.category === v}">${l}</button>`).join('')}
        </div>
      </section>

      <section class="stack" style="gap:16px">
        <div class="grid g3">
          <div class="card pad-sm"><div class="stat">
            <span class="stat-v">${cheapest ? money(cheapest.monthly, { currency: ccyNow, rate, digits: 2 }) : '—'}</span>
            <span class="stat-l">最低月成本${cheapest ? '：' + escapeHtml(cheapest.m.name) : ''}</span></div></div>
          <div class="card pad-sm"><div class="stat">
            <span class="stat-v">${bestInBudget ? escapeHtml(bestInBudget.m.name) : '—'}</span>
            <span class="stat-l">预算内能力最强${bestInBudget ? `（能力分 ${fmtScore(bestInBudget.m._composite)}）` : ''}</span></div></div>
          <div class="card pad-sm"><div class="stat">
            <span class="stat-v">${int(calc.length)}</span>
            <span class="stat-l">参与对比的模型数</span></div></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>成本分布（对数轴）</h3><span class="small mute">每根条 = 一个模型的月成本</span></div>
          <div id="cost-bars"></div>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:44px">#</th><th>模型</th><th>能力分</th>
              <th class="right">单次成本</th><th class="right">月成本</th><th class="right">占最低成本倍数</th><th></th>
            </tr></thead>
            <tbody id="calc-rows"></tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  host.querySelectorAll('[data-preset]').forEach((b) => {
    b.onclick = () => { const p = PRESETS.find((x) => x.id === b.dataset.preset); cfg = { ...cfg, ...p, budget: cfg.budget }; render(); };
  });
  host.querySelectorAll('[data-t]').forEach((b) => {
    b.onclick = () => { cfg = { ...cfg, [b.dataset.t]: b.getAttribute('aria-pressed') !== 'true' }; render(); };
  });
  host.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => { cfg = { ...cfg, category: b.dataset.cat }; render(); };
  });
  const onNum = (id, key) => {
    host.querySelector(id).onchange = (e) => {
      const v = Number(e.target.value);
      cfg = { ...cfg, [key]: Number.isFinite(v) && v >= 0 ? v : cfg[key] };
      render();
    };
  };
  onNum('#c-req', 'requests');
  onNum('#c-in', 'inTok');
  onNum('#c-out', 'outTok');
  host.querySelector('#c-budget').onchange = (e) => {
    const v = e.target.value === '' ? null : Number(e.target.value);
    cfg = { ...cfg, budget: Number.isFinite(v) ? (ccyNow === 'CNY' ? v / rate : v) : null };
    render();
  };

  // 成本条（对数刻度，避免被最贵模型压扁）
  const bars = byCost.slice(0, 40);
  if (bars.length) {
    const lmin = Math.log10(Math.max(bars[0].monthly, 0.01));
    const lmax = Math.log10(Math.max(maxCost, 0.01));
    host.querySelector('#cost-bars').innerHTML = bars.map((x) => {
      const w = lmax > lmin ? ((Math.log10(Math.max(x.monthly, 0.01)) - lmin) / (lmax - lmin)) * 100 : 100;
      return `<div class="row" style="gap:9px;margin:5px 0" title="${escapeHtml(x.m.name)}：${money(x.monthly, { currency: ccyNow, rate, digits: 2 })}/月">
        <span class="tiny muted" style="width:132px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.m.name)}</span>
        <span class="bar" style="flex:1"><i style="width:${Math.max(1.5, w)}%"></i></span>
        <span class="mono tiny" style="width:82px;text-align:right;flex:none">${money(x.monthly, { currency: ccyNow, rate, digits: 0 })}</span>
      </div>`;
    }).join('');
  }

  const minCost = cheapest ? cheapest.monthly : 0;
  host.querySelector('#calc-rows').innerHTML = byCost.map((x, i) => `
    <tr class="clickable" data-id="${escapeHtml(x.m.id)}">
      <td class="mono small mute">${i + 1}</td>
      <td>${modelCell(x.m, { b: './' })}</td>
      <td>${scoreCell(x.m)}</td>
      <td class="num">${money(x.call, { currency: ccyNow, rate, digits: 5 })}</td>
      <td class="num"><b>${money(x.monthly, { currency: ccyNow, rate, digits: 2 })}</b></td>
      <td class="num">${minCost > 0 ? (x.monthly / minCost).toFixed(1) + '×' : '—'}</td>
      <td>${paretoBadge(x.m)}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="center muted" style="padding:26px">没有符合条件的模型</td></tr>';

  host.querySelectorAll('#calc-rows tr.clickable').forEach((tr) => {
    tr.addEventListener('click', (e) => { if (!e.target.closest('a')) openModel(tr.dataset.id); });
  });
}
