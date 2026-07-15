# Open HenghuiGuan wall display for meeting room
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root 'server\.env'

if (-not (Test-Path $envFile)) {
  Write-Host "[ERROR] server\.env not found"
  exit 1
}

$key = $null
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*API_KEY\s*=\s*(.+)\s*$') {
    $key = $Matches[1].Trim().Trim('"').Trim("'")
  }
}

if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "[ERROR] API_KEY is empty in server\.env"
  exit 1
}

# Prefer LAN IP of this machine; change if the server runs elsewhere
$hostIp = '192.168.222.26'
$port = 3000
$url = "http://${hostIp}:${port}/wall?key=$key"

Write-Host "Opening wall display..."
Write-Host "URL: http://${hostIp}:${port}/wall?key=***"
Start-Process $url
exit 0
