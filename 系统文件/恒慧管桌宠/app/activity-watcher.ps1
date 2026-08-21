# 全局键鼠活动探测（无需管理员）。向 stdout 输出：k=按键 m=鼠标移动
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PetAct {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  public struct POINT { public int X; public int Y; }
}
"@

$lastX = -1
$lastY = -1
$vkList = @(8, 9, 13, 16, 17, 18, 32, 46) + 48..90 + 186..192 + 219..222

while ($true) {
  $key = $false
  foreach ($vk in $vkList) {
    if ([PetAct]::GetAsyncKeyState($vk) -band 0x8000) {
      $key = $true
      break
    }
  }

  $point = New-Object PetAct+POINT
  [void][PetAct]::GetCursorPos([ref]$point)
  $mouse = ($lastX -ge 0) -and (($point.X -ne $lastX) -or ($point.Y -ne $lastY))
  $lastX = $point.X
  $lastY = $point.Y

  if ($key) {
    Write-Output 'k'
  } elseif ($mouse) {
    Write-Output 'm'
  }
  Start-Sleep -Milliseconds 90
}
