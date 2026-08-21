# HengHuiGuan share-demo launcher (portable, UTF-8 BOM)
# Works on other Windows PCs: needs Node.js 18+ or Cursor helper node
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $root "server"

function Find-NodeExe {
  $cmds = @()
  $wc = Get-Command node -ErrorAction SilentlyContinue
  if ($wc) { $cmds += $wc.Source }

  $cmds += (Join-Path $env:LOCALAPPDATA "Programs\cursor\resources\app\resources\helpers\node.exe")
  $cmds += (Join-Path $env:ProgramFiles "cursor\resources\app\resources\helpers\node.exe")
  $cmds += (Join-Path $env:ProgramFiles "nodejs\node.exe")
  $cmds += (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
  $cmds += (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")

  # Cursor helpers under any drive letter (no hardcoded Chinese folder names)
  foreach ($drive in @("C:\", "D:\", "E:\")) {
    if (-not (Test-Path -LiteralPath $drive)) { continue }
    Get-ChildItem -Path $drive -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $cmds += (Join-Path $_.FullName "cursor\resources\app\resources\helpers\node.exe")
      $cmds += (Join-Path $_.FullName "nodejs\node.exe")
    }
  }

  foreach ($p in $cmds) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  return $null
}

$node = Find-NodeExe
if (-not $node) {
  Write-Host ""
  Write-Host "[ERROR] node.exe not found on this PC." -ForegroundColor Red
  Write-Host "Install Node.js LTS (18+) then retry:" -ForegroundColor Yellow
  Write-Host "  https://nodejs.org/"
  Write-Host "Or install Cursor (uses bundled node)."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "Using Node: $node"
Write-Host "Open later: http://localhost:3001/app"
Write-Host "Other PC tip: copy whole folder 恒慧管项目 , then run this script."
Write-Host ""

Set-Location -LiteralPath $server
& $node "scripts\start-share-demo.js"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] exit code $LASTEXITCODE" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit $LASTEXITCODE
}
