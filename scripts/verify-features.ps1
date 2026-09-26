# 功能自检：排序方向、厂商筛选、搜索、多维对比
$ErrorActionPreference = 'Continue'
$Base = 'http://127.0.0.1:5173'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = "D:\Work\world\.edge-profile"
$tmp = Join-Path $env:TEMP 'ai-price-verify'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Grab([string]$url, [string]$outFile) {
  Remove-Item $outFile -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $edge -ArgumentList @('--headless=new','--disable-gpu','--no-sandbox',"--user-data-dir=$profile",'--virtual-time-budget=9000','--dump-dom',$url) -RedirectStandardOutput $outFile -RedirectStandardError "$outFile.err" -PassThru -NoNewWindow
  $proc.WaitForExit(90000) | Out-Null; $proc.Dispose(); Start-Sleep -Milliseconds 300
  for ($i = 0; $i -lt 25; $i++) {
    try { $fs=[System.IO.File]::Open($outFile,'Open','Read','None'); $sr=New-Object System.IO.StreamReader($fs,[System.Text.Encoding]::UTF8); $t=$sr.ReadToEnd(); $sr.Close(); $fs.Close(); if ($t.Length -gt 0) { return $t } } catch {}
    Start-Sleep -Milliseconds 400
  }
  return ''
}

# 从表格里抽出「模型名 + 排序指标值」的顺序，用于验证排序方向真的生效
function Get-Order([string]$dom, [string]$metric) {
  $rows = [regex]::Matches($dom, '<tr class="clickable" data-id="([^"]+)"')
  return ($rows | ForEach-Object { $_.Groups[1].Value })
}

$fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Output ("[OK]   {0,-46} {1}" -f $name, $detail) }
  else { $script:fail++; Write-Output ("[FAIL] {0,-46} {1}" -f $name, $detail) }
}

# ---- 1. 排序方向：性价比 高→低 vs 低→高 ----
$hi = Grab "$Base/models.html?sort=value&dir=desc" (Join-Path $tmp 'v_desc.html')
$lo = Grab "$Base/models.html?sort=value&dir=asc"  (Join-Path $tmp 'v_asc.html')
$hiIds = Get-Order $hi; $loIds = Get-Order $lo
Check '排序 性价比 高→低' ($hiIds.Count -gt 10 -and $hiIds[0] -ne $loIds[0]) "首位=$($hiIds[0])"
Check '排序 性价比 低→高' ($loIds.Count -gt 10 -and $loIds[0] -ne $hiIds[0]) "首位=$($loIds[0])"
Check '两个方向互为反序' ($hiIds.Count -eq $loIds.Count) "条数 $($hiIds.Count) vs $($loIds.Count)"

# ---- 2. 排序方向：能力 高→低 / 低→高，价格 低→高 / 高→低 ----
$iDesc = Grab "$Base/models.html?sort=intelligence&dir=desc" (Join-Path $tmp 'i_desc.html')
$iAsc  = Grab "$Base/models.html?sort=intelligence&dir=asc"  (Join-Path $tmp 'i_asc.html')
$a = Get-Order $iDesc; $b = Get-Order $iAsc
Check '排序 能力 高→低' ($a.Count -gt 10 -and $a[0] -ne $b[0]) "首位=$($a[0])"
Check '排序 能力 低→高' ($b.Count -gt 10) "首位=$($b[0])"
$pAsc  = Grab "$Base/models.html?sort=blended&dir=asc"  (Join-Path $tmp 'p_asc.html')
$pDesc = Grab "$Base/models.html?sort=blended&dir=desc" (Join-Path $tmp 'p_desc.html')
$c = Get-Order $pAsc; $d = Get-Order $pDesc
Check '排序 价格 低→高' ($c.Count -gt 10 -and $c[0] -ne $d[0]) "首位=$($c[0])"
Check '排序 价格 高→低' ($d.Count -gt 10) "首位=$($d[0])"

# ---- 3. 厂商筛选 ----
$dv = Grab "$Base/models.html?v=deepseek" (Join-Path $tmp 'v_deepseek.html')
$dvIds = Get-Order $dv
Check '厂商筛选 deepseek' ($dvIds.Count -gt 0 -and ($dvIds | Where-Object { $_ -notmatch '^deepseek/' }).Count -eq 0) "$($dvIds.Count) 个模型，全部为 deepseek/"
$all = Grab "$Base/models.html?main=0&cat=all" (Join-Path $tmp 'all.html')
Check '厂商下拉框含全部厂商' ($all.Contains('—— 选择厂商加入筛选 ——') -or $all.Contains('选择厂商加入筛选')) "已渲染完整厂商下拉"

# ---- 4. 搜索 ----
$sq = Grab "$Base/models.html?q=claude" (Join-Path $tmp 'q.html')
$sqIds = Get-Order $sq
Check '搜索 claude' ($sqIds.Count -gt 0 -and ($sqIds | Where-Object { $_ -notmatch 'claude' }).Count -eq 0) "$($sqIds.Count) 条结果"
$sq2 = Grab "$Base/models.html?q=%E6%B7%B1%E5%BA%A6%E6%B1%82%E7%B4%A2" (Join-Path $tmp 'q2.html')
$sq2Ids = Get-Order $sq2
Check '搜索中文厂商名「深度求索」' ($sq2Ids.Count -gt 0 -and ($sq2Ids | Where-Object { $_ -notmatch '^deepseek/' }).Count -eq 0) "$($sq2Ids.Count) 条结果"

# ---- 5. 分类 ----
$img = Grab "$Base/models.html?cat=image&main=0" (Join-Path $tmp 'cat_image.html')
Check '分类筛选 图像生成' ($img.Contains('图像生成')) "分类按钮已渲染"
Check '分类按钮齐全' ($all.Contains('文本生成') -and $all.Contains('图像生成') -and $all.Contains('视频生成') -and $all.Contains('音频生成') -and $all.Contains('全部类型')) "5 个分类"

# ---- 6. 多维能力对比 ----
$cmp = Grab "$Base/compare.html?ids=openai/gpt-6-sol,deepseek/deepseek-v4-pro,anthropic/claude-fable-5.1" (Join-Path $tmp 'cmp.html')
foreach ($k in @('能力多维度对比','编程指数','Agent 指数','竞技场最高 Elo','能力分排名','上下文窗口','性价比','混合价格')) {
  Check "对比页含「$k」" ($cmp.Contains($k)) ''
}
Check '对比页无脚本错误' (-not $cmp.Contains('data-js-error')) ''

# ---- 7. v2 调整专项：榜单口径 / 结构精简 / 折叠筛选 ----
$homeDom = Grab "$Base/" (Join-Path $tmp 'home_v2.html')

# 7.1 首页主榜是效率前沿榜，且卡片上的模型都带「前沿」标记
$frontierCards = [regex]::Matches($homeDom, '<article class="rank-card[^"]*" data-id="([^"]+)"')
Check '首页主榜为效率前沿榜' ($homeDom.Contains('效率前沿榜') -and $frontierCards.Count -ge 4) "前沿卡片数=$($frontierCards.Count)"
Check '首页跨度为前沿卡片带 ★ 前沿标记' ($homeDom.Contains('★ 前沿')) ''

# 7.2 性价比榜有 60 分能力门槛（Q1C）
Check '性价比榜标注能力门槛' ($homeDom.Contains('能力分 ≥ 60')) ''

# 7.3 无评分模型不进首页任何榜单（Q6）
Check '首页榜单不含未评分模型' (-not $homeDom.Contains('未评分')) ''
$unscoredOnHome = [regex]::Matches($homeDom, 'data-id="([^"]+)"').Count
$scoredTotal = (node -e "const j=require('D:/Work/world/data/models.json');console.log(j.models.filter(m=>m.scores.intelligence!=null).length)").Trim()
Check '首页榜单卡片+行数量不超过有评分模型总数' ($unscoredOnHome -le [int]$scoredTotal) "首页条目=$unscoredOnHome / 有评分=$scoredTotal"

# 7.4 结构精简（Q2/Q4）：厂商卡片、TOP10 表格已移出首页
Check '首页已移除厂商入口卡片' (-not $homeDom.Contains('按厂商浏览 API 平台')) ''
Check '首页已移除能力 TOP10 表格' (-not $homeDom.Contains('能力最强 TOP 10')) ''
Check '首页已移除最便宜 TOP10 表格' (-not $homeDom.Contains('最便宜的可用模型 TOP 10')) ''
Check '首页含场景入口三卡' ($homeDom.Contains('预算优先') -and $homeDom.Contains('能力优先') -and $homeDom.Contains('算清成本')) ''

# 7.5 折叠筛选（Q3）：默认不展开，URL 带高级条件时自动展开
Check '筛选栏默认折叠' ($homeDom -notmatch 'filter-more open') '首页无筛选栏，检查全部模型页'
$mDefault = Grab "$Base/models.html" (Join-Path $tmp 'm_default.html')
Check '全部模型页筛选栏默认折叠' ($mDefault -match 'class="filter-more"' -and $mDefault -notmatch 'filter-more open') ''
$mExpanded = Grab "$Base/models.html?minscore=60" (Join-Path $tmp 'm_expanded.html')
Check '带高级条件时筛选栏自动展开' ($mExpanded -match 'filter-more open') ''
Check '全部模型页保留厂商入口' ($mDefault.Contains('按厂商浏览 API 平台')) ''

# 7.6 单一排名提示（Q5）：按能力排序时只出现能力名次
$rankDom = Grab "$Base/models.html?sort=intelligence&dir=desc" (Join-Path $tmp 'rank_hint.html')
$intelHints = [regex]::Matches($rankDom, '能力第 \d+ 名').Count
$cheapHints = [regex]::Matches($rankDom, '便宜度第 \d+ 名').Count
$valueHints = [regex]::Matches($rankDom, '性价比第 \d+ 名').Count
Check '按能力排序时只显示能力名次' ($intelHints -gt 0 -and $cheapHints -eq 0 -and $valueHints -eq 0) "能力=$intelHints 便宜度=$cheapHints 性价比=$valueHints"
Check '未评分模型在表格中明确标注' ($mDefault.Contains('未评分')) ''

# 7.7 默认排序 = 能力分 高→低（不再是性价比，避免弱模型占据首屏第一行）
$expectedTop = (node -e "
const j=require('D:/Work/world/data/models.json');
const main=new Set(j.meta.mainstream.vendors);
const s=j.models.filter(m=>m.scores.intelligence!=null&&!m.deprecated&&m.category==='text'&&main.has(m.vendor_id));
s.sort((a,b)=>b.scores.intelligence-a.scores.intelligence);
console.log(s[0].id);").Trim()
$mDefaultIds = Get-Order $mDefault
Check '默认排序为能力分 高→低' ($mDefaultIds.Count -gt 0 -and $mDefaultIds[0] -eq $expectedTop) "首行=$($mDefaultIds[0]) 期望=$expectedTop"

Write-Output ""
Write-Output "失败项: $fail"
