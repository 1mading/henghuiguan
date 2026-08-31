$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$htmlPath = Join-Path $PSScriptRoot '..\..\恒慧管.html'
$dataPath = Join-Path $PSScriptRoot '..\data\henghuiguan.json'
$staffProfilePath = Join-Path $PSScriptRoot '..\src\utils\staffProfile.js'
$backupDir = Join-Path $PSScriptRoot '..\data\backups'

function Read-Utf8([string]$path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Get-MemberDeptNames([string]$staffProfileJs) {
  $m = [regex]::Match($staffProfileJs, 'DEFAULT_MEMBER_DEPT_NAMES\s*=\s*\[(.*?)\];', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $m.Success) { throw '无法解析 DEFAULT_MEMBER_DEPT_NAMES' }
  return [regex]::Matches($m.Groups[1].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
}

function Parse-UsersFromHtml([string]$html) {
  $users = @()
  $pattern = "\{\s*id:\s*'([^']*)',\s*name:\s*'([^']*)',\s*dept:\s*'([^']*)',\s*role:\s*'([^']*)',\s*position:\s*'([^']*)',\s*leaderId:\s*'([^']*)',\s*standardWeekHours:\s*(\d+),\s*dingTalkUserId:\s*'([^']*)'\s*\}"
  foreach ($line in ($html -split "`n")) {
    $m = [regex]::Match($line, $pattern)
    if ($m.Success) {
      $users += [PSCustomObject]@{
        id = $m.Groups[1].Value
        name = $m.Groups[2].Value
        dept = $m.Groups[3].Value
        role = $m.Groups[4].Value
        position = $m.Groups[5].Value
        leaderId = $m.Groups[6].Value
        standardWeekHours = [int]$m.Groups[7].Value
        dingTalkUserId = $m.Groups[8].Value
      }
    }
  }
  if (-not $users.Count) { throw '未能从 HTML 解析 users' }
  return $users
}

$html = Read-Utf8 $htmlPath
$staffProfileJs = Read-Utf8 $staffProfilePath
$memberDepts = Get-MemberDeptNames $staffProfileJs
$memberSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$memberDepts)
$seedUsers = Parse-UsersFromHtml $html

$data = Read-Utf8 $dataPath | ConvertFrom-Json
$existing = @($data.users)
$existingByDing = @{}
$existingById = @{}
foreach ($u in $existing) {
  if ($u.dingTalkUserId) { $existingByDing[[string]$u.dingTalkUserId] = $u }
  if ($u.id) { $existingById[$u.id] = $u }
}

$nextUsers = @()
foreach ($u in $seedUsers) {
  $prev = $null
  if ($u.dingTalkUserId -and $existingByDing.ContainsKey([string]$u.dingTalkUserId)) {
    $prev = $existingByDing[[string]$u.dingTalkUserId]
  } elseif ($existingById.ContainsKey($u.id)) {
    $prev = $existingById[$u.id]
  }
  $profileKind = if ($memberSet.Contains($u.dept)) { 'member' } else { 'contact' }
  $role = if ($prev -and $prev.role -eq 'admin') { 'admin' } elseif ($u.role -eq 'admin') { 'admin' } else { $u.role }
  $position = if ($role -eq 'admin') { if ($prev -and $prev.position) { $prev.position } else { $u.position } } else { $u.position }
  $nextUsers += [PSCustomObject]@{
    id = $u.id
    name = $u.name
    dept = $u.dept
    role = $role
    position = $position
    leaderId = $u.leaderId
    standardWeekHours = [int]$u.standardWeekHours
    dingTalkUserId = [string]$u.dingTalkUserId
    profileKind = $profileKind
    active = $true
    dingTalkUnionId = if ($prev -and $prev.dingTalkUnionId) { [string]$prev.dingTalkUnionId } else { '' }
    dingTalkMobile = if ($prev -and $prev.dingTalkMobile) { [string]$prev.dingTalkMobile } else { '' }
    dingTalkAvatar = if ($prev -and $prev.dingTalkAvatar) { [string]$prev.dingTalkAvatar } else { '' }
    dingTalkJobNumber = if ($prev -and $prev.dingTalkJobNumber) { [string]$prev.dingTalkJobNumber } else { '' }
  }
}

foreach ($prev in $existing) {
  if (-not $prev.dingTalkUserId) { continue }
  $uid = [string]$prev.dingTalkUserId
  if ($uid.StartsWith('demo_')) { continue }
  if ($nextUsers | Where-Object { [string]$_.dingTalkUserId -eq $uid }) { continue }
  $nextUsers += [PSCustomObject]@{
    id = $prev.id
    name = $prev.name
    dept = $prev.dept
    role = $prev.role
    position = $prev.position
    leaderId = $prev.leaderId
    standardWeekHours = [int]$prev.standardWeekHours
    dingTalkUserId = $uid
    profileKind = if ($prev.profileKind) { [string]$prev.profileKind } else { 'member' }
    active = $true
    dingTalkUnionId = if ($prev.dingTalkUnionId) { [string]$prev.dingTalkUnionId } else { '' }
    dingTalkMobile = if ($prev.dingTalkMobile) { [string]$prev.dingTalkMobile } else { '' }
    dingTalkAvatar = if ($prev.dingTalkAvatar) { [string]$prev.dingTalkAvatar } else { '' }
    dingTalkJobNumber = if ($prev.dingTalkJobNumber) { [string]$prev.dingTalkJobNumber } else { '' }
  }
}

$catalog = @()
foreach ($name in $memberDepts) {
  $parent = if ($name -eq $memberDepts[0]) { '' } else { $memberDepts[0] }
  $catalog += [PSCustomObject]@{ name = $name; kind = 'member'; parentName = $parent; dingTalkDeptId = '' }
}
$known = [System.Collections.Generic.HashSet[string]]::new([string[]]$memberDepts)
$contactDepts = $nextUsers | ForEach-Object { $_.dept } | Where-Object { $_ -and -not $known.Contains($_) } | Select-Object -Unique
foreach ($name in $contactDepts) {
  if ($known.Contains($name)) { continue }
  $catalog += [PSCustomObject]@{ name = $name; kind = 'contact'; parentName = ''; dingTalkDeptId = '' }
  $known.Add($name) | Out-Null
}

if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
Copy-Item $dataPath (Join-Path $backupDir ("henghuiguan-$stamp.json"))

$data.users = $nextUsers
$data.staffDeptCatalog = $catalog
$out = $data | ConvertTo-Json -Depth 20 -Compress
[System.IO.File]::WriteAllText($dataPath, $out, (New-Object System.Text.UTF8Encoding $false))

$admin = $nextUsers | Where-Object { $_.dingTalkUserId -eq '669701617' } | Select-Object -First 1
Write-Host "users: $($nextUsers.Count)"
Write-Host "members: $(($nextUsers | Where-Object { $_.profileKind -eq 'member' }).Count)"
Write-Host "contacts: $(($nextUsers | Where-Object { $_.profileKind -eq 'contact' }).Count)"
Write-Host "catalog: $($catalog.Count)"
if ($admin) { Write-Host "admin: $($admin.id) | $($admin.name) | $($admin.dingTalkUserId)" } else { Write-Host 'admin: NOT FOUND' }
