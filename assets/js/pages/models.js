/** 全部模型：完整表格 + 筛选排序 + CSV 导出 + 厂商入口 */
import { boot } from './common.js';
import { state } from '../store.js';
import { applyFilters, defaultFilters, sortModels, filtersFromUrl, filtersToUrl, renderFilterBar } from '../filters.js';
import {
  dataStatusBar, modelCell, scoreCell, priceCell, paretoBadge, openModel, sortableTh, vendorName, slug, rankHint, bindRows,
} from '../ui.js';
import { price as fmtPrice, tokens, escapeHtml } from '../format.js';
import { vendorColor } from '../charts.js';

/**
 * 默认排序为「能力分 高 → 低」（定义在 filters.js 的 DEFAULT_SORT）：
 * 不默认按性价比排序，因为性价比 = 能力分 ÷ 混合价，会被极低价弱模型霸榜；
 * 打开页面第一眼看到「最强」比看到「最便宜但很弱」更合理。想按价格找可用排序下拉或首页场景入口。
 */
let F = defaultFilters({ category: 'text', scoredOnly: false });
let host;

const COLS = [
  ['', null], ['模型', 'name'], ['能力分', 'intelligence'], ['输入价', 'input'], ['输出价', 'output'],
  ['混合价', 'blended'], ['性价比', 'value'], ['上下文', 'context'], ['标签', null], ['操作', null],
];

boot('models').then((ok) => {
  if (!ok) return;
  host = document.querySelector('#app');
  filtersFromUrl(F);
  render();
});

function render() {
  const meta = state.raw.meta;
  const rate = meta.fx.usd_cny;
  const ccyNow = state.settings.currency;
  const list = sortModels(applyFilters(state.models, F), F.sort);
  const hintOf = (m) => rankHint(m, F.sort); // 只显示与当前排序对应的名次

  host.innerHTML = `
    <div class="row-between" style="margin-bottom:14px">
      <div>
        <h1>全部模型价格表</h1>
        <p class="muted" style="margin-top:6px">共 ${meta.counts.all} 个模型，当前筛选出 <b>${list.length}</b> 个。点击任意一行查看价格明细、能力评分与 API 平台入口。</p>
      </div>
      <div class="row">
        <button class="btn" id="export">导出 CSV</button>
      </div>
    </div>
    ${dataStatusBar(meta)}
    <div id="filter-bar"></div>
    <div class="table-wrap" style="margin-top:16px">
      <table id="tbl">
        <thead><tr>
          <th style="width:44px">#</th>
          ${COLS.slice(1).map(([k, label]) => (k && k !== 'name'
            ? sortableTh(k, label, F.sort, () => {}, 'right')
            : `<th>${label}</th>`)).join('')}
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <p class="small mute" style="margin-top:10px">
      价格单位：${ccyNow === 'CNY' ? '人民币 / 百万 token（按汇率折算，非官方人民币定价）' : '美元 / 百万 token'}。
      能力分为 Artificial Analysis 智能指数归一化结果（本站收录最高分记为 100）；标注<b>「未评分」</b>的模型暂无第三方评分，不参与任何榜单与排名。
    </p>

    <section class="card" style="margin-top:22px">
      <div class="card-head">
        <h2>按厂商浏览 API 平台</h2>
        <span class="small mute">仅列出有第三方评分的厂商 · 点击进入官方 API 文档 / 定价页</span>
      </div>
      <div class="rank-cards" id="vendor-cards"></div>
    </section>
  `;

  renderFilterBar(host.querySelector('#filter-bar'), F, (patch, reset) => {
    F = reset ? defaultFilters({ category: patch.category ?? F.category }) : { ...F, ...patch };
    filtersToUrl(F);
    render();
  });

  // 排序表头
  host.querySelectorAll('th.sortable').forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.key;
      const dir = F.sort.key === key && F.sort.dir === 'desc' ? 'asc' : 'desc';
      F = { ...F, sort: { key, dir, label: th.textContent.trim() } };
      filtersToUrl(F);
      render();
    };
  });

  const hintLine = (m, key) => (F.sort.key === key && hintOf(m) ? `<div class="tiny mute">${hintOf(m)}</div>` : '');

  host.querySelector('#rows').innerHTML = list.map((m, i) => `
    <tr class="clickable" data-id="${escapeHtml(m.id)}">
      <td class="mono small mute">${i + 1}</td>
      <td>${modelCell(m, { compact: true })}</td>
      <td>${scoreCell(m)}${hintLine(m, 'intelligence')}</td>
      <td class="num">${priceCell(m.price.input)}${hintLine(m, 'input')}</td>
      <td class="num">${priceCell(m.price.output, m.price.cache_read != null ? `缓存读 ${fmtPrice(m.price.cache_read, { currency: ccyNow, rate })}` : '')}${hintLine(m, 'output')}</td>
      <td class="num">${m._blended != null ? `${fmtPrice(m._blended, { currency: ccyNow, rate })}${hintLine(m, 'blended')}` : '—'}</td>
      <td class="num">${m._value != null ? `${m._value.toFixed(1)}${hintLine(m, 'value')}` : '<span class="mute">—</span>'}</td>
      <td class="num">${tokens(m.context_length)}</td>
      <td>${paretoBadge(m)}${m.open_weights ? '<span class="badge badge-outline">开源</span>' : ''}${m.capabilities.reasoning ? '<span class="badge badge-outline">推理</span>' : ''}${m.price.tiers.length ? '<span class="badge badge-warn">阶梯价</span>' : ''}</td>
      <td><a class="btn btn-sm" href="./model/${encodeURIComponent(slug(m))}.html">详情</a></td>
    </tr>`).join('') || '<tr><td colspan="11" class="center muted" style="padding:30px">没有符合条件的模型，试试放宽筛选条件</td></tr>';

  bindRows(host.querySelector('#rows'));
  host.querySelectorAll('#rows tr.clickable').forEach((tr) => {
    tr.addEventListener('click', (e) => { if (!e.target.closest('a')) openModel(tr.dataset.id); });
  });

  host.querySelector('#export').onclick = () => exportCsv(list, rate, ccyNow);

  renderVendors();
}

/** 厂商入口：只列有第三方评分模型的厂商，按有评分模型数排序 */
function renderVendors() {
  const scoredByVendor = new Map();
  for (const m of state.models) {
    if (m._composite == null) continue;
    scoredByVendor.set(m.vendor_id, (scoredByVendor.get(m.vendor_id) || 0) + 1);
  }
  const totalByVendor = new Map();
  for (const m of state.models) totalByVendor.set(m.vendor_id, (totalByVendor.get(m.vendor_id) || 0) + 1);

  const vlist = [...scoredByVendor.entries()]
    .map(([id, n]) => ({ v: state.vendorById.get(id), n, total: totalByVendor.get(id) || n }))
    .filter((x) => x.v)
    .sort((a, b) => b.n - a.n);

  host.querySelector('#vendor-cards').innerHTML = vlist.map(({ v, n, total }) => {
    const links = v.links || {};
    const target = links.pricing || links.docs || '#';
    return `<a class="rank-card" href="${escapeHtml(target)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div class="rank-card-top">
        <div class="row" style="gap:8px">
          <span class="chip-dot" style="background:${v.brand || vendorColor(v.id)};width:10px;height:10px"></span>
          <div><div class="model-name">${escapeHtml(vendorName(v))}</div>
          <div class="model-sub">${escapeHtml(v.region === 'cn' ? '中国大陆' : v.region === 'eu' ? '欧洲' : v.region === 'us' ? '美国' : '其他')} · ${n} 个有评分（共 ${total} 个模型）</div></div>
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

function exportCsv(list, rate, ccyNow) {
  const head = ['厂商', '模型', 'id', '综合能力分', '智能指数', '输入价(USD/百万)', '输出价(USD/百万)', '缓存读(USD/百万)', '混合价(USD/百万)', '性价比', '上下文', '发布时间', '官方API文档'];
  const rows = list.map((m) => [
    vendorName(m._vendor), m.name, m.id,
    m._composite ?? '', m.scores.intelligence ?? '',
    m.price.input, m.price.output, m.price.cache_read ?? '',
    m._blended ?? '', m._value ?? '',
    m.context_length ?? '', m.release_date ?? '',
    m._vendor?.links?.docs || '',
  ]);
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ai-model-prices-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
