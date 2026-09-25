#!/usr/bin/env node
/**
 * 静态页面生成器：为每个模型生成一个独立详情页 model/<slug>.html
 * 页面本身是薄壳（只有标题与 meta），内容由 assets/js/pages/model.js 在浏览器端按 id 水合。
 * 用法：node scripts/generate-pages.mjs
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'model');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (id) => id.replace(/[^a-zA-Z0-9._-]/g, '-');

const data = JSON.parse(await readFile(join(ROOT, 'data', 'models.json'), 'utf8'));
const { models, vendors, meta } = data;
const vendorById = new Map(vendors.map((v) => [v.id, v]));

if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const rate = meta.fx?.usd_cny || 7.1;

for (const m of models) {
  const v = vendorById.get(m.vendor_id) || {};
  const title = `${m.name} 价格与能力评分 · AI 模型价格雷达`;
  const desc = `${m.name}（${v.name_zh || v.name || m.vendor_id}）token 价格：输入 $${m.price.input}、输出 $${m.price.output} 每百万 tokens，`
    + `上下文 ${m.context_length || '—'}，${m.scores.intelligence != null ? `Artificial Analysis 智能指数 ${m.scores.intelligence}，` : '暂无第三方能力评分，'}`
    + '附官方 API 平台入口与性价比分析。';

  const html = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="stylesheet" href="../assets/css/app.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◈</text></svg>">
<script>window.__AI_API_BASE__ = '';</script>
<script src="../assets/js/guard.js"></script>
</head>
<body>
<main class="wrap page" id="app" data-model="${esc(m.id)}">
  <article>
    <h1>${esc(m.name)}</h1>
    <p class="muted">${esc(v.name_zh || v.name || m.vendor_id)} · 输入 $${m.price.input} / 百万 tokens · 输出 $${m.price.output} / 百万 tokens</p>
    <p class="muted"><a href="../models.html">← 返回全部模型价格表</a></p>
  </article>
</main>
<script type="module" src="../assets/js/pages/model.js"></script>
</body>
</html>
`;
  await writeFile(join(OUT_DIR, `${slug(m.id)}.html`), html, 'utf8');
}

// sitemap.xml —— 便于后续提交搜索引擎
const urls = ['index.html', 'models.html', 'calculator.html', 'compare.html', 'about.html',
  ...models.map((m) => `model/${slug(m.id)}.html`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>./${u}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile(join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

console.log(`✓ 已生成 ${models.length} 个模型详情页 → model/*.html`);
console.log(`✓ 已生成 sitemap.xml（${urls.length} 条）`);
