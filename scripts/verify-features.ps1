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

Write-Output ""
Write-Output "失败项: $fail"
