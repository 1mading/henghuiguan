# 用法: .\query.ps1 "type=summary"
#       .\query.ps1 "type=tasks&assignee=张三"
param(
  [Parameter(Position = 0)]
  [string]$Query = "type=summary"
)

$Base = $env:HENGHUIGUAN_BASE_URL
$Key = $env:HENGHUIGUAN_API_KEY

if ([string]::IsNullOrWhiteSpace($Base) -or [string]::IsNullOrWhiteSpace($Key)) {
  Write-Output '{"code":400,"message":"请设置环境变量 HENGHUIGUAN_BASE_URL 与 HENGHUIGUAN_API_KEY","data":null}'
  exit 1
}

$Base = $Base.TrimEnd('/')
$uri = "$Base/api/workbuddy/query?$Query"
Invoke-RestMethod -Uri $uri -Headers @{ "X-Api-Key" = $Key } | ConvertTo-Json -Depth 20
