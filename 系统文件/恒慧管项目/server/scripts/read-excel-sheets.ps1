param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutJson
)

$ErrorActionPreference = 'Stop'

function Get-CellText($value) {
  if ($null -eq $value) { return '' }
  if ($value -is [datetime]) { return $value.ToString('yyyy-MM-dd') }
  return [string]$value
}

function Read-WorksheetRows($sheet) {
  $used = $sheet.UsedRange
  if (-not $used) { return @() }
  $rowCount = $used.Rows.Count
  $colCount = $used.Columns.Count
  if ($rowCount -lt 1 -or $colCount -lt 1) { return @() }

  $values = $used.Value2
  $headers = @()
  for ($c = 1; $c -le $colCount; $c++) {
    if ($rowCount -eq 1) {
      $headers += (Get-CellText $values)
      break
    }
    $headers += (Get-CellText $values[1, $c]).Trim()
  }
  $headers = $headers | ForEach-Object { if ([string]::IsNullOrWhiteSpace($_)) { '' } else { $_ } }

  $result = @()
  for ($r = 2; $r -le $rowCount; $r++) {
    $obj = [ordered]@{}
    $empty = $true
    for ($c = 1; $c -le $colCount; $c++) {
      $header = $headers[$c - 1]
      if ([string]::IsNullOrWhiteSpace($header)) { continue }
      $text = if ($rowCount -eq 1) { '' } else { (Get-CellText $values[$r, $c]).Trim() }
      if ($text) { $empty = $false }
      $obj[$header] = $text
    }
    if (-not $empty) { $result += [pscustomobject]$obj }
  }
  return $result
}

$app = $null
$wb = $null
try {
  try {
    $app = New-Object -ComObject Excel.Application
  } catch {
    $app = New-Object -ComObject Ket.Application
  }
  $app.DisplayAlerts = $false
  $app.Visible = $false
  $wb = $app.Workbooks.Open((Resolve-Path $Path).Path)
  $payload = [ordered]@{}
  foreach ($sheet in @($wb.Worksheets)) {
    $payload[$sheet.Name] = @(Read-WorksheetRows $sheet)
  }
  $json = $payload | ConvertTo-Json -Depth 6 -Compress:$false
  [System.IO.File]::WriteAllText($OutJson, $json, [System.Text.UTF8Encoding]::new($false))
} finally {
  if ($wb) { $wb.Close($false) | Out-Null }
  if ($app) { $app.Quit() | Out-Null }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
