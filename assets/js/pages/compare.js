/** 模型对比：最多 4 个模型横向对比（价格 / 能力 / 规格 / 官方入口） */
import { boot } from './common.js';
import { state } from '../store.js';
import { modelCell, scoreCell, vendorName, vendorBadge, openModel } from '../ui.js';
import { barList } from '../charts.js';
import { price as fmtPrice, money, score as fmtScore, tokens, date, modality, CATEGORY_LABEL, escapeHtml } from '../format.js';

const MAX = 4;
let selected = [];
let badIds = [];
let host;

boot('compare').then((ok) => {
  if (!ok) return;
  host = document.querySelector('#app');
  const raw = new URLSearchParams(location.search).get('ids');
  if (raw) {
    const parts = raw.split(',').map((s) => decodeURIComponent(s.trim())).filter(Boolean);
    // selected 始终保存「模型 id」字符串，render 里再用 get() 解析成模型对象
    selected = parts.filter((s) => state.byId.has(s)).slice(0, MAX);
    badIds = parts.filter((s) => !state.byId.has(s)).slice(0, MAX);
  }
  render();
});

const get = (id) => state.byId.get(id);

function render() {
  const meta = state.raw.meta;
  const rate = meta.fx.usd_cny;
  const ccyNow = state.settings.currency;
  const picked = selected.map(get).filter(Boolean);
  const candidates = state.models
    .filter((m) => m.category === 'text' && !m.deprecated && m._composite != null)
    .sort((a, b) => b._composite - a._composite);
  const suggested = ['openai/gpt-6-sol', 'anthropic/claude-fable-5.1', 'deepseek/deepseek-v4-pro', 'qwen/qwen3.8-max']
    .map(get).filter(Boolean);

  host.innerHTML = `
    <div class="row-between" style="margin-bottom:14px">
      <div>
        <h1>模型横向对比</h1>
        <p class="muted" style="margin-top:6px">最多同时对比 ${MAX} 个模型。对比结果写入 URL，可直接分享。</p>
      </div>
      ${selected.length ? '<button class="btn" id="clear">清空</button>' : ''}
    </div>

    <div class="card">
      <div class="card-head"><h3>选择模型（${picked.length}/${MAX}）</h3>
        <span class="small mute">按能力分排序，仅显示有第三方评分的主流文本模型</span></div>
      <input type="search" id="pick-q" placeholder="搜索并添加模型…" style="margin-bottom:10px">
      <div id="pick-list" class="cmp-picker"></div>
      ${!picked.length && suggested.length ? `<div style="margin-top:12px">
        <span class="tiny mute">快速开始：</span>
        ${suggested.map((m) => `<button class="chip" data-quick="${escapeHtml(m.id)}">＋ ${escapeHtml(m.name)}</button>`).join('')}
      </div>` : ''}
    </div>

    ${picked.length ? `
    ${badIds.length ? `<div class="notice warn" style="margin-top:14px">链接中有 ${badIds.length} 个模型 id 无法识别（可能已下架或改名）：<span class="mono">${escapeHtml(badIds.join(' , '))}</span></div>` : ''}
    <div class="table-wrap" style="margin-top:18px">
      <table class="cmp">
        <thead><tr>
          <th class="sticky-col" style="min-width:118px">对比项</th>
          ${picked.map((m) => `<th class="cmp-col">
            <div class="row" style="gap:7px">${vendorBadge(m)}<span>${escapeHtml(m.name)}</span></div>
            <div class="tiny mute" style="font-weight:400;margin-top:2px">${escapeHtml(vendorName(m._vendor))}</div>
            <button class="btn btn-sm btn-ghost" data-remove="${escapeHtml(m.id)}" style="margin-top:4px">移除</button>
          </th>`).join('')}
        </tr></thead>
        <tbody>
          ${row('综合能力分', picked, (m) => scoreCell(m))}
          ${row('能力分排名（全部收录模型）', picked, (m) => m._intelRank ? `第 ${m._intelRank} 名` : '<span class="mute">未评级</span>')}
          ${row('智能指数（Artificial Analysis）', picked, (m) => fmtOr(m.scores.intelligence))}
          ${row('编程指数', picked, (m) => fmtOr(m.scores.coding))}
          ${row('Agent 指数', picked, (m) => fmtOr(m.scores.agentic))}
          ${row('竞技场最高 Elo', picked, (m) => fmtOr(m.scores.arena_elo))}
          ${row('性价比（分/美元）', picked, (m) => m._value != null ? `<b>${m._value.toFixed(1)}</b><div class="tiny mute">第 ${m._valueRank} 名</div>` : '<span class="mute">未评级</span>')}
          ${row('输入价 / 百万', picked, (m) => fmtPrice(m.price.input, { currency: ccyNow, rate }))}
          ${row('输出价 / 百万', picked, (m) => fmtPrice(m.price.output, { currency: ccyNow, rate }))}
          ${row('缓存读取 / 百万', picked, (m) => m.price.cache_read != null ? fmtPrice(m.price.cache_read, { currency: ccyNow, rate }) : '<span class="mute">—</span>')}
          ${row('混合价格 / 百万', picked, (m) => m._blended != null ? fmtPrice(m._blended, { currency: ccyNow, rate }) : '—')}
          ${row('相对最便宜倍数', picked, (m, i, arr) => {
            const min = Math.min(...arr.map((x) => x._blended).filter((v) => v > 0));
            return m._blended > 0 ? (m._blended / min).toFixed(1) + '×' : '—';
          })}
          ${row('上下文窗口', picked, (m) => tokens(m.context_length))}
          ${row('最大输出', picked, (m) => tokens(m.max_output))}
          ${row('输入模态', picked, (m) => m.modalities.input.map(modality).join(' / ') || '—')}
          ${row('输出模态', picked, (m) => m.modalities.output.map(modality).join(' / ') || '—')}
          ${row('推理模式', picked, (m) => m.capabilities.reasoning ? `<span class="badge badge-good">支持</span>` : '<span class="mute">否</span>')}
          ${row('工具调用', picked, (m) => m.capabilities.tool_call ? '支持' : '不支持')}
          ${row('开源权重', picked, (m) => m.open_weights ? '<span class="badge badge-good">是</span>' : '否')}
          ${row('发布时间', picked, (m) => date(m.release_date))}
          ${row('类型', picked, (m) => CATEGORY_LABEL[m.category] || m.category)}
          ${row('官方 API 文档', picked, (m) => m._vendor?.links?.docs ? `<a href="${escapeHtml(m._vendor.links.docs)}" target="_blank" rel="noopener">打开 ↗</a>` : '<span class="mute">未收录</span>')}
          ${row('官方定价页', picked, (m) => m._vendor?.links?.pricing ? `<a href="${escapeHtml(m._vendor.links.pricing)}" target="_blank" rel="noopener">打开 ↗</a>` : '<span class="mute">未收录</span>')}
          ${row('控制台', picked, (m) => m._vendor?.links?.console ? `<a href="${escapeHtml(m._vendor.links.console)}" target="_blank" rel="noopener">打开 ↗</a>` : '<span class="mute">未收录</span>')}
          ${row('OpenRouter 页', picked, (m) => `<a href="${escapeHtml(m.links.openrouter)}" target="_blank" rel="noopener">打开 ↗</a>`)}
          ${row('1 万次调用月成本', picked, (m) => `<b>${money((10000 * (2000 * m.price.input + 500 * m.price.output)) / 1e6, { currency: ccyNow, rate, digits: 2 })}</b>`)}
        </tbody>
      </table>
    </div>

    <div class="grid g2" style="margin-top:18px">
      <section class="card">
        <div class="card-head"><h3>混合价格对比</h3><span class="tiny mute">越低越好</span></div>
        <div id="cmp-price"></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>综合能力分对比</h3><span class="tiny mute">越高越好</span></div>
        <div id="cmp-score"></div>
      </section>
    </div>

    <section class="card" style="margin-top:18px">
      <div class="card-head">
        <h3>能力多维度对比</h3>
        <span class="tiny mute">每条为该维度下各模型的相对长度（同维度内归一化，跨维度不可直接比长短）</span>
      </div>
      <div id="cmp-dims"></div>
    </section>` : `<div class="notice info" style="margin-top:18px">请先选择至少一个模型开始对比。
      ${badIds.length ? `<br>链接中的模型 id 无法识别：<span class="mono">${escapeHtml(badIds.join(' , '))}</span>` : ''}</div>`}
  `;

  // 选择器
  const list = host.querySelector('#pick-list');
  const paintPick = (kw = '') => {
    const q = kw.trim().toLowerCase();
    const items = candidates
      .filter((m) => !selected.includes(m.id))
      .filter((m) => !q || `${m.name} ${m.id} ${vendorName(m._vendor)}`.toLowerCase().includes(q))
      .slice(0, q ? 24 : 14);
    list.innerHTML = items.map((m) => `<button class="chip" data-pick="${escapeHtml(m.id)}" ${selected.length >= MAX ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>
      <span class="chip-dot" style="background:${m._vendor?.brand || 'var(--text-mute)'}"></span>${escapeHtml(m.name)}
      <span class="mute tiny">${fmtScore(m._composite)}</span></button>`).join('') || '<span class="mute small">没有更多匹配的模型</span>';
    list.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = () => { if (selected.length < MAX) { selected.push(b.dataset.pick); sync(); } };
    });
  };
  paintPick();
  const q = host.querySelector('#pick-q');
  if (q) q.oninput = () => paintPick(q.value);

  host.querySelectorAll('[data-quick]').forEach((b) => {
    b.onclick = () => { selected = [...new Set([...selected, b.dataset.quick])].slice(0, MAX); sync(); };
  });
  host.querySelectorAll('[data-remove]').forEach((b) => {
    b.onclick = () => { selected = selected.filter((id) => id !== b.dataset.remove); sync(); };
  });
  const clear = host.querySelector('#clear');
  if (clear) clear.onclick = () => { selected = []; sync(); };

  if (picked.length) {
    barList(host.querySelector('#cmp-price'), picked.map((m) => ({ label: m.name, value: m._blended })), { fmt: (v) => fmtPrice(v, { currency: ccyNow, rate }) });
    barList(host.querySelector('#cmp-score'), picked.map((m) => ({ label: m.name, value: m._composite })), { fmt: (v) => fmtScore(v) });
    renderDims(host.querySelector('#cmp-dims'), picked, ccyNow, rate);
  }
  host.querySelectorAll('tbody tr').forEach((tr) => tr.classList.remove('clickable'));
}

function row(label, picked, render) {
  return `<tr>
    <td class="sticky-col muted small">${label}</td>
    ${picked.map((m) => `<td class="mono">${render(m, 0, picked)}</td>`).join('')}
  </tr>`;
}

const fmtOr = (v) => (v == null ? '<span class="mute">—</span>' : String(v));

/**
 * 能力多维度对比：每个维度一组横条，模型之间可直接比较。
 * 每个维度独立归一化（组内最大值占满宽度），避免量纲差异（如 Elo 1400 与能力分 40）互相压扁。
 */
function renderDims(host, picked, ccyNow, rate) {
  if (!host) return;
  const dims = [
    { label: '综合能力分', note: '0–100，本站归一化', get: (m) => m._composite, fmt: (v) => fmtScore(v) },
    { label: '智能指数', note: 'Artificial Analysis 原始值', get: (m) => m.scores.intelligence, fmt: (v) => String(v) },
    { label: '编程指数', note: 'Artificial Analysis', get: (m) => m.scores.coding, fmt: (v) => String(v) },
    { label: 'Agent 指数', note: 'Artificial Analysis', get: (m) => m.scores.agentic, fmt: (v) => String(v) },
    { label: '竞技场最高 Elo', note: 'Design Arena，越高越好', get: (m) => m.scores.arena_elo, fmt: (v) => String(v) },
    { label: '上下文窗口', note: '越大能塞的资料越多', get: (m) => m.context_length, fmt: (v) => tokens(v) },
    { label: '性价比', note: '能力分 ÷ 混合价格，越高越划算', get: (m) => m._value, fmt: (v) => v.toFixed(1) },
    { label: '混合价格', note: '越低越好（此维度条越短越省钱）', get: (m) => m._blended, fmt: (v) => fmtPrice(v, { currency: ccyNow, rate }) },
  ];

  host.innerHTML = dims.map((d) => {
    const vals = picked.map((m) => ({ name: m.name, v: d.get(m) }));
    const max = Math.max(...vals.map((x) => (typeof x.v === 'number' ? x.v : 0)), 0);
    const hasAny = vals.some((x) => typeof x.v === 'number');
    return `<div style="margin-bottom:15px">
      <div class="row-between" style="margin-bottom:6px">
        <span class="small" style="font-weight:600">${d.label}</span>
        <span class="tiny mute">${d.note}</span>
      </div>
      ${hasAny ? vals.map((x) => `
        <div class="row" style="gap:9px;margin:4px 0">
          <span class="tiny muted" style="width:150px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.name)}</span>
          <span class="bar" style="flex:1"><i style="width:${typeof x.v === 'number' && max > 0 ? Math.max(2, (x.v / max) * 100) : 0}%"></i></span>
          <span class="mono tiny" style="width:74px;text-align:right;flex:none">${typeof x.v === 'number' ? d.fmt(x.v) : '—'}</span>
        </div>`).join('')
        : '<p class="tiny mute">所选模型均无该维度数据</p>'}
    </div>`;
  }).join('');
}

function sync() {
  const qs = selected.length ? `?ids=${selected.map(encodeURIComponent).join(',')}` : '';
  history.replaceState(null, '', qs || location.pathname);
  render();
}
