/** 页面启动公共逻辑：加载数据 → 应用主题 → 渲染外壳 */
import { loadData, state, applyTheme } from '../store.js';
import { renderChrome } from '../ui.js';

export async function boot(activePage) {
  applyTheme(state.settings.theme || 'dark');
  document.documentElement.dataset.theme = state.settings.theme || 'dark';
  try {
    await loadData();
  } catch (err) {
    renderChrome(activePage);
    const host = document.querySelector('#app') || document.body;
    host.innerHTML = `<div class="card" style="margin-top:40px">
      <h2>数据加载失败</h2>
      <p class="muted" style="margin-top:8px">${err.message}</p>
      <p class="muted small" style="margin-top:8px">排查步骤：① 先运行 <code class="mono">npm run data</code> 生成 <code class="mono">data/models.json</code>；
      ② 用静态服务器打开本站（<code class="mono">npm run serve</code>，或任意 Nginx / Pages / OSS）——
      本站使用 ES Module，浏览器不允许直接用 file:// 双击打开，也不需要联网。</p>
    </div>`;
    return false;
  }
  renderChrome(activePage);
  return true;
}

export const rateOf = () => state.raw?.meta?.fx?.usd_cny || 7.1;
export const ccy = () => state.settings.currency;
