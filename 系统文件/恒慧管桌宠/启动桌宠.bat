@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "runtime\electron.exe" (
  echo Missing runtime\electron.exe
  echo Run pack-dist.ps1 on a machine that has vendor\electron, or unpack Electron into runtime\
  pause
  exit /b 1
)
start "" "runtime\electron.exe" "%~dp0app"
