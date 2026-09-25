# AI 模型价格 / 能力 / 性价比 展示站 — 方案书 v1.0

> 目标：做一个展示**主流 AI 模型实时 token 价格**、**模型能力强弱**、**性价比**，并提供**各厂商 API 平台入口链接**的网站。
> 形态：**先纯静态**（可托管在任意静态空间），**后续上云服务器平滑升级为动态**（历史价格、定时抓取、API 化）。
> 本文用于在开工前确认功能边界。**确认后即按此搭建。**

---

## 一、现有项目调研结论（先说能不能"直接用现成的"）

已实际访问/核验的项目：

| 项目 | 类型 | 语言/栈 | 结论 |
|---|---|---|---|
| [toktab.com](https://github.com/tomdyson/toktab.com) | 静态站，3791 个模型价格表，数据源 LiteLLM | JS + Cloudflare Pages/Functions | 数据最全，但**只有价格表**，无能力分、无性价比、无场景计算，UI 英文 |
| [token-tariff](https://github.com/Prajwalsrinvas/token-tariff) | 价格 + intelligence 对比计算器 | 前端项目 | **最接近需求**，但为英文单页、无可切换数据源、无国内厂商、无历史数据架构 |
| [model-price](https://github.com/xiaobox/model-price) | 多云比价（Bedrock/Azure/OpenAI/Gemini/OpenRouter/xAI） | Python 后端 + 前端 | 面向"同一模型在哪个云更便宜"，**不是厂商官方 API 定价站** |
| [llm-pricing-dataset](https://github.com/llmrates/llm-pricing-dataset) | 开放价格数据集 | 数据 | 只有数据，无站点 |
| [nikclas](https://github.com/NikclasTech/nikclas) | 模型价格对比 | TypeScript | 星标极少，功能单薄 |
| [models.dev](https://models.dev) | **开放模型数据库**（223 家 provider，含官方 doc 链接、成本、上下文、模态、开源标记） | JSON API | ✅ **直接复用为数据源** |
| [OpenRouter Models API](https://openrouter.ai/api/v1/models) | **458 个模型**：定价、上下文、模态、推理档位、**Artificial Analysis 智能/编程/Agent 指数**、Design Arena Elo | 公开 JSON API | ✅ **直接复用为核心数据源** |
| [LiteLLM](https://github.com/BerriAI/litellm) | `model_prices_and_context_window.json` | 数据 | ✅ 作为第三兜底数据源 |

**已在本机实测（重要）**：`openrouter.ai` 与 `models.dev` 可直连成功；但 **`github.com` / `raw.githubusercontent.com` 直连失败**。因此方案**不把 GitHub 作为运行时数据源**，只用上面两个已验证可达的源。

**结论：不重复造"数据"这个轮子，只造"展示与计算"这一层。**
现成项目没有一个同时满足：中文界面 + 能力强弱 + 性价比象限 + 场景成本计算 + 厂商官方 API 平台链接 + 可静态可动态。所以：

- **方案 A（推荐）**：自建轻量前端，数据直接复用 OpenRouter + models.dev + LiteLLM，全自动抓取。
- **方案 B（备选）**：fork `toktab.com` 改中文（1 天能上线，但无性价比分析、扩展性差、后续转动态要重写）。

> 本方案书按 **方案 A** 编写；如你选 B 我再改。

---

## 二、功能清单（明确到可验收）

### 2.1 核心指标定义（无歧义版）

**① 价格**（统一换算为「美元 / 百万 tokens」，并支持一键切换人民币，汇率可配置，默认 7.10）

| 字段 | 说明 |
|---|---|
| 输入价 input | 每 100 万输入 token 价格 |
| 输出价 output | 每 100 万输出 token 价格 |
| 缓存读 cache_read | 缓存命中读取价（有则显示） |
| 缓存写 cache_write | 缓存写入价（有则显示） |
| 长上下文阶梯价 | 超过阈值后涨价的模型，打「阶梯价」角标并显示第二档价格 |

**② 能力分**（0–100，来自 Artificial Analysis，经 OpenRouter 公开 API 获取）

- 主指标 `intelligence_index` → 归一化为 **综合能力分**（0–100）
- 辅助指标：`coding_index`（编程）、`agentic_index`（Agent）、上下文长度、是否支持 工具调用 / 结构化输出 / 多模态 / 推理模式
- 无 AA 分数的模型：能力分显示 `—`，**不参与性价比排名**（避免编造数据），但仍展示价格与平台链接
- 站内明确标注「能力分来源：Artificial Analysis，非本站评分」

**③ 性价比**（本站自研计算，公式公开在 `/about` 页）

```
混合价格 blended = 输入价 × r + 输出价 × (1 − r)      r = 输入 token 占比，默认 0.75（3:1），用户可用滑块调整
性价比 = 综合能力分 ÷ 混合价格                         即「每 1 美元能买到多少智能分」
月成本 = 月请求数 × (平均输入 token × 输入价 + 平均输出 token × 输出价) ÷ 1e6
```

**④ API 平台链接**（每个模型都有）

厂商官方：`API 文档` / `定价页` / `控制台` 三链接（来自 models.dev 的 provider `doc` + 人工维护的厂商映射表）+ `OpenRouter 详情页`。
覆盖国内外主流：OpenAI、Anthropic、Google、xAI、Meta、Mistral、Cohere、DeepSeek、阿里云百炼(Qwen)、智谱(Z.ai/GLM)、月之暗面(Kimi)、字节火山方舟、腾讯混元、百度千帆、MiniMax、阶跃星辰、硅基流动、OpenRouter 等。

### 2.2 页面与交互

| 页面 | 内容 |
|---|---|
| `/` 总览 | 大赛道**性价比排行榜**（Top N 卡片/列表）+ **能力-价格象限散点图**（X=混合价格对数轴，Y=能力分，四象限自动标注「旗舰/高性价比/廉价入门/低效」）+ 厂商/模态/开源/价格区间快捷筛选 + 「数据更新时间 + 来源」条 |
| `/models` 全部模型 | 可排序、可搜索、可多选对比的大表格（列：模型、厂商、能力分、输入价、输出价、混合价、上下文、模态、性价比、平台链接）；默认只显示「主流模型」，可切换「显示全部 458 个」 |
| `/model/[id]` 详情 | 单模型：完整价格明细（含缓存/阶梯）、能力分项条形图、上下文与能力标签、月成本试算、全部平台链接、历史价格区块（静态期为占位并标注「动态版启用」） |
| `/calculator` 场景计算器 | 预设场景：客服机器人 / 代码助手 / RAG 问答 / 长文档摘要 / Agent 工作流；输入 月请求数、平均输入 tokens、平均输出 tokens、输入输出占比 → 输出各模型**月成本排名 + 性价比排名** |
| `/compare` 对比 | 勾选 2–4 个模型横向对比（价格、能力、上下文、模态、月成本） |
| `/about` | 数据来源与许可、指标公式、更新频率、免责声明（价格以厂商官网为准）、后续动态版路线图 |

**其他**：中文界面（结构预留 i18n）、深色/浅色主题、移动端适配、USD/CNY 切换、结果可分享 URL（筛选条件写入 query string）。

### 2.3 数据范围与收录规则

- 自动规则：OpenRouter 中存在 **且**（有 AA 能力分 **或** 属于白名单厂商）→ 进入「主流模型」池，预计 **60–90 个**
- `data/curated.json` 人工兜底表：国内厂商人民币官方定价、官网链接、中文名、厂商 Logo、分级（旗舰/主力/轻量）
- 全部 458 个模型保留在数据里，供「显示全部」开关使用

---

## 三、技术方案

### 3.1 选型

> **实现后的变更（已落地）**：一期实际采用 **零依赖、无构建步骤的原生 ES Module + 手写 CSS/SVG**，而非 Astro + React。
> 原因：① 本机沙箱禁止子进程管道通信，esbuild 无法启动（实测 `spawn EPERM`），Astro/Vite 构建无法运行；
> ② 无构建产物对「先静态、后动态」更友好——源文件即产物，任意静态空间可直接部署，无 node_modules 维护成本；
> ③ 功能完全等价且已逐页浏览器验证通过。详见 `README.md` 末节。

- **前端**：原生 ES Module + 手写 CSS 设计系统 + 手写 SVG 图表（无第三方图表库）
  - 静态模式：`data/models.json` 本地读取，**零运行时外部请求**，秒开、SEO 好、可托管任意静态空间
  - 动态模式：同一套页面，改 `window.__AI_API_BASE__` 即可改为请求后端 `/models`，**schema 不变，页面代码零改动**
- **数据管线**：Node 脚本 `scripts/fetch-data.mjs`（无第三方依赖，用内置 fetch）
  - 抓取 OpenRouter + models.dev → 归一化 → 合并 curated 覆盖 → 计算能力分/性价比/排名 → 输出 `data/models.json`
  - 失败兜底：抓取异常时保留仓库内上一次快照，只在数据里打 `stale` 标记，站点不会白屏
- **页面生成**：`scripts/generate-pages.mjs` 为每个模型生成独立静态详情页（一期共 341 个）+ `sitemap.xml`

### 3.2 目录结构

```
world/
├─ data/
│  ├─ models.json          # 构建产物（数据契约，同时是未来 API 的响应体）
│  ├─ curated.json         # 人工维护：国内厂商官方定价、官网链接、中文名、Logo、分级
│  └─ vendors.json         # 厂商 → API 文档/定价页/控制台 链接映射
├─ scripts/
│  ├─ fetch-data.mjs       # 抓取 + 归一化 + 计算（静态期手动/cron 跑）
│  └─ lib/*.mjs            # 各数据源适配器（可插拔，方便以后加 LMArena 等）
├─ src/
│  ├─ pages/               # 上述 6 个页面
│  ├─ components/          # 表格、象限图、计算器、对比卡、筛选器
│  ├─ lib/                 # 指标计算（与脚本共用同一份公式）、格式化、i18n
│  └─ styles/
├─ public/logos/           # 厂商 Logo（缺失时用文字首字母兜底）
├─ docs/PLAN.md            # 本文件
└─ package.json / astro.config.mjs / tailwind.config.mjs
```

### 3.3 数据契约（`data/models.json`，未来 API 响应体 = 同一份）

```jsonc
{
  "meta": {
    "schema_version": "1.0.0",
    "generated_at": "2026-09-25T10:00:00Z",
    "sources": [{ "id": "openrouter", "url": "...", "fetched_at": "...", "ok": true }],
    "fx": { "usd_cny": 7.10, "updated_at": "..." },
    "counts": { "mainstream": 72, "all": 458, "vendors": 24 },
    "stale": false
  },
  "vendors": [{
    "id": "deepseek", "name": "DeepSeek", "name_zh": "深度求索", "region": "cn",
    "logo": "/logos/deepseek.svg",
    "links": { "docs": "...", "pricing": "...", "console": "..." }
  }],
  "models": [{
    "id": "deepseek/deepseek-v4-pro",
    "vendor_id": "deepseek", "name": "DeepSeek V4 Pro", "tier": "flagship",
    "release_date": "2026-04-24", "open_weights": true,
    "context_length": 1048576, "max_output": 16384,
    "modalities": { "input": ["text"], "output": ["text"] },
    "capabilities": { "reasoning": true, "tool_call": true, "structured_output": true,
                      "attachment": false, "reasoning_efforts": ["low", "medium", "high"] },
    "price": { "unit": "per_1m_tokens", "currency": "USD",
               "input": 1.3, "output": 2.6, "cache_read": 0.1, "cache_write": null,
               "tiers": [{ "min_input_tokens": 128000, "input": 2.6, "output": 5.2 }],
               "cny": { "input": 9.23, "output": 18.46 }, "cny_source": "official | fx" },
    "scores": { "intelligence": 41.2, "coding": 70.1, "agentic": 44.0,
                "composite": 42.8, "percentile": 88 },
    "value": { "blended_price": 1.625, "score_per_dollar": 26.3, "rank": 3 },
    "links": { "openrouter": "...", "vendor_pricing": "...", "api_docs": "..." }
  }],
  "rankings": { "by_value": ["..."], "by_intelligence": ["..."], "by_price": ["..."] }
}
```

> 这份契约是「静态→动态」的关键：动态期后端只需输出同样结构 + 增加 `/history` 历史序列，前端不动。

### 3.4 静态 → 动态升级路径（现在就把路留好）

| 阶段 | 数据来源 | 部署 | 新增能力 |
|---|---|---|---|
| **一期（现在做）** | `scripts/fetch-data.mjs` 手动/定时跑 → 提交 `data/models.json` | 任意静态托管（GitHub Pages / Cloudflare Pages / Nginx / OSS） | 全部静态功能 |
| **二期（有云服务器后）** | 同一脚本由服务器 cron 定时跑 → 写 SQLite | 同一份前端 + Nginx | **价格历史趋势图**、涨跌提醒 |
| **三期（可选）** | 加 Postgres/Redis，多源交叉校验（LiteLLM、官方页解析） | Node 服务 + API | 数据开放 API、订阅推送、真实调用测速 |

切换成本：前端只改一个环境变量（`PUBLIC_API_BASE` 为空=用本地 JSON，非空=调 API）。

---

## 四、交付物与验收标准

**交付物**
1. 可本地 `npm run dev` 预览、`npm run build` 产出纯静态 `dist/` 的完整项目
2. `data/models.json` 真实数据（≥60 个主流模型，覆盖国内外主流厂商）
3. 厂商 → API 平台链接映射表（含国内厂商人民币定价）
4. 本文档 + `README.md`（如何更新数据、如何部署、如何切动态）

**验收标准（逐条核对）**
- [ ] 首页能看到性价比排行榜 + 能力/价格象限图，散点可点进详情
- [ ] 任一模型卡片上：输入价、输出价、（有则）缓存价、能力分、性价比、**可点击的官方 API 平台链接**
- [ ] 筛选（厂商/模态/开源/价格区间/是否有能力分）与排序全部生效，状态写入 URL
- [ ] 场景计算器输入月请求量与 token 量后，输出月成本排名
- [ ] USD/CNY 一键切换正确
- [ ] 页面标注数据更新时间与来源，且 `npm run build` 后离线打开 `dist/` 仍可正常显示（静态零请求）
- [ ] 新增一个数据源/一个厂商时，只需改 `scripts/lib/` 或 `curated.json`，不用动页面

---

## 五、风险与对策

| 风险 | 对策 |
|---|---|
| GitHub 直连不通（已实测） | 运行时不依赖 GitHub；数据源只用已验证可直连的 OpenRouter / models.dev；快照入库兜底 |
| AA 能力分只覆盖 129/458 个模型 | 主流模型基本都有；无分模型不参与排名并明确标注，不臆造分数 |
| 国内厂商官方价与聚合价不一致 | `curated.json` 人工维护官方价，标注 `cny_source: official`，与聚合价并列显示 |
| 抓取结构变更导致失败 | 适配器分文件隔离 + 失败保留上快照 + 站点显示 `stale` 标记 |
| 价格时效性/免责 | 全站标注数据时间与「以厂商官网为准」，链接直达官方定价页 |

---

## 六、工期（按我这边执行计）

| 步骤 | 内容 |
|---|---|
| 1 | 脚手架（Astro + Tailwind + TS）、数据契约落地 |
| 2 | 数据管线 `fetch-data.mjs` + curated/vendors 映射，生成真实 `models.json` |
| 3 | 首页（排行榜 + 象限图 + 筛选） |
| 4 | 全部模型表格 + 详情页 + 对比页 |
| 5 | 场景计算器 + USD/CNY + 主题 + 移动端 |
| 6 | About/方法论 + README + 构建验收 |

---

## 七、需要你确认的点

1. **方案 A（自建，推荐）还是方案 B（fork 现成 toktab 改中文）？**
2. 中英文：一期**只做中文**（结构预留 i18n）可以吗？
3. 能力分口径：接受「Artificial Analysis 智能指数归一化」，还是你希望改成多榜加权（AA + LMArena + 各厂商基准）？后者更全面但一期数据获取成本高。
4. 是否需要**定时自动更新**（GitHub Actions / 服务器 cron）？还是先手动跑脚本更新。
5. 部署目标：先本地 `dist/` 静态产物即可，还是同时给出 Cloudflare Pages / Nginx 部署配置？
