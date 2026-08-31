$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot '..\data\henghuiguan.json'
$backupDir = Join-Path $PSScriptRoot '..\data\backups'
$raw = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$data = $raw | ConvertFrom-Json

$beforeTasks = @($data.tasks).Count
$beforeDeps = @($data.taskDependencies).Count
$beforeChange = @($data.changeLogs).Count
$beforeTransfer = @($data.transferLogs).Count
$beforePush = @($data.pushLogs).Count

if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
Copy-Item $file (Join-Path $backupDir ("henghuiguan-$stamp.json"))

$data.tasks = @()
$data.taskDependencies = @()
$data.changeLogs = @()
$data.transferLogs = @()
$data.pushLogs = @()

$json = $data | ConvertTo-Json -Depth 100 -Compress
[System.IO.File]::WriteAllText($file, $json, [System.Text.Encoding]::UTF8)

Write-Host "tasks: $beforeTasks -> 0"
Write-Host "taskDependencies: $beforeDeps -> 0"
Write-Host "changeLogs: $beforeChange -> 0"
Write-Host "transferLogs: $beforeTransfer -> 0"
Write-Host "pushLogs: $beforePush -> 0"
Write-Host "Done. Backup: henghuiguan-$stamp.json"
