/** 方法论页：口径、来源、算法、更新机制、动态化路线、免责声明 */
import { boot } from './common.js';
import { state } from '../store.js';
import { dataStatusBar, vendorName } from '../ui.js';
import { escapeHtml, dateTime, int } from '../format.js';

boot('about').then((ok) => {
  if (!ok) return;
  const meta = state.raw.meta;
  const vendors = state.vendors.filter((v) => state.models.some((m) => m.vendor_id === v.id));
  const official = vendors.filter((v) => v.official).length;

  document.querySelector('#app').innerHTML = `
    <div style="margin-bottom:14px">
      <h1>方法论与数据来源</h1>
      <p class="muted" style="margin-top:6px">本站所有数字都可以追溯到公开来源，算法全部写在这里，不做黑盒评分。</p>
    </div>
    ${dataStatusBar(meta)}

    <div class="grid g2">
      <section class="card">
        <h2>一、价格口径</h2>
        <ul class="muted" style="line-height:1.9;padding-left:20px;margin-top:8px">
          <li>统一单位：<b>${state.settings.currency === 'CNY' ? '人民币' : '美元'} / 每 100 万 tokens</b>。</li>
          <li>来源：OpenRouter 公开模型接口（<span class="mono small">openrouter.ai/api/v1/models</span>），反映各模型当前对外标价。</li>
          <li>收录字段：输入价、输出价、缓存读取价、缓存写入价、联网搜索单价、<b>长上下文阶梯价</b>（超过阈值后的第二档价格）。</li>
          <li>人民币价格默认按实时汇率折算，汇率 USD/CNY = <b class="mono">${meta.fx.usd_cny}</b>（来源：${escapeHtml(meta.fx.source)}）。<b>这不是厂商官方人民币定价</b>，仅作横向参考。</li>
          <li>若厂商公布官方人民币定价，可在 <span class="mono small">data/overrides.curated.json</span> 中录入，页面会显示「官方人民币定价已收录」。</li>
          <li>实际账单还会受批量折扣、缓存命中率、阶梯计费、免费额度等影响，<b>请以厂商官网与账单为准</b>。</li>
        </ul>
      </section>

      <section class="card">
        <h2>二、能力分口径</h2>
        <ul class="muted" style="line-height:1.9;padding-left:20px;margin-top:8px">
          <li>能力分 = <b>Artificial Analysis 智能指数</b>归一化到 0–100（本站收录的最高分记为 100 分）。</li>
          <li>数据经 OpenRouter 公开接口获取，<b>不是本站自评</b>，本站不做任何人工调分。</li>
          <li>另有编程指数、Agent 指数、竞技场 Elo 作为参考维度，展示在模型详情中。</li>
          <li>没有第三方评分的模型，能力分显示「—」，<b>不参与性价比排名，也不出现在象限图里</b>，避免用推测值误导。</li>
          <li>当前：${meta.counts.all} 个收录模型中，${meta.counts.ranked} 个有第三方评分。</li>
        </ul>
      </section>

      <section class="card">
        <h2>三、性价比与效率前沿</h2>
        <div class="mono small" style="background:var(--surface-2);padding:11px;border-radius:9px;margin:9px 0;line-height:1.9">
          混合价格 blended = 输入价 × r + 输出价 × (1 − r)<br>
          性价比 = 综合能力分 ÷ 混合价格<br>
          月成本 = 请求数 × (输入 tokens × 输入价 + 输出 tokens × 输出价) ÷ 1e6
        </div>
        <ul class="muted" style="line-height:1.9;padding-left:20px">
          <li><b>r = 输入 token 占比</b>，默认 75%（约 3:1），可在首页拖动滑块调整。r 会同时改变性价比排名与象限图横轴。</li>
          <li>「性价比」= 每 1 美元混合价格能买到的能力分，数值越高越划算。</li>
          <li><b>★ 效率前沿（帕累托最优）</b>：若不存在任何其他模型同时「更便宜且更强」，该模型即位于前沿上，是严格意义上不该被替代的选择。象限图中的绿色虚线就是这条前沿。</li>
          <li>四象限以当前数据集的中位价格与中位能力分划分，因此会随市场变化自动移动。</li>
        </ul>
      </section>

      <section class="card">
        <h2>四、数据更新与字段</h2>
        <ul class="muted" style="line-height:1.9;padding-left:20px;margin-top:8px">
          <li>本次数据生成时间：<b>${dateTime(meta.generated_at)}</b>。</li>
          <li>抓取脚本：<span class="mono small">node scripts/fetch-data.mjs</span>，抓取失败会保留上一次快照并显示告警，站点不会白屏。</li>
          <li>数据契约：<span class="mono small">data/models.json</span>（同时被网站与未来的后端 API 使用，结构完全一致）。</li>
          <li>数据源健康状态：${(meta.sources || []).map((s) => `${escapeHtml(s.name)} ${s.ok ? '✅' : '❌'}`).join(' · ')}。</li>
          <li>厂商官方入口：${official} / ${vendors.length} 家为人工核验的官方链接，其余回退到 models.dev 收录或 OpenRouter 厂商页（页面会标注「聚合入口」）。</li>
        </ul>
      </section>
    </div>

    <section class="card" style="margin-top:18px">
      <h2>五、静态站 → 动态服务 的升级路线</h2>
      <p class="muted" style="margin-top:8px">当前是<b>纯静态站点</b>：所有数据在 <span class="mono small">data/models.json</span>，无需任何后端即可托管。升级到云服务器时不需要重写前端：</p>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>阶段</th><th>数据来源</th><th>部署</th><th>新增能力</th></tr></thead>
          <tbody>
            <tr><td><b>一期（当前）</b></td><td>本地脚本抓取 → data/models.json</td><td>任意静态托管（Nginx / Pages / OSS）</td><td>全部展示与计算功能</td></tr>
            <tr><td>二期</td><td>服务器 cron 定时抓取 → SQLite</td><td>同一份前端 + 一个后端进程</td><td><b>价格历史曲线</b>、降价提醒</td></tr>
            <tr><td>三期</td><td>多源交叉校验（官方页 + 聚合源）</td><td>后端 + 数据库 + 缓存</td><td>开放 API、订阅推送、真实测速</td></tr>
          </tbody>
        </table>
      </div>
      <div class="notice info" style="margin-top:12px">
        切换方式：在任意 HTML 的 <span class="mono small">&lt;head&gt;</span> 中把
        <span class="mono small">window.__AI_API_BASE__ = ''</span> 改为你的后端地址（例如 <span class="mono small">'https://api.example.com'</span>）即可，
        页面会自动改为请求 <span class="mono small">/models</span> 接口，其余代码零改动。
      </div>
    </section>

    <section class="card" style="margin-top:18px">
      <h2>六、免责声明</h2>
      <ul class="muted" style="line-height:1.9;padding-left:20px;margin-top:8px">
        <li>本站为第三方信息聚合站，与所收录的任何模型厂商<b>无隶属或合作关系</b>。</li>
        <li>价格与能力数据均来自公开接口，可能存在延迟或误差，<b>不构成采购或商业决策依据</b>。</li>
        <li>商标、模型名称归各自所有者；厂商 Logo 以颜色标识代替，避免版权问题。</li>
        <li>如需更正数据，请以厂商官网为准，并通过 <span class="mono small">data/overrides.curated.json</span> 提交人工覆盖。</li>
      </ul>
    </section>

    <section class="card" style="margin-top:18px">
      <h2>七、收录的厂商（${vendors.length} 家 / ${int(state.models.length)} 个模型）</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        ${vendors.map((v) => `<a class="chip" href="${escapeHtml(v.links?.pricing || v.links?.docs || '#')}" target="_blank" rel="noopener">
          <span class="chip-dot" style="background:${v.brand || 'var(--text-mute)'}"></span>${escapeHtml(vendorName(v))}
          <span class="mute tiny">${state.models.filter((m) => m.vendor_id === v.id).length}</span></a>`).join('')}
      </div>
    </section>
  `;
});
