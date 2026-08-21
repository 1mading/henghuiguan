@echo off
REM Open meeting-room wall display (ASCII-only to avoid CMD encoding issues)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0打开会议室大屏.ps1"
if errorlevel 1 pause
exit /b %errorlevel%
