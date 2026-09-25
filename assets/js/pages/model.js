/** 模型详情页（每个模型一个静态 HTML，内容在客户端按 id 水合） */
import { state } from '../store.js';
import { loadData, applyTheme } from '../store.js';
import { renderChrome, modelDetailHtml, paintCapabilityBars, vendorName, vendorBadge, openModel, dataStatusBar } from '../ui.js';
import { score as fmtScore, price as fmtPrice, tokens, escapeHtml } from '../format.js';

async function main() {
  applyTheme(state.settings.theme || 'dark');
  const host = document.querySelector('#app');
  const id = host.dataset.model;
  try {
    await loadData();
  } catch (err) {
    renderChrome(null);
    host.innerHTML = `<div class="card"><h2>数据加载失败</h2><p class="muted">${escapeHtml(err.message)}</p></div>`;
    return;
  }
  renderChrome(null);
  const m = state.byId.get(id);
  if (!m) {
    host.innerHTML = `<div class="card" style="margin-top:30px"><h2>未找到模型</h2>
      <p class="muted" style="margin-top:8px">模型 <span class="mono">${escapeHtml(id)}</span> 可能已下架或改名。</p>
      <a class="btn" style="margin-top:12px;display:inline-block" href="../models.html">← 返回全部模型</a></div>`;
    return;
  }
  const rate = state.raw.meta.fx.usd_cny;
  const ccyNow = state.settings.currency;
  const v = m._vendor || {};

  document.title = `${m.name} 价格与能力评分 · AI 模型价格雷达`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', `${m.name}（${vendorName(v)}）的 token 价格：输入 ${fmtPrice(m.price.input, { currency: 'USD', rate })}、输出 ${fmtPrice(m.price.output, { currency: 'USD', rate })} 每百万 tokens，能力分 ${fmtScore(m._composite)}，附官方 API 平台入口。`);

  // 同厂商 / 同价位推荐
  const siblings = state.models
    .filter((x) => x.id !== m.id && x.vendor_id === m.vendor_id && x._composite != null && x.category === 'text')
    .slice(0, 5);
  const rivals = state.models
    .filter((x) => x.id !== m.id && x._composite != null && x.category === 'text' && m._composite != null && Math.abs(x._composite - m._composite) <= 4)
    .sort((a, b) => (a._blended ?? 9e9) - (b._blended ?? 9e9))
    .slice(0, 6);

  host.innerHTML = `
    <nav class="small mute" style="margin-bottom:12px">
      <a href="../index.html">总览</a> / <a href="../models.html">全部模型</a> / <span>${escapeHtml(m.name)}</span>
    </nav>
    ${dataStatusBar(state.raw.meta)}

    <header class="hero" style="margin-bottom:18px">
      <div class="row" style="gap:9px;flex-wrap:wrap">${vendorBadge(m)}
        <span class="small muted">${escapeHtml(vendorName(v))}</span>
        ${m._pareto ? '<span class="badge badge-good">★ 效率前沿</span>' : ''}
        ${m.open_weights ? '<span class="badge badge-outline">开源权重</span>' : ''}
        ${m.deprecated ? '<span class="badge badge-bad">已弃用</span>' : ''}
      </div>
      <h1 style="margin-top:9px">${escapeHtml(m.name)}</h1>
      <div class="mono small mute">${escapeHtml(m.id)}</div>
      <div class="grid g4" style="margin-top:16px">
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${fmtScore(m._composite)}</span><span class="stat-l">综合能力分</span></div></div>
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${fmtPrice(m.price.input, { currency: ccyNow, rate })}</span><span class="stat-l">输入 / 百万 token</span></div></div>
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${fmtPrice(m.price.output, { currency: ccyNow, rate })}</span><span class="stat-l">输出 / 百万 token</span></div></div>
        <div class="card pad-sm"><div class="stat"><span class="stat-v">${tokens(m.context_length)}</span><span class="stat-l">上下文窗口</span></div></div>
      </div>
    </header>

    <div class="stack">${modelDetailHtml(m, { b: '../' })}</div>

    ${siblings.length ? `<section class="card" style="margin-top:18px">
      <div class="card-head"><h3>同厂商其他模型</h3><a class="small" href="../models.html?v=${encodeURIComponent(m.vendor_id)}">查看全部 →</a></div>
      <div class="table-wrap" style="border:none"><table>
        <thead><tr><th>模型</th><th>能力分</th><th class="right">输入价</th><th class="right">输出价</th><th class="right">性价比</th></tr></thead>
        <tbody>${siblings.map((x) => cardRow(x, rate, ccyNow)).join('')}</tbody>
      </table></div>
    </section>` : ''}

    ${rivals.length ? `<section class="card" style="margin-top:18px">
      <div class="card-head"><h3>能力相近的替代选择</h3><span class="tiny mute">能力分差距 ≤ 4 分，按混合价格从低到高</span></div>
      <div class="table-wrap" style="border:none"><table>
        <thead><tr><th>模型</th><th>能力分</th><th class="right">输入价</th><th class="right">输出价</th><th class="right">性价比</th></tr></thead>
        <tbody>${rivals.map((x) => cardRow(x, rate, ccyNow)).join('')}</tbody>
      </table></div>
    </section>` : ''}
  `;
  paintCapabilityBars(host, m);
  host.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
    tr.classList.add('clickable');
    tr.addEventListener('click', (e) => { if (!e.target.closest('a')) openModel(tr.dataset.id); });
  });
}

function cardRow(x, rate, ccyNow) {
  return `<tr data-id="${escapeHtml(x.id)}">
    <td><a href="./${encodeURIComponent(x.id.replace(/[^a-zA-Z0-9._-]/g, '-'))}.html">${escapeHtml(x.name)}</a>
      <div class="model-sub">${escapeHtml(vendorName(x._vendor))}</div></td>
    <td class="mono">${fmtScore(x._composite)}</td>
    <td class="num">${fmtPrice(x.price.input, { currency: ccyNow, rate })}</td>
    <td class="num">${fmtPrice(x.price.output, { currency: ccyNow, rate })}</td>
    <td class="num">${x._value != null ? x._value.toFixed(1) : '—'}</td>
  </tr>`;
}

main();
