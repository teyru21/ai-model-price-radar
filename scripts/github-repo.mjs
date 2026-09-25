#!/usr/bin/env node
/**
 * 部署辅助：从命令行参数读取 GitHub 用户名 / 仓库名 / PAT，
 * 通过 api.github.com（本环境实测可达）创建仓库并开启 GitHub Pages，
 * 然后把推送命令打印出来（推送走 SSH，见 deploy-github.ps1）。
 *
 * 用法：node scripts/github-repo.mjs <用户名> <仓库名> [PAT]
 * PAT 也可通过环境变量 GH_PAT 传入（避免出现在进程列表里）。
 */
const [user, repo] = process.argv.slice(2);
const token = process.argv[4] || process.env.GH_PAT;

if (!user || !repo) {
  console.error('用法：node scripts/github-repo.mjs <用户名> <仓库名> [PAT]');
  process.exit(1);
}

const api = (path, opts = {}) => fetch(`https://api.github.com${path}`, {
  ...opts,
  headers: {
    accept: 'application/vnd.github+json',
    'user-agent': 'ai-price-radar-deploy',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  },
});

async function main() {
  // 1) 创建仓库（已存在则跳过）
  let created = false;
  if (token) {
    const r = await api('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: repo,
        description: 'AI 模型价格雷达：主流大模型 token 价格 / 能力 / 性价比对比（纯静态站）',
        homepage: `https://${user}.github.io/${repo}/`,
        visibility: 'public',
        has_issues: true,
      }),
    });
    if (r.status === 201) {
      console.log(`✓ 仓库已创建：github.com/${user}/${repo}`);
      created = true;
    } else if (r.status === 422) {
      console.log(`! 仓库已存在：github.com/${user}/${repo}`);
    } else {
      const j = await r.json().catch(() => ({}));
      console.error(`✗ 创建仓库失败 HTTP ${r.status}：${j.message || ''}`);
      process.exit(1);
    }
  } else {
    console.log(`! 未提供 PAT，请确认仓库存在：github.com/${user}/${repo}（或手动创建）`);
  }

  // 2) 开启 GitHub Pages（默认 main 分支根目录）
  if (token) {
    const r = await api(`/repos/${user}/${repo}/pages`, {
      method: 'POST',
      body: JSON.stringify({ build_type: 'workflow', source: { branch: 'main', path: '/' } }),
    });
    if ([201, 409, 422].includes(r.status)) {
      console.log(`✓ Pages 已启用（HTTP ${r.status}）→ 站点地址：https://${user}.github.io/${repo}/`);
    } else {
      const j = await r.json().catch(() => ({}));
      console.warn(`! Pages 启用返回 HTTP ${r.status}：${j.message || '稍后在仓库 Settings → Pages 手动开启'}`);
    }
  } else {
    console.log(`! 未提供 PAT：推送完成后请在仓库 Settings → Pages 选择 Source = "Deploy from a branch" / main / root，`);
    console.log(`  站点地址将是 https://${user}.github.io/${repo}/`);
  }

  // 3) 打印 SSH 推送命令
  console.log('\n接下来执行推送（SSH，本机已实测可达）：');
  console.log(`  git remote add origin git@github.com:${user}/${repo}.git`);
  console.log('  git push -u origin main');
  console.log('\n首次推送后约 1-2 分钟 Pages 生效。');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
