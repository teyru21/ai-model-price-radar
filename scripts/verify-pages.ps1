# 用无头 Edge 渲染各页面并检查关键内容（需放宽沙箱以允许浏览器 IPC）
$ErrorActionPreference = 'Continue'
$Base = 'http://127.0.0.1:5173'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = "D:\Work\world\.edge-profile"
$tmp = Join-Path $env:TEMP 'ai-price-verify'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$pages = @(
  @{ name='home';       url="$Base/";                expect=@('性价比排行榜','能力 - 价格象限图','高性价比区','旗舰性能区','经济入门区','低性价比区','效率前沿','官方入口','数据更新') },
  @{ name='models';     url="$Base/models.html";     expect=@('全部模型价格表','能力下限','只看效率前沿','导出 CSV','缓存读','性价比') },
  @{ name='calculator'; url="$Base/calculator.html"; expect=@('API 成本计算器','场景预设','单次成本','月成本','预算内能力最强','成本分布') },
  @{ name='compare';    url="$Base/compare.html";    expect=@('模型横向对比','选择模型','快速开始') },
  @{ name='compareIds'; url="$Base/compare.html?ids=openai/gpt-6-sol,deepseek/deepseek-v4-pro,anthropic/claude-fable-5.1"; expect=@('对比项','相对最便宜倍数','官方 API 文档','混合价格对比','综合能力分对比','1 万次调用月成本','选择模型（3/4）') },
  @{ name='about';      url="$Base/about.html";      expect=@('方法论与数据来源','性价比与效率前沿','动态服务','免责声明','切换方式','收录的厂商') }
)

function Read-WithRetry([string]$path, [int]$tries = 25) {
  for ($i = 0; $i -lt $tries; $i++) {
    try {
      $fs = [System.IO.File]::Open($path, 'Open', 'Read', 'None')
      $sr = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
      $text = $sr.ReadToEnd(); $sr.Close(); $fs.Close()
      if ($text.Length -gt 0) { return $text }
    } catch { }
    Start-Sleep -Milliseconds 400
  }
  return ''
}

function Grab([string]$url, [string]$outFile) {
  Remove-Item $outFile -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $edge -ArgumentList @('--headless=new','--disable-gpu','--no-sandbox',"--user-data-dir=$profile",'--virtual-time-budget=9000','--dump-dom',$url) -RedirectStandardOutput $outFile -RedirectStandardError "$outFile.err" -PassThru -NoNewWindow
  $proc.WaitForExit(90000) | Out-Null
  $proc.Dispose()
  Start-Sleep -Milliseconds 300
  return Read-WithRetry $outFile
}

$fail = 0
foreach ($p in $pages) {
  $dom = Grab $p.url (Join-Path $tmp "$($p.name).html")
  $missing = @()
  foreach ($k in $p.expect) { if (-not $dom.Contains($k)) { $missing += $k } }
  $jserr = $dom.Contains('data-js-error')
  if ($dom.Length -lt 2000) {
    $fail++; Write-Output ("[FAIL] {0,-11} 输出为空或过小 ({1} bytes)" -f $p.name, $dom.Length)
  } elseif ($missing.Count -eq 0 -and -not $jserr) {
    Write-Output ("[OK]   {0,-11} {1,7} bytes" -f $p.name, $dom.Length)
  } else {
    $fail++; Write-Output ("[FAIL] {0,-11} {1,7} bytes  缺失:[{2}]  脚本错误:{3}" -f $p.name, $dom.Length, ($missing -join ', '), $jserr)
  }
}

# 抽查一个模型详情页
$slug = (node -e "const j=require('D:/Work/world/data/models.json');const m=j.models.find(x=>x.scores.intelligence!=null&&x.vendor_id==='deepseek');console.log(m.id.replace(/[^a-zA-Z0-9._-]/g,'-'))").Trim()
$dom = Grab "$Base/model/$slug.html" (Join-Path $tmp 'model.html')
$missing = @()
foreach ($k in @('价格明细','能力评分','API 平台入口','官方 API 文档','OpenRouter 模型页','同厂商其他模型','能力相近的替代选择','月成本试算','缓存读取')) {
  if (-not $dom.Contains($k)) { $missing += $k }
}
if ($missing.Count -eq 0 -and -not $dom.Contains('data-js-error')) {
  Write-Output ("[OK]   {0,-11} {1,7} bytes" -f "model/$slug", $dom.Length)
} else {
  $fail++; Write-Output ("[FAIL] model/{0} 缺失:[{1}]" -f $slug, ($missing -join ', '))
}

Write-Output ""
Write-Output "失败页面数: $fail"
