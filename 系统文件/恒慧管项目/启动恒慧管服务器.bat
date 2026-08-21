@echo off
chcp 65001 >nul
title 恒慧管 - 本地服务器
cd /d "%~dp0server"

echo.
echo  恒慧管本地服务器
echo  ==================
echo  数据目录: %~dp0server\data\
echo  按 Ctrl+C 可停止服务
echo.

REM 本机未安装独立 Node.js/npm 时，启动脚本改用 node 直跑（不依赖 npm）
set "NODE_EXE="

where node >nul 2>&1
if %ERRORLEVEL%==0 (
  for /f "delims=" %%i in ('where node 2^>nul') do (
    set "NODE_EXE=%%i"
    goto :run
  )
)

if exist "D:\工具文件\cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=D:\工具文件\cursor\resources\app\resources\helpers\node.exe"
  goto :run
)
if exist "%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe"
  goto :run
)
if exist "%ProgramFiles%\cursor\resources\app\resources\helpers\node.exe" (
  set "NODE_EXE=%ProgramFiles%\cursor\resources\app\resources\helpers\node.exe"
  goto :run
)

echo [错误] 未找到 node.exe，无法启动服务。
echo.
echo 原因说明:
echo   原脚本使用 "npm start"，但本机没有安装 Node.js / npm，
echo   双击后窗口会立刻关闭，看起来像“没用”。
echo.
echo 解决办法（二选一）:
echo   1. 安装 Node.js LTS: https://nodejs.org/  （推荐）
echo   2. 确认已安装 Cursor，本脚本可回退使用 Cursor 自带 node
echo.
pause
exit /b 1

:run
echo  使用 Node: %NODE_EXE%
echo.
"%NODE_EXE%" src\index.js
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [错误] 服务启动失败，退出码 %EXIT_CODE%
  pause
)
exit /b %EXIT_CODE%
