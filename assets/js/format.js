/** 格式化工具 —— 价格精度按数量级自适应，避免出现 0.0000 这种无信息量显示 */

export function money(v, { currency = 'USD', rate = 7.1, digits = null } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const val = currency === 'CNY' ? v * rate : v;
  const sym = currency === 'CNY' ? '¥' : '$';
  const d = digits != null ? digits : autoDigits(val);
  return sym + trim(val.toFixed(d));
}

export function autoDigits(v) {
  const a = Math.abs(v);
  if (a === 0) return 2;
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  if (a >= 1) return 2;
  if (a >= 0.1) return 3;
  if (a >= 0.01) return 4;
  return 5;
}

function trim(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** 价格（每百万 token） */
export function price(v, opts = {}) {
  return money(v, { digits: null, ...opts });
}

export function pct(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits) + '%';
}

export function score(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(1);
}

export function tokens(v) {
  if (!v || !Number.isFinite(v)) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'K';
  return String(v);
}

export function int(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('zh-CN');
}

export function date(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

export function dateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return `${Math.round(hrs / 24)} 天前`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const MODALITY_LABEL = { text: '文本', image: '图像', audio: '音频', video: '视频', file: '文件', pdf: 'PDF' };
export function modality(m) { return MODALITY_LABEL[m] || m; }

export const CATEGORY_LABEL = {
  text: '文本生成', image: '图像生成', video: '视频生成', audio: '音频生成', embedding: '向量/其他', other: '其他',
};
