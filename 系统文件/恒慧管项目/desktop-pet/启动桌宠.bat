@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "vendor\electron\electron.exe" (
  echo 未找到 Electron。请先让 AI 下载 vendor，或本机执行 npm install ^&^& npm start
  pause
  exit /b 1
)
start "" "vendor\electron\electron.exe" .
