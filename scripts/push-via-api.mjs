#!/usr/bin/env node
/**
 * 通过 GitHub API（api.github.com，本环境实测可达）完成整站部署：
 *   1. 创建仓库（如不存在）
 *   2. 空仓库先由 Contents API 放置第一个文件初始化 main 分支
 *      （GitHub 的 Git Data API 不允许向空仓库写 blob，会报 409 "Git Repository is empty"）
 *   3. 用 Git Data API 上传全部文件 → 建树 → 建提交 → 指向 main
 *   4. 开启 GitHub Pages（main 分支根目录）
 *
 * 用法：node scripts/push-via-api.mjs <用户名> <仓库名> <PAT>（或 GH_PAT）
 * 仅需 Contents: Read/Write + Administration: Read/Write 权限。部署完建议立即吊销 token。
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [user, repo] = process.argv.slice(2);
const token = process.argv[4] || process.env.GH_PAT;

if (!user || !repo || !token) {
  console.error('用法：node scripts/push-via-api.mjs <用户名> <仓库名> <PAT>（或设置 GH_PAT）');
  process.exit(1);
}

const api = (path, opts = {}) => fetch(`https://api.github.com${path}`, {
  ...opts,
  headers: {
    accept: 'application/vnd.github+json',
    'user-agent': 'ai-price-radar-deploy',
    authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  },
});

async function die(msg, resp) {
  let extra = '';
  try { const j = await resp.json(); extra = j.message || ''; } catch { /* ignore */ }
  console.error(`✗ ${msg}（HTTP ${resp.status}${extra ? '：' + extra : ''}）`);
  process.exit(1);
}

async function main() {
  // 0) 校验 token
  const me = await api('/user');
  if (me.status !== 200) await die('Token 无效', me);
  console.log(`✓ Token 有效，当前账号：${(await me.json()).login}`);

  // 1) 建仓
  let resp = await api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repo,
      description: 'AI 模型价格雷达：主流大模型 token 价格 / 能力 / 性价比对比（纯静态站）',
      homepage: `https://${user}.github.io/${repo}/`,
      visibility: 'public',
    }),
  });
  if (resp.status === 201) console.log(`✓ 仓库已创建：github.com/${user}/${repo}`);
  else if (resp.status === 422) console.log(`! 仓库已存在，直接使用：github.com/${user}/${repo}`);
  else await die('建仓失败', resp);

  // 2) 收集文件（复用 git ls-files，自动尊重 .gitignore）
  const files = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map((p) => normalize(p).replace(/\\/g, '/'));
  console.log(`✓ 待上传文件：${files.length} 个`);

  // 3) 空仓库初始化（占位提交，之后会被完整树覆盖）。单飞：多个并发 409 只触发一次
  let booted = false;
  let bootPromise = null;
  function ensureBoot() {
    if (booted) return Promise.resolve();
    if (!bootPromise) {
      bootPromise = (async () => {
        const content = await readFile(join(ROOT, files[0]));
        resp = await api(`/repos/${user}/${repo}/contents/${files[0]}`, {
          method: 'PUT',
          body: JSON.stringify({ message: 'chore: init main branch', content: content.toString('base64'), branch: 'main' }),
        });
        if ([200, 201].includes(resp.status)) {
          console.log('✓ 空仓库已初始化 main 分支（占位文件，稍后被完整提交覆盖）');
        } else if (resp.status === 409) {
          console.log('! main 分支已存在（可能由并发初始化创建），继续');
        } else {
          await die('初始化 main 分支失败', resp);
        }
        booted = true;
      })().finally(() => { bootPromise = null; });
    }
    return bootPromise;
  }

  // 4) 上传 blob（并发 5）
  const blobs = new Map();
  let done = 0;
  const queue = [...files];
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const path = queue.shift();
      const content = await readFile(join(ROOT, path));
      let r = await api(`/repos/${user}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
      });
      if (r.status === 409) {           // 空仓库：先初始化再重试
        await ensureBoot();
        r = await api(`/repos/${user}/${repo}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
        });
      }
      if (r.status !== 201) await die(`上传 ${path} 失败`, r);
      blobs.set(path, (await r.json()).sha);
      done++;
      if (done % 25 === 0) console.log(`  已上传 ${done}/${files.length}`);
    }
  });
  await Promise.all(workers);
  console.log(`✓ 全部 blob 上传完成（${blobs.size}）`);

  // 5) 建树 + 提交（接在当前 main 头之后，保证 fast-forward）
  const tree = [...blobs.entries()].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha }));
  resp = await api(`/repos/${user}/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ tree }) });
  if (resp.status !== 201) await die('建树失败', resp);
  const treeSha = (await resp.json()).sha;

  let parentSha = null;
  const head = await api(`/repos/${user}/${repo}/git/refs/heads/main`);
  if (head.status === 200) parentSha = (await head.json()).object.sha;

  resp = await api(`/repos/${user}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'AI 模型价格雷达 v1：价格/能力/性价比对比静态站',
      tree: treeSha,
      ...(parentSha ? { parents: [parentSha] } : {}),
    }),
  });
  if (resp.status !== 201) await die('建提交失败', resp);
  const commitSha = (await resp.json()).sha;

  // 6) 指向 main（不存在则创建）
  resp = await api(`/repos/${user}/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: false }),
  });
  if (resp.status === 404) {
    resp = await api(`/repos/${user}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/main', sha: commitSha }),
    });
  }
  if (resp.status !== 200 && resp.status !== 201) await die('更新 main 分支失败', resp);
  console.log(`✓ 已推送到 main（提交 ${commitSha.slice(0, 7)}，${files.length} 个文件）`);

  // 7) 开启 Pages
  resp = await api(`/repos/${user}/${repo}/pages`, {
    method: 'POST',
    body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
  });
  if ([201, 409, 422].includes(resp.status)) {
    console.log(`✓ GitHub Pages 已启用 → https://${user}.github.io/${repo}/`);
    console.log('  首次构建约需 1–2 分钟，之后每次推送自动更新。');
  } else {
    console.warn(`! Pages 开启返回 HTTP ${resp.status}，请到仓库 Settings → Pages 手动选择 main 分支 / root`);
  }
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
