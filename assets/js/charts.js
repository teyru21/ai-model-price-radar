/** 手写 SVG 图表（零依赖）：价格-能力散点图 + 效率前沿线 */

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
};

let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
export function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add('show');
  moveTip(ev);
}
export function moveTip(ev) {
  const t = tip();
  const pad = 14;
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = `${Math.max(6, x)}px`;
  t.style.top = `${Math.max(6, y)}px`;
}
export function hideTip() { if (tipEl) tipEl.classList.remove('show'); }

const X_TICKS = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];

/**
 * 价格-能力散点图
 * @param {HTMLElement} host
 * @param {{points:Array, currency:string, rate:number, fmtMoney:Function, onSelect:Function}} opts
 */
export function scatterChart(host, opts) {
  const { points, currency, rate, fmtMoney, onSelect } = opts;
  host.innerHTML = '';
  if (!points.length) {
    host.innerHTML = '<p class="muted center" style="padding:40px 0">当前筛选条件下没有可展示的模型（仅统计有第三方能力评分的模型）。</p>';
    return;
  }

  const W = 1060, H = 540;
  const M = { t: 18, r: 24, b: 46, l: 56 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const prices = points.map((p) => p.price).filter((v) => v > 0);
  const xMin = Math.max(0.005, Math.min(...prices) * 0.75);
  const xMax = Math.max(...prices) * 1.35;
  const yMax = 100;
  const lx = (v) => Math.log10(Math.max(v, xMin));
  const sx = (v) => M.l + ((lx(v) - lx(xMin)) / (lx(xMax) - lx(xMin))) * iw;
  const sy = (v) => M.t + ih - (v / yMax) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '价格与能力分布散点图' });

  // 网格 + Y 轴
  for (let v = 0; v <= yMax; v += 20) {
    svg.appendChild(el('line', { x1: M.l, x2: M.l + iw, y1: sy(v), y2: sy(v), class: `grid-line${v % 40 === 0 ? ' major' : ''}` }));
    const t = el('text', { x: M.l - 9, y: sy(v) + 4, class: 'axis-label', 'text-anchor': 'end' });
    t.textContent = String(v);
    svg.appendChild(t);
  }
  // X 轴刻度
  for (const v of X_TICKS) {
    if (v < xMin || v > xMax) continue;
    svg.appendChild(el('line', { x1: sx(v), x2: sx(v), y1: M.t, y2: M.t + ih, class: 'grid-line major' }));
    const t = el('text', { x: sx(v), y: M.t + ih + 19, class: 'axis-label', 'text-anchor': 'middle' });
    t.textContent = fmtMoney(v, { currency, rate, digits: v < 1 ? (v < 0.1 ? 2 : 1) : 0 });
    svg.appendChild(t);
  }
  // 轴标题
  const xl = el('text', { x: M.l + iw / 2, y: H - 8, class: 'axis-label', 'text-anchor': 'middle' });
  xl.textContent = `混合价格（每百万 token，${currency === 'CNY' ? '人民币' : '美元'}）→ 越左越便宜`;
  svg.appendChild(xl);
  const yl = el('text', { x: 14, y: M.t + ih / 2, class: 'axis-label', 'text-anchor': 'middle', transform: `rotate(-90 14 ${M.t + ih / 2})` });
  yl.textContent = '综合能力分 → 越高越强';
  svg.appendChild(yl);

  // 中位线 + 四象限标注（标签带底色胶囊，避免与数据点混在一起）
  const medP = median(prices);
  const medS = median(points.map((p) => p.score));
  svg.appendChild(el('line', { x1: sx(medP), x2: sx(medP), y1: M.t, y2: M.t + ih, stroke: 'var(--text-mute)', 'stroke-width': 1, 'stroke-dasharray': '5 5', opacity: 0.45 }));
  svg.appendChild(el('line', { x1: M.l, x2: M.l + iw, y1: sy(medS), y2: sy(medS), stroke: 'var(--text-mute)', 'stroke-width': 1, 'stroke-dasharray': '5 5', opacity: 0.45 }));
  const q = [
    { x: M.l + 14, y: M.t + 14, a: 'start', text: '◤ 高性价比区 · 便宜且强', fill: 'var(--good)' },
    { x: M.l + iw - 14, y: M.t + 14, a: 'end', text: '旗舰性能区 · 强但贵 ◥', fill: 'var(--accent)' },
    { x: M.l + 14, y: M.t + ih - 10, a: 'start', text: '◣ 经济入门区', fill: 'var(--text-dim)' },
    { x: M.l + iw - 14, y: M.t + ih - 10, a: 'end', text: '低性价比区 ◢', fill: 'var(--warn)' },
  ];
  for (const t of q) {
    const w = t.text.length * 11 + 16;
    const h = 22;
    const rect = el('rect', {
      x: t.a === 'start' ? t.x - 8 : t.x - w + 8,
      y: t.y - h + 5,
      width: w, height: h, rx: 11,
      fill: 'var(--surface-2)', stroke: 'var(--border-soft)',
      opacity: 0.92,
    });
    const label = el('text', { x: t.x, y: t.y, class: 'axis-label', 'text-anchor': t.a });
    label.setAttribute('fill', t.fill);
    label.textContent = t.text;
    svg.appendChild(rect);
    svg.appendChild(label);
  }

  // 效率前沿折线
  const front = points.filter((p) => p.pareto).sort((a, b) => a.price - b.price);
  if (front.length > 1) {
    const d = front.map((p, i) => `${i ? 'L' : 'M'}${sx(p.price).toFixed(1)},${sy(p.score).toFixed(1)}`).join(' ');
    svg.appendChild(el('path', { d, fill: 'none', stroke: 'var(--good)', 'stroke-width': 2, 'stroke-dasharray': '7 5', opacity: 0.75 }));
  }

  // 数据点
  for (const p of points) {
    const c = el('circle', {
      cx: sx(p.price), cy: sy(p.score), r: p.pareto ? 5.6 : 4.4,
      fill: p.color, 'fill-opacity': p.dim ? 0.28 : 0.9,
      stroke: p.pareto ? 'var(--good)' : 'var(--bg)', 'stroke-width': p.pareto ? 2 : 1,
      class: 'pt',
    });
    const html = `<div class="tip-title">${p.label}</div>
      <div class="tip-line"><span>厂商</span><b>${p.vendor}</b></div>
      <div class="tip-line"><span>综合能力分</span><b>${p.score.toFixed(1)}</b></div>
      <div class="tip-line"><span>混合价格</span><b>${fmtMoney(p.price, { currency, rate })}</b></div>
      <div class="tip-line"><span>性价比</span><b>${p.value != null ? p.value.toFixed(1) : '—'}</b></div>
      ${p.pareto ? '<div class="tip-line" style="color:var(--good)"><span>★ 效率前沿</span><b></b></div>' : ''}`;
    c.addEventListener('mouseenter', (e) => showTip(html, e));
    c.addEventListener('mousemove', moveTip);
    c.addEventListener('mouseleave', hideTip);
    c.addEventListener('click', () => onSelect?.(p.id));
    svg.appendChild(c);
  }

  host.appendChild(svg);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 横向条形图（用于能力分项 / 成本对比） */
export function barList(host, rows, { fmt = (v) => String(v), max = null } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value || 0), 1);
  host.innerHTML = rows.map((r) => `
    <div class="row" style="gap:10px;margin:7px 0">
      <span class="small muted" style="width:112px;flex:none">${r.label}</span>
      <span class="bar" style="flex:1"><i style="width:${r.value == null ? 0 : Math.max(2, (r.value / top) * 100)}%"></i></span>
      <span class="mono small" style="width:66px;text-align:right;flex:none">${r.value == null ? '—' : fmt(r.value)}</span>
    </div>`).join('');
}

/** 厂商配色（稳定哈希，保证同一厂商在所有页面颜色一致） */
const PALETTE = ['#4d8dff', '#7c5cff', '#2fbf71', '#f0a92b', '#f2545b', '#00c2d1', '#e879f9', '#84cc16', '#fb923c', '#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#facc15', '#60a5fa'];
export function vendorColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
