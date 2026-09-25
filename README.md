# AI 模型价格雷达

展示**主流 AI 模型的实时 token 价格、能力强弱、性价比**，并提供**各厂商官方 API 平台入口**的网站。

- **现在是纯静态站**：零依赖、零构建步骤，把整个目录丢到任意静态空间（Nginx / Cloudflare Pages / OSS）即可运行，**运行时不需要联网、不需要后端**。
- **以后可平滑升级为动态服务**：改一行配置切换数据源，前端代码不用动。见文末「升级为动态」。

---

## 快速开始

```bash
node scripts/fetch-data.mjs        # 抓取最新价格与评分，生成 data/models.json
node scripts/generate-pages.mjs    # 为每个模型生成静态详情页 model/*.html
node scripts/serve.mjs             # 本地预览 http://127.0.0.1:5173/

# 或者一条命令：
npm run build && npm run serve
```

> 需要 Node 18+（用到内置 `fetch`）。**不需要 `npm install`**，项目没有任何依赖。

---

## 目录结构

```
├─ index.html              总览：占比滑块 + 性价比榜 + 价格-能力象限图 + 厂商 API 入口
├─ models.html             全部模型价格表（搜索 / 双向排序 / 分类与厂商筛选 / 导出 CSV）
├─ calculator.html         成本计算器：按真实调用量估算月成本
├─ compare.html            模型横向对比（最多 4 个，结果写入 URL 可分享）
├─ about.html              方法论、数据来源、免责声明、动态化路线
├─ model/<slug>.html       每个模型一个静态详情页（由脚本生成，共 341 个）
├─ sitemap.xml             由脚本生成
├─ assets/
│  ├─ css/app.css          设计系统（深色优先 + 浅色主题，响应式）
│  └─ js/
│     ├─ store.js          数据加载与全局状态 ← 静态/动态切换点
│     ├─ metrics.js        指标算法（纯函数，浏览器与 Node 共用同一份）
│     ├─ filters.js        筛选/排序 + URL 同步
│     ├─ charts.js         手写 SVG 散点图与条形图（无第三方图表库）
│     ├─ ui.js             顶栏、页脚、表格、模型详情（抽屉与详情页共用渲染）
│     ├─ format.js         格式化
│     ├─ guard.js          脚本错误可见化（出错显示提示条，不白屏）
│     └─ pages/*.js        各页面逻辑
├─ data/
│  ├─ models.json          ★ 数据契约（也是未来后端 API 的响应体）
│  ├─ models.js            同一份数据的 JS 包装，fetch 失败时按需加载
│  ├─ config.json          汇率、主流厂商白名单等配置
│  ├─ vendors.curated.json 厂商官方入口（人工核验）
│  └─ overrides.curated.json 模型级人工覆盖（默认空，不编造数据）
├─ scripts/
│  ├─ fetch-data.mjs       数据管线
│  ├─ generate-pages.mjs   静态详情页生成器
│  ├─ serve.mjs            零依赖本地静态服务器
│  ├─ verify-pages.ps1     用无头 Edge 逐页渲染自检（可选）
│  ├─ verify-features.ps1  功能自检：排序方向 / 筛选 / 搜索 / 多维对比
│  ├─ audit-layout.ps1     布局自检：桌面与手机宽度下的溢出与样式生效（配合 audit.html）
│  ├─ screenshot.ps1       生成各页面预览截图到 preview/
│  └─ png-stats.mjs        截图像素统计：无第三方依赖，校验不是白屏/渲染失败
├─ preview/                预览截图（由 scripts/screenshot.ps1 生成，可随时重跑）
└─ docs/PLAN.md            方案书（含需求确认与验收标准）
```

## 设计系统

视觉风格基于 [Linear / Vercel 风格的深色数据仪表盘审美](https://ui.shadcn.com/docs/theming)（layered surfaces + 渐变强调色 + 等宽数字 + 微标题大写字距），**全部手写实现、零 CDN 依赖**——不引入框架是因为本站坚持无构建、离线可用。特点：

- 深色优先的「夜航雷达」配色（靛蓝→紫渐变强调、青色辅助），完整浅色主题
- 玻璃拟态顶栏与表格吸附表头、悬浮模型详情面板
- 效率前沿高亮、前三名金银铜榜单卡片、四象限胶囊标注
- 移动端：汉堡下拉导航、象限图保持可读字号横向滚动、无页面级水平溢出（`audit-layout.ps1` 已在 1440px / 390px 实测）

---

## 数据从哪来

| 来源 | 取什么 | 说明 |
|---|---|---|
| [OpenRouter Models API](https://openrouter.ai/api/v1/models) | 价格（输入/输出/缓存/阶梯/联网搜索）、上下文、模态、能力标签、**Artificial Analysis 智能指数**、竞技场 Elo | 公开接口，无需 Key |
| [models.dev](https://models.dev/api.json) | 厂商官方文档入口（兜底） | 公开接口，无需 Key |
| `data/vendors.curated.json` | 厂商官方 API 文档 / 定价页 / 控制台链接 | 人工核验，覆盖国内外主流厂商 |
| open.er-api.com | USD/CNY 实时汇率 | 抓不到就用 `config.json` 里的固定值 |

**当前收录：341 个模型 / 51 家厂商，其中 131 个有第三方能力评分。**

抓取失败时脚本会保留上一次快照并打上 `stale` 标记，站点顶部显示告警，不会白屏。

---

## 指标口径（全部写在 `/about` 页面）

```
混合价格 blended = 输入价 × r + 输出价 × (1 − r)        r = 输入 token 占比，默认 75%（3:1），首页可拖动
性价比        = 综合能力分 ÷ 混合价格                   单位：分 / 美元
月成本        = 请求数 × (输入 tokens × 输入价 + 输出 tokens × 输出价) ÷ 1e6
```

- **能力分**：Artificial Analysis 智能指数归一化到 0–100（收录最高分记为 100）。**不是本站自评**，无第三方评分的模型显示「—」，不参与排名，也不进象限图。
- **★ 效率前沿（帕累托最优）**：不存在任何模型同时「更便宜且更强」的模型。象限图上的绿色虚线就是这条前沿。
- **性价比是「每 1 美元买到的能力分」**，所以极低价模型天然排前面。想看真正该买的型号，请用「能力下限」筛选，或直接看效率前沿。
- 人民币价格为**按汇率折算**，不是厂商官方人民币定价；如录入官方人民币价（`overrides.curated.json`），页面会标注。

---

## 更新数据

```bash
npm run data     # 只更新数据
npm run pages    # 只重新生成详情页
npm run build    # 数据 + 页面
```

有云服务器后可以用 cron 定时跑：

```cron
0 6 * * * cd /srv/ai-price-radar && /usr/bin/node scripts/fetch-data.mjs && /usr/bin/node scripts/generate-pages.mjs
```

---

## 部署（静态）

把整个目录（或只保留 `*.html`、`assets/`、`data/`、`model/`、`sitemap.xml`）上传到任意静态空间即可。Nginx 示例：

```nginx
server {
    listen 80;
    root /srv/ai-price-radar;
    index index.html;

    # 数据文件短缓存，页面长缓存
    location = /data/models.json { add_header Cache-Control "public, max-age=600"; }
    location ~* \.(css|js|svg)$ { add_header Cache-Control "public, max-age=604800"; }
}
```

> 必须用静态服务器访问。本站使用 ES Module，浏览器不允许直接用 `file://` 双击打开（这是浏览器的模块加载限制，与本项目无关）。`npm run serve` 就是这个用途。

---

## 升级为动态（有云服务器之后）

**不需要重写前端。** 数据契约 `data/models.json` 就是未来 API 的响应体。任选一种：

**A. 只换成定时更新（最省事）**
服务器 cron 定时跑 `fetch-data.mjs`，前端仍读静态 JSON，自动获得每天更新的数据。

**B. 换成真正的 API**
1. 后端暴露 `GET /models`，返回与 `data/models.json` **完全相同的结构**（Node/Express、FastAPI、Go 均可）；
2. 把各 HTML 里的
   ```html
   <script>window.__AI_API_BASE__ = '';</script>
   ```
   改成
   ```html
   <script>window.__AI_API_BASE__ = 'https://api.example.com';</script>
   ```
   前端就会改为请求 `/models`。切换逻辑只存在于 `assets/js/store.js`，其余代码零改动。

**C. 再加历史价格（动态版真正的增量价值）**
抓取脚本增加写入 SQLite，后端增加 `GET /history?id=...`，前端在模型详情页画价格趋势曲线。数据表结构建议：

```sql
CREATE TABLE price_history (
  model_id TEXT, snapshot_at TEXT, input REAL, output REAL, cache_read REAL,
  intelligence REAL, PRIMARY KEY (model_id, snapshot_at)
);
```

---

## 与方案书的差异（实现时的一处调整）

`docs/PLAN.md` 原定用 Astro + React。实际实现改成了**零依赖、无构建步骤的原生 ES Module + 手写 CSS/SVG**，原因：

1. 本机沙箱禁止子进程管道通信，esbuild 无法启动（已实测 `spawn EPERM`），Astro/Vite 构建跑不起来；
2. 无构建步骤对「先静态、后动态」这个目标更合适：产物就是源文件，FTP/面板上传即可部署，没有 node_modules 与构建链的维护成本；
3. 功能完全等价 —— 多页静态站、每模型一个详情页（341 个，带 SEO meta）、交互图表（手写 SVG）、筛选/排序/对比/计算器/CSV 导出全部实现，且首屏不需要加载 493 KB 的数据脚本。

---

## 免责声明

本站为第三方信息聚合站，与所收录厂商无隶属或合作关系。价格与能力数据来自公开接口，可能存在延迟或误差，**不构成采购或商业决策依据**，请以各厂商官网与账单为准。
