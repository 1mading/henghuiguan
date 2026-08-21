# Sync desktop-pet into repo-root distribution folder
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$root = Split-Path (Split-Path $src -Parent) -Parent
$distName = [string]([char]0x6052) + [string]([char]0x6167) + [string]([char]0x7BA1) + [string]([char]0x684C) + [string]([char]0x5BA0)
# 恒慧管桌宠 via codepoints to avoid encoding issues in some consoles
$dist = Join-Path $root $distName
$app = Join-Path $dist 'app'
$runtime = Join-Path $dist 'runtime'
$vendorEle = Join-Path $src 'vendor\electron'
$templates = Join-Path $src 'dist-templates'

Write-Output "SRC  $src"
Write-Output "DIST $dist"

New-Item -ItemType Directory -Force -Path $app | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $app 'renderer') | Out-Null

Copy-Item (Join-Path $src 'main.js') (Join-Path $app 'main.js') -Force
Copy-Item (Join-Path $src 'preload.js') (Join-Path $app 'preload.js') -Force
Copy-Item (Join-Path $src 'activity-watcher.ps1') (Join-Path $app 'activity-watcher.ps1') -Force
Copy-Item (Join-Path $src 'package.json') (Join-Path $app 'package.json') -Force
Get-ChildItem (Join-Path $src 'renderer') | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $app 'renderer') -Recurse -Force
}

$batName = [string]([char]0x542F) + [string]([char]0x52A8) + [string]([char]0x684C) + [string]([char]0x5BA0) + '.bat'
$txtName = [string]([char]0x4F7F) + [string]([char]0x7528) + [string]([char]0x8BF4) + [string]([char]0x660E) + '.txt'
Copy-Item (Join-Path $templates 'start.bat') (Join-Path $dist $batName) -Force
Copy-Item (Join-Path $templates 'readme.txt') (Join-Path $dist $txtName) -Force

if (Test-Path (Join-Path $vendorEle 'electron.exe')) {
  if (-not (Test-Path (Join-Path $runtime 'electron.exe'))) {
    Write-Output 'Copying Electron runtime...'
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Copy-Item (Join-Path $vendorEle '*') $runtime -Recurse -Force
  } else {
    Write-Output 'runtime already present, skip Electron copy'
  }
} else {
  Write-Warning 'vendor/electron/electron.exe missing; prepare runtime manually'
}

Write-Output 'DONE'
Write-Output ("Open: " + (Join-Path $dist $batName))
