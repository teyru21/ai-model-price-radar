# 布局与样式自检：在 iframe 中渲染页面，检查新设计生效、水平溢出、移动端适配
# 用法：先 node scripts/serve.mjs，再运行本脚本（需 Edge）
$ErrorActionPreference = 'Continue'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP 'ai-audit-profile'
$tmp = Join-Path $env:TEMP 'ai-audit'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$Base = 'http://127.0.0.1:5173'

function Audit([string]$url, [int]$w, [string]$name) {
  $auditUrl = "$Base/scripts/audit.html?w=$w&p=" + [System.Uri]::EscapeDataString($url)
  $out = Join-Path $tmp "$name.dom"
  Remove-Item $out -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $edge -ArgumentList @('--headless=new','--disable-gpu','--no-sandbox',"--user-data-dir=$profile",'--virtual-time-budget=14000','--dump-dom',$auditUrl) -RedirectStandardOutput $out -RedirectStandardError "$out.err" -PassThru -NoNewWindow
  $proc.WaitForExit(90000) | Out-Null; $proc.Dispose(); Start-Sleep -Milliseconds 300
  for ($i = 0; $i -lt 25; $i++) {
    try { $fs=[System.IO.File]::Open($out,'Open','Read','None'); $sr=New-Object System.IO.StreamReader($fs,[System.Text.Encoding]::UTF8); $dom=$sr.ReadToEnd(); $sr.Close(); $fs.Close(); if ($dom.Length -gt 0) { break } } catch {}
    Start-Sleep -Milliseconds 400
  }
  $m = [regex]::Match($dom, '<pre id="out">([\s\S]*?)</pre>')
  Write-Output "######## $name ########"
  if ($m.Success) { Write-Output ($m.Groups[1].Value -replace '&lt;','<' -replace '&gt;','>' -replace '&amp;','&') }
  else { Write-Output "（无输出 dom=$($dom.Length)）" }
  Write-Output ""
}

Audit "$Base/" 1440 '桌面 1440px'
Audit "$Base/" 390 '手机 390px'
Audit "$Base/models.html" 390 '手机-表格页'
Audit "$Base/compare.html?ids=openai/gpt-6-sol,deepseek/deepseek-v4-pro" 390 '手机-对比页'
