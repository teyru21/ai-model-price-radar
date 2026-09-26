# 生成各页面预览截图（无头 Edge），并做像素统计确认不是白屏
# 用法：先 node scripts/serve.mjs，然后运行本脚本
$ErrorActionPreference = 'Continue'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP 'ai-shot-profile'
$outDir = "D:\Work\world\preview"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$Base = 'http://127.0.0.1:5173'

# name, url, width, height
$shots = @(
  @{ n = '01-总览-桌面';     u = "$Base/";                w = 1440; h = 2700 },
  @{ n = '02-总览-手机';     u = "$Base/";                w = 390;  h = 1600 },
  @{ n = '03-全部模型';      u = "$Base/models.html";     w = 1440; h = 1700 },
  @{ n = '04-成本计算器';    u = "$Base/calculator.html"; w = 1440; h = 1750 },
  @{ n = '05-模型对比';      u = "$Base/compare.html?ids=openai/gpt-6-sol,deepseek/deepseek-v4-pro,anthropic/claude-fable-5.1"; w = 1440; h = 2100 },
  @{ n = '06-模型详情';      u = "$Base/model/anthropic-claude-opus-5.5.html"; w = 1440; h = 1800 },
  @{ n = '07-方法论';        u = "$Base/about.html";      w = 1440; h = 1750 },
  @{ n = '08-浅色主题';      u = "$Base/models.html?theme=light"; w = 1440; h = 1500 }
)

foreach ($s in $shots) {
  $file = Join-Path $outDir "$($s.n).png"
  Remove-Item $file -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $edge -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-sandbox', "--user-data-dir=$profile",
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--virtual-time-budget=20000',
    "--window-size=$($s.w),$($s.h)", "--screenshot=$file", $s.u
  ) -RedirectStandardError "$file.err" -PassThru -NoNewWindow
  $proc.WaitForExit(120000) | Out-Null; $proc.Dispose()
  Start-Sleep -Milliseconds 500
  if (Test-Path $file) { Write-Output ("[生成] {0,-16} {1,7} KB" -f $s.n, [math]::Round((Get-Item $file).Length / 1KB)) }
  else { Write-Output "[失败] $($s.n)" }
}

Write-Output ""
Write-Output "=== 像素统计校验 ==="
& node D:\Work\world\scripts\png-stats.mjs (Get-ChildItem $outDir -Filter *.png | ForEach-Object { $_.FullName })
