#!/usr/bin/env node
/**
 * 数据管线：抓取 → 归一化 → 合并人工覆盖 → 输出数据契约
 *
 * 用法：  node scripts/fetch-data.mjs
 *
 * 数据源（均已实测可直连，不依赖 GitHub）：
 *   1. OpenRouter Models API  https://openrouter.ai/api/v1/models   —— 价格 / 上下文 / 模态 / 能力 / 第三方评分
 *   2. models.dev             https://models.dev/api.json            —— 厂商官方文档入口（兜底）
 *
 * 产物：
 *   data/models.json  数据契约（未来动态版的 API 响应体就是它）
 *   data/models.js    同一份数据的 JS 包装，用于 file:// 直接打开（零服务器）
 *
 * 抓取失败时保留上一次快照，并在 meta.stale 标记，站点不会白屏。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const MODELS_DEV_URL = 'https://models.dev/api.json';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

/** OpenRouter 厂商前缀 → models.dev provider id 的别名 */
const PROVIDER_ALIAS = {
  'x-ai': 'xai',
  'z-ai': 'zai',
  'meta-llama': 'meta',
  mistralai: 'mistral',
  qwen: 'alibaba',
  'bytedance-seed': 'volcengine',
  bytedance: 'volcengine',
  tencent: 'tencent-tokenhub',
  'ibm-granite': 'watsonx',
};

const SCHEMA_VERSION = '1.0.0';

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const config = await readJson(join(DATA_DIR, 'config.json'), { usd_cny: 7.1, min_context: 0 });
  const curated = await readJson(join(DATA_DIR, 'vendors.curated.json'), { vendors: {} });
  const overrides = await readJson(join(DATA_DIR, 'overrides.curated.json'), { models: {} });

  const sources = [];
  let orModels = null;
  let mdProviders = null;

  try {
    const res = await fetch(OPENROUTER_URL, { headers: { 'user-agent': 'ai-model-price-radar/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    orModels = (await res.json()).data;
    sources.push({ id: 'openrouter', name: 'OpenRouter Models API', url: OPENROUTER_URL, ok: true, count: orModels.length, fetched_at: new Date().toISOString() });
    console.log(`✓ OpenRouter：${orModels.length} 个模型`);
  } catch (err) {
    sources.push({ id: 'openrouter', name: 'OpenRouter Models API', url: OPENROUTER_URL, ok: false, error: String(err.message || err) });
    console.error(`✗ OpenRouter 抓取失败：${err.message}`);
  }

  try {
    const res = await fetch(MODELS_DEV_URL, { headers: { 'user-agent': 'ai-model-price-radar/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mdProviders = await res.json();
    sources.push({ id: 'models.dev', name: 'models.dev', url: MODELS_DEV_URL, ok: true, count: Object.keys(mdProviders).length, fetched_at: new Date().toISOString() });
    console.log(`✓ models.dev：${Object.keys(mdProviders).length} 个 provider`);
  } catch (err) {
    sources.push({ id: 'models.dev', name: 'models.dev', url: MODELS_DEV_URL, ok: false, error: String(err.message || err) });
    console.warn(`! models.dev 抓取失败（将退化为仅 OpenRouter 链接）：${err.message}`);
  }

  // 汇率：抓不到就用配置里的固定值
  let fx = { usd_cny: Number(config.usd_cny) || 7.1, source: 'config', updated_at: null };
  try {
    const res = await fetch(FX_URL, { headers: { 'user-agent': 'ai-model-price-radar/1.0' } });
    const j = await res.json();
    const rate = j?.rates?.CNY;
    if (typeof rate === 'number' && rate > 0) {
      fx = { usd_cny: Math.round(rate * 10000) / 10000, source: 'open.er-api.com', updated_at: new Date().toISOString() };
      console.log(`✓ 汇率 USD/CNY = ${fx.usd_cny}`);
    }
  } catch {
    console.warn(`! 汇率接口不可达，使用配置值 ${fx.usd_cny}`);
  }

  if (!orModels) {
    // 抓取失败：保留旧快照并打 stale 标记
    const prevPath = join(DATA_DIR, 'models.json');
    if (existsSync(prevPath)) {
      const prev = await readJson(prevPath, null);
      if (prev) {
        prev.meta.stale = true;
        prev.meta.stale_reason = 'OpenRouter 抓取失败，展示的是上一次快照';
        await writeOutputs(prev);
        console.warn('⚠ 已保留上一次快照并标记 stale');
        return;
      }
    }
    throw new Error('OpenRouter 抓取失败且没有可用快照，终止。');
  }

  const { models, vendorIds } = normalizeModels(orModels, { curated, overrides, fx });
  const vendors = buildVendors(vendorIds, { curated, mdProviders });

  const ranked = models.filter((m) => typeof m.scores.intelligence === 'number');
  const payload = {
    meta: {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      stale: false,
      stale_reason: null,
      sources,
      fx,
      mainstream: config.mainstream || null,
      counts: {
        all: models.length,
        ranked: ranked.length,
        vendors: vendors.length,
        text_models: models.filter((m) => m.category === 'text').length,
      },
      notes: [
        '价格来自 OpenRouter 公开模型接口，单位：美元 / 百万 tokens；实际以各厂商官网为准。',
        '能力分来自 Artificial Analysis 智能指数（经 OpenRouter 公开接口获取），非本站评分。',
        '人民币价格仅为按汇率折算，非厂商官方人民币定价。',
      ],
    },
    vendors,
    models,
  };

  await writeOutputs(payload);
  console.log(`\n✓ 完成：${models.length} 个模型 / ${vendors.length} 个厂商 / ${ranked.length} 个有第三方能力评分`);
  console.log(`  → data/models.json`);
  console.log(`  → data/models.js`);
}

/** 把 OpenRouter 原始模型数组整理成站内数据契约 */
function normalizeModels(raw, { curated, overrides, fx }) {
  const out = [];
  const vendorIds = new Set();
  const seen = new Set();

  for (const m of raw) {
    // 跳过别名重定向（~xxx）与变体（:batch / :free），避免同一模型重复出现
    if (m.id.startsWith('~') || m.id.includes(':')) continue;
    if (seen.has(m.id)) continue;

    const ov = overrides.models?.[m.id] || {};
    if (ov.hidden) continue;

    const [vendorId, ...rest] = m.id.split('/');
    if (!vendorId || !rest.length) continue;

    const price = normalizePrice(m.pricing, ov);
    if (!price) continue; // 无有效价格的（多为免费/内部模型）不收录

    const releaseMs = (m.created || 0) * 1000;
    const expired = m.expiration_date ? Date.parse(m.expiration_date) < Date.now() : false;

    const model = {
      id: m.id,
      vendor_id: vendorId,
      name: ov.name_zh || cleanName(m.name, vendorId),
      name_original: cleanName(m.name, vendorId),
      description: ov.description_zh || m.description || null,
      category: categorize(m),
      tier: ov.tier || null,
      release_date: releaseMs ? new Date(releaseMs).toISOString().slice(0, 10) : null,
      deprecated: expired,
      open_weights: ov.open_weights ?? null,
      context_length: m.context_length || null,
      max_output: m.top_provider?.max_completion_tokens || null,
      moderated: m.top_provider?.is_moderated ?? null,
      modalities: {
        input: m.architecture?.input_modalities || [],
        output: m.architecture?.output_modalities || [],
      },
      capabilities: {
        reasoning: Boolean(m.reasoning) || (m.supported_parameters || []).includes('reasoning'),
        reasoning_efforts: m.reasoning?.supported_efforts || [],
        tool_call: (m.supported_parameters || []).includes('tools'),
        structured_output: (m.supported_parameters || []).includes('structured_outputs'),
        attachment: Boolean(m.architecture?.input_modalities?.some((x) => x !== 'text')),
        web_search: price.web_search != null,
      },
      price,
      price_cny: ov.price_cny || null,
      scores: {
        intelligence: numOrNull(m.benchmarks?.artificial_analysis?.intelligence_index),
        coding: numOrNull(m.benchmarks?.artificial_analysis?.coding_index),
        agentic: numOrNull(m.benchmarks?.artificial_analysis?.agentic_index),
        arena_elo: maxArenaElo(m.benchmarks?.design_arena),
        arena_coding_elo: arenaCodingElo(m.benchmarks?.design_arena),
      },
      links: {
        openrouter: `https://openrouter.ai/${m.id}`,
      },
      tags: ov.tags || [],
    };

    if (ov.scores) Object.assign(model.scores, ov.scores);
    if (ov.links) Object.assign(model.links, ov.links);

    seen.add(m.id);
    vendorIds.add(vendorId);
    out.push(model);
  }

  // 排序：有评分的按分数降序在前，其余按发布时间降序
  out.sort((a, b) => {
    const sa = a.scores.intelligence;
    const sb = b.scores.intelligence;
    if (sa != null && sb != null) return sb - sa;
    if (sa != null) return -1;
    if (sb != null) return 1;
    return String(b.release_date || '').localeCompare(String(a.release_date || ''));
  });

  return { models: out, vendorIds: [...vendorIds] };
}

function normalizePrice(p, ov) {
  if (!p) return null;
  const per1m = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? round(n * 1e6, 6) : null;
  };
  const input = per1m(p.prompt);
  const output = per1m(p.completion);
  if ((!input || input <= 0) && (!output || output <= 0)) return null;

  const tiers = Array.isArray(p.overrides)
    ? p.overrides
        .map((t) => ({
          min_input_tokens: t.min_prompt_tokens ?? null,
          input: per1m(t.prompt),
          output: per1m(t.completion),
          cache_read: per1m(t.input_cache_read),
          cache_write: per1m(t.input_cache_write),
        }))
        .filter((t) => t.min_input_tokens != null)
    : [];

  return {
    unit: 'per_1m_tokens',
    currency: 'USD',
    input: input ?? 0,
    output: output ?? 0,
    cache_read: per1m(p.input_cache_read),
    cache_write: per1m(p.input_cache_write) ?? per1m(p.input_cache_write_1h),
    image: per1m(p.image),
    web_search: per1m(p.web_search),
    tiers,
    ...(ov.price || {}),
  };
}

function categorize(m) {
  const outMods = m.architecture?.output_modalities || [];
  if (outMods.includes('image')) return 'image';
  if (outMods.includes('video')) return 'video';
  if (outMods.includes('audio')) return 'audio';
  if (outMods.includes('text')) return 'text';
  if (/embed|rerank|moderation/i.test(m.id)) return 'embedding';
  return 'other';
}

function maxArenaElo(arena) {
  if (!Array.isArray(arena) || !arena.length) return null;
  const elos = arena.map((a) => Number(a.elo)).filter(Number.isFinite);
  return elos.length ? Math.max(...elos) : null;
}

function arenaCodingElo(arena) {
  if (!Array.isArray(arena)) return null;
  const elos = arena
    .filter((a) => /code|fullstack|webapp|gamedev|website|uicomponent/i.test(String(a.category || '')))
    .map((a) => Number(a.elo))
    .filter(Number.isFinite);
  return elos.length ? Math.round(elos.reduce((s, v) => s + v, 0) / elos.length) : null;
}

/** 去掉 "OpenAI: " 这类厂商前缀 */
function cleanName(name, vendorId) {
  if (!name) return vendorId;
  const idx = name.indexOf(': ');
  return idx > -1 && idx < 30 ? name.slice(idx + 2) : name;
}

/** 厂商元数据：人工表 → models.dev 官方 doc → OpenRouter 厂商页 */
function buildVendors(vendorIds, { curated, mdProviders }) {
  return vendorIds
    .map((id) => {
      const c = curated.vendors?.[id];
      const mdProv = mdProviders?.[PROVIDER_ALIAS[id] || id];
      let links = c?.links ? { ...c.links } : null;
      let linkSource = c?.links ? 'official' : null;

      if (!links && mdProv?.doc) {
        links = { docs: mdProv.doc, pricing: null, console: null };
        linkSource = 'models.dev';
      }
      if (!links) {
        links = { docs: `https://openrouter.ai/${id}`, pricing: `https://openrouter.ai/${id}`, console: null };
        linkSource = 'openrouter';
      }
      if (mdProv?.doc && !links.docs) links.docs = mdProv.doc;

      return {
        id,
        name: c?.name || mdProv?.name || id,
        name_zh: c?.name_zh || null,
        region: c?.region || 'other',
        brand: c?.brand || null,
        official: linkSource === 'official',
        link_source: linkSource,
        env: mdProv?.env || null,
        links,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeOutputs(payload) {
  const json = JSON.stringify(payload);
  await writeFile(join(DATA_DIR, 'models.json'), JSON.stringify(payload, null, 1), 'utf8');
  // models.js：让站点在 file:// 下也能零服务器打开
  await writeFile(
    join(DATA_DIR, 'models.js'),
    `/* 自动生成，请勿手改。数据契约见 data/models.json */\nwindow.__AI_PRICE_DATA__ = ${json};\n`,
    'utf8',
  );
}

main().catch((err) => {
  console.error('\n✗ 数据管线失败：', err.message);
  process.exit(1);
});
